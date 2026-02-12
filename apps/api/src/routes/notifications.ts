import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/db.js';

const patchSchema = z.object({
  timezone: z.string().optional(),
  quiet_hours: z.any().optional(),
  no_due_nudge: z.any().optional(),
  default_due_offsets: z.any().optional(),
  enabled_types: z.any().optional()
});

const DEFAULT_SETTINGS = {
  timezone: 'Europe/Helsinki',
  quiet_hours: { enabled: false, from: '22:00', to: '08:00' },
  no_due_nudge: { enabled: true, hour: 10 },
  default_due_offsets: [60 * 60, 24 * 60 * 60], // seconds: 1h, 1d
  enabled_types: {
    assigned: true,
    deadline: true,
    overdue: true,
    comment: true,
    trial: true
  }
};

export async function notificationRoutes(app: FastifyInstance) {
  app.get('/me/notifications/settings', async (req: any) => {
    const existing = await prisma.reminderSettings.findUnique({ where: { user_id: req.auth.user.id } });
    if (!existing) return { ok: true, settings: DEFAULT_SETTINGS };
    return {
      ok: true,
      settings: {
        timezone: existing.timezone,
        quiet_hours: existing.quiet_hours ?? DEFAULT_SETTINGS.quiet_hours,
        no_due_nudge: existing.no_due_nudge ?? DEFAULT_SETTINGS.no_due_nudge,
        default_due_offsets: existing.default_due_offsets ?? DEFAULT_SETTINGS.default_due_offsets,
        enabled_types: existing.enabled_types ?? DEFAULT_SETTINGS.enabled_types
      }
    };
  });

  app.patch('/me/notifications/settings', async (req: any) => {
    const body = patchSchema.parse(req.body ?? {});
    const current = await prisma.reminderSettings.findUnique({ where: { user_id: req.auth.user.id } });
    if (!current) {
      const created = await prisma.reminderSettings.create({
        data: {
          user_id: req.auth.user.id,
          timezone: body.timezone ?? DEFAULT_SETTINGS.timezone,
          quiet_hours: body.quiet_hours ?? DEFAULT_SETTINGS.quiet_hours,
          no_due_nudge: body.no_due_nudge ?? DEFAULT_SETTINGS.no_due_nudge,
          default_due_offsets: body.default_due_offsets ?? DEFAULT_SETTINGS.default_due_offsets,
          enabled_types: body.enabled_types ?? DEFAULT_SETTINGS.enabled_types
        }
      });
      return { ok: true, settings: created };
    }

    const updated = await prisma.reminderSettings.update({
      where: { user_id: req.auth.user.id },
      data: {
        timezone: body.timezone ?? undefined,
        quiet_hours: body.quiet_hours ?? undefined,
        no_due_nudge: body.no_due_nudge ?? undefined,
        default_due_offsets: body.default_due_offsets ?? undefined,
        enabled_types: body.enabled_types ?? undefined
      }
    });
    return { ok: true, settings: updated };
  });
}
