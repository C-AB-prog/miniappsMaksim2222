import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { isActive } from '../lib/subscription.js';

const createKpiSchema = z.object({
  name: z.string().min(1),
  unit: z.string().optional().nullable(),
  target_value: z.number().optional().nullable(),
  current_value: z.number().optional().nullable()
});

const patchKpiSchema = createKpiSchema.partial();

async function assertMember(focusId: string, userId: string) {
  return prisma.focusMember.findUnique({
    where: { focus_id_user_id: { focus_id: focusId, user_id: userId } }
  });
}

export async function kpiRoutes(app: FastifyInstance) {
  app.get('/focuses/:id/kpis', async (req: any, reply) => {
    const focusId = String(req.params.id);
    const member = await assertMember(focusId, req.auth.user.id);
    if (!member) return reply.code(403).send({ ok: false, error: 'forbidden' });
    const kpis = await prisma.kPI.findMany({ where: { focus_id: focusId }, orderBy: { updated_at: 'desc' } });
    return { ok: true, kpis };
  });

  app.post('/focuses/:id/kpis', async (req: any, reply) => {
    const active = await isActive(req.auth.user.id);
    if (!active) return reply.code(402).send({ ok: false, error: 'trial_expired' });

    const focusId = String(req.params.id);
    const member = await assertMember(focusId, req.auth.user.id);
    if (!member) return reply.code(403).send({ ok: false, error: 'forbidden' });
    if (member.role !== 'owner') return reply.code(403).send({ ok: false, error: 'owner_only' });

    const body = createKpiSchema.parse(req.body);
    const kpi = await prisma.kPI.create({
      data: {
        focus_id: focusId,
        name: body.name,
        unit: body.unit ?? null,
        target_value: body.target_value ?? null,
        current_value: body.current_value ?? null
      }
    });
    return { ok: true, kpi };
  });

  app.patch('/kpis/:id', async (req: any, reply) => {
    const active = await isActive(req.auth.user.id);
    if (!active) return reply.code(402).send({ ok: false, error: 'trial_expired' });

    const id = String(req.params.id);
    const kpi = await prisma.kPI.findUnique({ where: { id } });
    if (!kpi) return reply.code(404).send({ ok: false, error: 'not_found' });

    const member = await assertMember(kpi.focus_id, req.auth.user.id);
    if (!member) return reply.code(403).send({ ok: false, error: 'forbidden' });
    if (member.role !== 'owner') return reply.code(403).send({ ok: false, error: 'owner_only' });

    const body = patchKpiSchema.parse(req.body);
    const updated = await prisma.kPI.update({
      where: { id },
      data: {
        name: body.name ?? undefined,
        unit: body.unit ?? undefined,
        target_value: body.target_value ?? undefined,
        current_value: body.current_value ?? undefined
      }
    });
    return { ok: true, kpi: updated };
  });
}
