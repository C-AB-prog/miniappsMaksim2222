import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { isActive } from '../lib/subscription.js';
import { logEvent } from '../lib/events.js';

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

    // v2 stub: replace with OpenAI. Keep format stable.
    const assistantText = `Понял. Чтобы помочь по бизнесу, уточни:
1) Какая ниша/рынок?
2) Что сейчас болит сильнее всего (продажи/маркетинг/операционка/финансы)?
3) Какой желаемый результат и срок?`;

    const msg = await prisma.assistantMessage.create({ data: { thread_id: thread.id, role: 'assistant', content: assistantText, meta: { kind: 'wizard_prompt' } } });

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
