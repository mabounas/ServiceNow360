import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { canEditPlanning, getProjectAccess } from '@/lib/rbac';
import { fail, handle, ok } from '@/lib/api';

type Params = { params: Promise<{ id: string }> };

/** §4.2.3 — journal des risques et points d'attention. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const access = await getProjectAccess(user, id);
    if (!canEditPlanning(access.role)) return fail(403, 'Seul le chef de projet tient le journal des risques.');

    const body = await request.json();
    const title = String(body.title ?? '').trim();
    if (!title) return fail(400, 'Le libellé du risque est obligatoire.');

    const risk = await prisma.risk.create({
      data: {
        projectId: id,
        title,
        description: body.description ? String(body.description).trim() : null,
        probability: Math.min(4, Math.max(1, Number(body.probability ?? 2))),
        impact: Math.min(4, Math.max(1, Number(body.impact ?? 2))),
        status: body.status ?? 'OPEN',
        ownerId: body.ownerId || null,
        sharedWithClient: body.sharedWithClient !== false,
      },
    });

    return ok({ risk }, 201);
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const access = await getProjectAccess(user, id);
    if (!canEditPlanning(access.role)) return fail(403, 'Seul le chef de projet tient le journal des risques.');

    const body = await request.json();
    const riskId = String(body.id ?? '');
    const existing = await prisma.risk.findFirst({ where: { id: riskId, projectId: id }, select: { id: true } });
    if (!existing) return fail(404, 'Risque introuvable.');

    const risk = await prisma.risk.update({
      where: { id: riskId },
      data: {
        title: body.title !== undefined ? String(body.title).trim() : undefined,
        description: body.description !== undefined ? String(body.description).trim() || null : undefined,
        probability: body.probability !== undefined ? Math.min(4, Math.max(1, Number(body.probability))) : undefined,
        impact: body.impact !== undefined ? Math.min(4, Math.max(1, Number(body.impact))) : undefined,
        status: body.status ?? undefined,
        sharedWithClient: body.sharedWithClient !== undefined ? Boolean(body.sharedWithClient) : undefined,
      },
    });

    return ok({ risk });
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const access = await getProjectAccess(user, id);
    if (!canEditPlanning(access.role)) return fail(403, 'Seul le chef de projet tient le journal des risques.');

    const riskId = new URL(request.url).searchParams.get('riskId');
    if (!riskId) return fail(400, 'Identifiant du risque manquant.');
    const existing = await prisma.risk.findFirst({ where: { id: riskId, projectId: id }, select: { id: true } });
    if (!existing) return fail(404, 'Risque introuvable.');

    await prisma.risk.delete({ where: { id: riskId } });
    return ok({ ok: true });
  });
}
