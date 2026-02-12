import 'dotenv/config';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { Telegraf } from 'telegraf';
import { PrismaClient } from '@prisma/client';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const DATABASE_URL = process.env.DATABASE_URL ?? '';

const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

export const NOTIFICATION_QUEUE = 'notifications';

new Worker(
  NOTIFICATION_QUEUE,
  async (job) => {
    const { tg_id, userTgId, text, type, user_id, userId, payload } = job.data as any;
    const resolvedUserId: string | null = user_id ?? userId ?? null;
    let resolvedTgId: string | null = tg_id ?? userTgId ?? null;

    // Resolve tg_id from DB if missing
    if (!resolvedTgId && resolvedUserId) {
      const u = await prisma.user.findUnique({ where: { id: resolvedUserId } });
      if (u) resolvedTgId = u.tg_id.toString();
    }

    const notificationLogId = payload?.notificationLogId ?? payload?.notification_log_id ?? null;

    try {
      // Quiet hours: if enabled, postpone to next allowed time
      if (resolvedUserId) {
        const settings = await prisma.reminderSettings.findUnique({ where: { user_id: resolvedUserId } });
        const qh: any = settings?.quiet_hours;
        if (qh?.enabled && typeof qh.from === 'string' && typeof qh.to === 'string') {
          const now = new Date();
          const [fh, fm] = qh.from.split(':').map((x: string) => Number(x));
          const [th, tm] = qh.to.split(':').map((x: string) => Number(x));
          if (Number.isFinite(fh) && Number.isFinite(fm) && Number.isFinite(th) && Number.isFinite(tm)) {
            const curMin = now.getHours() * 60 + now.getMinutes();
            const fromMin = fh * 60 + fm;
            const toMin = th * 60 + tm;
            const inQuiet = fromMin < toMin ? curMin >= fromMin && curMin < toMin : curMin >= fromMin || curMin < toMin;
            if (inQuiet) {
              // compute next toMin today/tomorrow
              const next = new Date(now);
              next.setSeconds(0, 0);
              next.setMinutes(tm);
              next.setHours(th);
              if (fromMin < toMin) {
                if (curMin >= toMin) next.setDate(next.getDate() + 1);
              } else {
                // quiet across midnight, to is morning
                if (curMin >= fromMin) next.setDate(next.getDate() + 1);
              }
              const delayMs = Math.max(60_000, next.getTime() - Date.now());
              // re-enqueue as delayed job
              await job.queue.add('send', job.data as any, { delay: delayMs });
              if (notificationLogId) {
                await prisma.notificationLog.update({ where: { id: notificationLogId }, data: { status: 'skipped_quiet_hours' } });
              }
              return { ok: true, postponed: true };
            }
          }
        }
      }

      if (!resolvedTgId) throw new Error('Missing tg_id for notification');

      // ✅ FIX: Telegram Bot API теперь использует link_preview_options
      // Telegraf типы могут ругаться — поэтому cast as any, но API реально работает.
      await bot.telegram.sendMessage(
        Number(resolvedTgId),
        text,
        { link_preview_options: { is_disabled: true } } as any
      );

      if (notificationLogId) {
        await prisma.notificationLog.update({ where: { id: notificationLogId }, data: { status: 'sent', sent_at: new Date() } });
      } else if (resolvedUserId) {
        await prisma.notificationLog.updateMany({ where: { user_id: resolvedUserId, status: 'queued', type }, data: { status: 'sent', sent_at: new Date() } });
      }
      return { ok: true };
    } catch (e: any) {
      const message = String(e?.message ?? e);
      if (notificationLogId) {
        await prisma.notificationLog.update({ where: { id: notificationLogId }, data: { status: 'failed', error: message } }).catch(() => {});
      } else if (resolvedUserId) {
        await prisma.notificationLog.updateMany({ where: { user_id: resolvedUserId, status: 'queued', type }, data: { status: 'failed', error: message } }).catch(() => {});
      }
      throw e;
    }
  },
  { connection: redis }
);

console.log('Worker started. Queue:', NOTIFICATION_QUEUE);

// Example: schedule jobs can be added later from API with BullMQ delayed jobs.
