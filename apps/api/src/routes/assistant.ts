import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { isActive } from '../lib/subscription.js';
import { logEvent } from '../lib/events.js';
import { callOpenAIJson, OAIMsg } from '../lib/openai.js';

const sendMessageSchema = z.object({
  content: z.string().min(1)
});

const planToTasksSchema = z.object({
  tasks: z.array(z.object({
    title: z.string().min(1),
    description: z.string().optional().nullable(),
    priority: z.enum(['low','medium','high','urgent']).optional(),
    status: z.enum(['todo','in_progress','done','canceled']).optional(),
    due_at: z.string().datetime().optional().nullable(),
    assigned_to_user_id: z.string().uuid().optional().nullable(),
    subtasks: z.array(z.object({ title: z.string().min(1) })).optional()
  }))
});

export async function assistantRoutes(app: FastifyInstance) {
  app.get('/focuses/:id/assistant/thread', async (req: any, reply) => {
    const focusId = String(req.params.id);
    const member = await prisma.focusMember.findUnique({ where: { focus_id_user_id: { focus_id: focusId, user_id: req.auth.user.id } } });
    if (!member) return reply.code(403).send({ ok: false, error: 'forbidden' });
    const thread = await prisma.assistantThread.findFirst({ where: { focus_id: focusId }, orderBy: { created_at: 'asc' } });
    if (!thread) return { ok: true, thread: null, messages: [] };
    const messages = await prisma.assistantMessage.findMany({ where: { thread_id: thread.id }, orderBy: { created_at: 'asc' } });
    return { ok: true, thread, messages };
  });

  app.post('/focuses/:id/assistant/message', async (req: any, reply) => {
    const active = await isActive(req.auth.user.id);
    if (!active) return reply.code(402).send({ ok: false, error: 'trial_expired' });

    const focusId = String(req.params.id);
    const member = await prisma.focusMember.findUnique({ where: { focus_id_user_id: { focus_id: focusId, user_id: req.auth.user.id } } });
    if (!member) return reply.code(403).send({ ok: false, error: 'forbidden' });

    const body = sendMessageSchema.parse(req.body);
    const thread = await prisma.assistantThread.findFirst({ where: { focus_id: focusId }, orderBy: { created_at: 'asc' } });
    if (!thread) return reply.code(500).send({ ok: false, error: 'missing_thread' });

    await prisma.assistantMessage.create({ data: { thread_id: thread.id, role: 'user', content: body.content } });
    await logEvent({ event_name: 'ai_message_sent', user_id: req.auth.user.id, focus_id: focusId });

    // Build context (strictly within focus)
    const focus = await prisma.focus.findUnique({
      where: { id: focusId },
      include: {
        members: { include: { user: true } },
        tasks: { where: { status: { not: 'done' } }, orderBy: { created_at: 'desc' }, take: 25 },
        kpis: true
      }
    });

    const history = await prisma.assistantMessage.findMany({
      where: { thread_id: thread.id },
      orderBy: { created_at: 'asc' },
      take: 24
    });

    const system = `Ты — ИИ бизнес-ассистент. Помогаешь в рамках одного Фокуса (проекта): анализ проблемы, план действий, KPI, задачи.
Правила:
1) Будь практичным: давай конкретные шаги и проверки.
2) Если данных не хватает — задай 2–5 коротких уточняющих вопросов (wizard).
3) Если пользователь просит план/стратегию — верни план и предложи задачи и KPI.
4) Всегда отвечай строго в JSON формате (без markdown), по схеме:
{ "reply": string, "kind": "answer"|"wizard"|"plan", "follow_up_questions"?: string[], "action_plan"?: {"title": string, "steps": [{"title": string, "details"?: string}]}, "tasks"?: [{"title": string, "description"?: string|null, "priority"?: "low"|"medium"|"high"|"urgent", "due_at"?: string|null, "subtasks"?: [{"title": string}]}], "kpis"?: [{"name": string, "unit"?: string|null, "target_value"?: number|null}] }`;

    const focusBrief = focus
      ? {
          id: focus.id,
          title: focus.title,
          description: focus.description,
          stage: focus.stage,
          deadline_at: focus.deadline_at,
          success_metric: focus.success_metric,
          budget: focus.budget,
          niche: focus.niche,
          status: focus.status,
          members: focus.members.map((m) => ({
            role: m.role,
            username: m.user.username,
            user_id: m.user_id
          })),
          open_tasks: focus.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            due_at: t.due_at,
            assigned_to_user_id: t.assigned_to_user_id
          })),
          kpis: focus.kpis
        }
      : null;

    const msgs: OAIMsg[] = [
      { role: 'system', content: system },
      {
        role: 'system',
        content: `Контекст фокуса (JSON): ${JSON.stringify(focusBrief).slice(0, 12000)}`
      }
    ];

    for (const m of history) {
      if (m.role === 'user' || m.role === 'assistant') msgs.push({ role: m.role, content: m.content });
    }

    let oai;
    try {
      oai = await callOpenAIJson(msgs);
    } catch (e: any) {
      await logEvent({ event_name: 'ai_message_failed', user_id: req.auth.user.id, focus_id: focusId, props: { message: String(e?.message ?? e) } });
      return reply.code(500).send({ ok: false, error: 'ai_failed', detail: String(e?.message ?? e) });
    }

    const msg = await prisma.assistantMessage.create({
      data: {
        thread_id: thread.id,
        role: 'assistant',
        content: oai.reply,
        meta: {
          kind: oai.kind ?? 'answer',
          action_plan: oai.action_plan ?? null,
          tasks: oai.tasks ?? null,
          kpis: oai.kpis ?? null,
          follow_up_questions: oai.follow_up_questions ?? null
        }
      }
    });

    return { ok: true, message: msg };
  });

  app.post('/focuses/:id/assistant/plan_to_tasks', async (req: any, reply) => {
    const active = await isActive(req.auth.user.id);
    if (!active) return reply.code(402).send({ ok: false, error: 'trial_expired' });

    const focusId = String(req.params.id);
    const member = await prisma.focusMember.findUnique({ where: { focus_id_user_id: { focus_id: focusId, user_id: req.auth.user.id } } });
    if (!member) return reply.code(403).send({ ok: false, error: 'forbidden' });
    if (member.role !== 'owner') return reply.code(403).send({ ok: false, error: 'owner_only' });

    const body = planToTasksSchema.parse(req.body);

    const created = await prisma.$transaction(async (tx) => {
      const tasks = [] as any[];
      for (const t of body.tasks) {
        const task = await tx.task.create({
          data: {
            focus_id: focusId,
            created_by_user_id: req.auth.user.id,
            title: t.title,
            description: t.description ?? null,
            priority: t.priority ?? 'medium',
            status: t.status ?? 'todo',
            due_at: t.due_at ? new Date(t.due_at) : null,
            assigned_to_user_id: t.assigned_to_user_id ?? null
          }
        });
        if (t.subtasks?.length) {
          await tx.subTask.createMany({
            data: t.subtasks.map(st => ({ task_id: task.id, title: st.title }))
          });
        }
        tasks.push(task);
      }
      return tasks;
    });

    await logEvent({ event_name: 'bulk_tasks_created', user_id: req.auth.user.id, focus_id: focusId, props: { count: created.length } });
    return { ok: true, tasks: created };
  });
}
