import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { canEditPlanning, getProjectAccess } from '@/lib/rbac';
import { fail, handle, ok } from '@/lib/api';
import { audit } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    await getProjectAccess(user, id);

    const [tasks, dependencies] = await Promise.all([
      prisma.task.findMany({
        where: { projectId: id },
        include: { owner: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: [{ sortOrder: 'asc' }, { startDate: 'asc' }],
      }),
      prisma.taskDependency.findMany({ where: { predecessor: { projectId: id } } }),
    ]);

    return ok({ tasks, dependencies });
  });
}

/** Création d'une tâche, d'un lot ou d'un jalon — chef de projet uniquement (§4.2.4). */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const access = await getProjectAccess(user, id);
    if (!canEditPlanning(access.role)) return fail(403, 'Seul le chef de projet peut modifier le planning.');

    const body = await request.json();
    const name = String(body.name ?? '').trim();
    if (!name) return fail(400, 'Le nom de la tâche est obligatoire.');

    const startDate = new Date(body.startDate);
    const endDate = body.isMilestone ? startDate : new Date(body.endDate ?? body.startDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return fail(400, 'Dates invalides.');
    if (endDate < startDate) return fail(400, 'La date de fin précède la date de début.');

    if (body.parentId) {
      const parent = await prisma.task.findFirst({ where: { id: body.parentId, projectId: id }, select: { id: true } });
      if (!parent) return fail(400, "La tâche parente n'appartient pas au projet.");
    }

    const last = await prisma.task.findFirst({
      where: { projectId: id, parentId: body.parentId || null },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const task = await prisma.task.create({
      data: {
        projectId: id,
        parentId: body.parentId || null,
        name,
        description: body.description ? String(body.description).trim() : null,
        ownerId: body.ownerId || null,
        startDate,
        endDate,
        progress: Math.min(100, Math.max(0, Number(body.progress ?? 0))),
        status: body.status ?? 'TODO',
        isMilestone: Boolean(body.isMilestone),
        sortOrder: (last?.sortOrder ?? 0) + 10,
      },
    });

    await audit({ userId: user.id, action: 'task.create', entity: 'Task', entityId: task.id, meta: { projectId: id } });
    return ok({ task }, 201);
  });
}
