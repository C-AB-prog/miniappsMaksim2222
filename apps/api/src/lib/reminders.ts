import { prisma } from './db.js';
import { enqueueNotify } from './queue.js';

// Offsets in seconds, relative to due_at. e.g. 3600 => 1h before.
const FALLBACK_OFFSETS = [60 * 60, 24 * 60 * 60];

export async function scheduleDueReminders(opts: {
  taskId: string;
  assignedUserId: string;
  dueAt: Date;
  textBase: string;
}) {
  const settings = await prisma.reminderSettings.findUnique({ where: { user_id: opts.assignedUserId } });
  const enabledTypes: any = settings?.enabled_types ?? { deadline: true, overdue: true };
  if (!enabledTypes.deadline && !enabledTypes.overdue) return;

  const offsets: number[] = Array.isArray(settings?.default_due_offsets)
    ? (settings!.default_due_offsets as any[]).map(Number).filter((n) => Number.isFinite(n) && n > 0)
    : FALLBACK_OFFSETS;

  // pre-deadline reminders
  if (enabledTypes.deadline) {
    for (const sec of offsets) {
      const fireAt = new Date(opts.dueAt.getTime() - sec * 1000);
      if (fireAt.getTime() <= Date.now()) continue;

      const log = await prisma.notificationLog.create({
        data: {
          user_id: opts.assignedUserId,
          type: 'deadline',
          status: 'queued',
          payload: { task_id: opts.taskId, fire_at: fireAt.toISOString(), offset_sec: sec }
        }
      });

      await enqueueNotify(
        {
          userId: opts.assignedUserId,
          type: 'deadline',
          text: `${opts.textBase}\n⏰ Дедлайн скоро (за ${Math.round(sec / 3600)}ч).`,
          payload: { taskId: opts.taskId, notificationLogId: log.id }
        },
        { delayMs: fireAt.getTime() - Date.now() }
      );
    }
  }

  // overdue (at due time)
  if (enabledTypes.overdue) {
    const fireAt = new Date(opts.dueAt.getTime() + 60 * 1000);
    if (fireAt.getTime() > Date.now()) {
      const log = await prisma.notificationLog.create({
        data: {
          user_id: opts.assignedUserId,
          type: 'overdue',
          status: 'queued',
          payload: { task_id: opts.taskId, fire_at: fireAt.toISOString() }
        }
      });

      await enqueueNotify(
        {
          userId: opts.assignedUserId,
          type: 'overdue',
          text: `${opts.textBase}\n⚠️ Просрочено. Проверь статус и следующий шаг.`,
          payload: { taskId: opts.taskId, notificationLogId: log.id }
        },
        { delayMs: fireAt.getTime() - Date.now() }
      );
    }
  }
}
