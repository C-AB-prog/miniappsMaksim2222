import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { isActive } from '../lib/subscription.js';
import { logEvent } from '../lib/events.js';
import { enqueueNotify } from '../lib/queue.js';
import { scheduleDueReminders } from '../lib/reminders.js';

const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  priority: z.enum(['low','medium','high','urgent']).optional(),
  status: z.enum(['todo','in_progress','done','canceled']).optional(),
  due_at: z.string().datetime().optional().nullable(),
  assigned_to_user_id: z.string().uuid().optional().nullable()
});

const patchTaskSchema = createTaskSchema.partial();

async function assertMember(focusId: string, userId: string) {
  const member = await prisma.focusMember.findUnique({ where: { focus_id_user_id: { focus_id: focusId, user_id: userId } } });
  return member;
}

export async function taskRoutes(app: FastifyInstance) {
  app.get('/focuses/:id/tasks', async (req: any, reply) => {
    const focusId = String(req.params.id);
    const member = await assertMember(focusId, req.auth.user.id);
    if (!member) return reply.code(403).send({ ok: false, error: 'forbidden' });

    const q = req.query ?? {};
    const assigned = q.assigned === 'all' ? 'all' : 'me';
    const where: any = { focus_id: focusId };
    if (assigned === 'me') where.assigned_to_user_id = req.auth.user.id;
    if (q.status) where.status = q.status;
    if (q.priority) where.priority = q.priority;

    const tasks = await prisma.task.findMany({
      where,
      orderBy: [{ due_at: 'asc' }, { created_at: 'desc' }],
      include: { subtasks: true, comments: true }
    });
    return { ok: true, tasks };
  });

  app.post('/focuses/:id/tasks', async (req: any, reply) => {
    const active = await isActive(req.auth.user.id);
    if (!active) return reply.code(402).send({ ok: false, error: 'trial_expired' });

    const focusId = String(req.params.id);
    const member = await assertMember(focusId, req.auth.user.id);
    if (!member) return reply.code(403).send({ ok: false, error: 'forbidden' });
    if (member.role !== 'owner') return reply.code(403).send({ ok: false, error: 'owner_only' });

    const body = createTaskSchema.parse(req.body);
    const task = await prisma.task.create({
      data: {
        focus_id: focusId,
        created_by_user_id: req.auth.user.id,
        title: body.title,
        description: body.description ?? null,
        priority: body.priority ?? 'medium',
        status: body.status ?? 'todo',
        due_at: body.due_at ? new Date(body.due_at) : null,
        assigned_to_user_id: body.assigned_to_user_id ?? null
      }
    });

    // Notifications: assignment + due reminders
    if (task.assigned_to_user_id) {
      const assignee = await prisma.user.findUnique({ where: { id: task.assigned_to_user_id } });
      if (assignee) {
        await prisma.notificationLog.create({
          data: {
            user_id: task.assigned_to_user_id,
            type: 'assigned',
            status: 'queued',
            payload: { task_id: task.id, focus_id: focusId }
          }
        });
        await enqueueNotify({
          userId: task.assigned_to_user_id,
          tg_id: assignee.tg_id.toString(),
          type: 'assigned',
          text: `📌 Новая задача: ${task.title}`,
          payload: { taskId: task.id }
        });
      }
    }
    if (task.assigned_to_user_id && task.due_at) {
      await scheduleDueReminders({
        taskId: task.id,
        assignedUserId: task.assigned_to_user_id,
        dueAt: task.due_at,
        textBase: `📌 Задача: ${task.title}`
      });
    }

    await logEvent({ event_name: 'create_task', user_id: req.auth.user.id, focus_id: focusId, props: { task_id: task.id } });
    return { ok: true, task };
  });

  app.patch('/tasks/:id', async (req: any, reply) => {
    const active = await isActive(req.auth.user.id);
    if (!active) return reply.code(402).send({ ok: false, error: 'trial_expired' });

    const taskId = String(req.params.id);
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return reply.code(404).send({ ok: false, error: 'not_found' });

    const member = await assertMember(task.focus_id, req.auth.user.id);
    if (!member) return reply.code(403).send({ ok: false, error: 'forbidden' });

    const body = patchTaskSchema.parse(req.body);

    // ACL: owner can edit everything; member only their assigned task + limited fields
    if (member.role !== 'owner') {
      if (task.assigned_to_user_id !== req.auth.user.id) return reply.code(403).send({ ok: false, error: 'not_assignee' });
      const allowed: any = {};
      if (body.status) allowed.status = body.status;
      if (body.due_at !== undefined) allowed.due_at = body.due_at ? new Date(body.due_at) : null;
      if (body.description !== undefined) allowed.description = body.description;
      // title/priority/assignee blocked for members
      const updated = await prisma.task.update({ where: { id: taskId }, data: allowed });
      return { ok: true, task: updated };
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        title: body.title ?? undefined,
        description: body.description ?? undefined,
        priority: body.priority ?? undefined,
        status: body.status ?? undefined,
        due_at: body.due_at === undefined ? undefined : body.due_at ? new Date(body.due_at) : null,
        assigned_to_user_id: body.assigned_to_user_id ?? undefined
      }
    });

    // Notify on re-assign or due change
    if (updated.assigned_to_user_id && updated.assigned_to_user_id !== task.assigned_to_user_id) {
      const assignee = await prisma.user.findUnique({ where: { id: updated.assigned_to_user_id } });
      if (assignee) {
        await prisma.notificationLog.create({
          data: {
            user_id: updated.assigned_to_user_id,
            type: 'assigned',
            status: 'queued',
            payload: { task_id: updated.id, focus_id: updated.focus_id }
          }
        });
        await enqueueNotify({
          userId: updated.assigned_to_user_id,
          tg_id: assignee.tg_id.toString(),
          type: 'assigned',
          text: `📌 Тебе назначили задачу: ${updated.title}`,
          payload: { taskId: updated.id }
        });
      }
    }
    if (updated.assigned_to_user_id && updated.due_at && (!task.due_at || updated.due_at.getTime() !== task.due_at.getTime())) {
      await scheduleDueReminders({
        taskId: updated.id,
        assignedUserId: updated.assigned_to_user_id,
        dueAt: updated.due_at,
        textBase: `📌 Задача: ${updated.title}`
      });
    }

    return { ok: true, task: updated };
  });
}
