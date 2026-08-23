import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { canEditPlanning, getProjectAccess } from '@/lib/rbac';
import { fail, handle, ok } from '@/lib/api';

type Params = { params: Promise<{ id: string }> };

/** Liens de dépendance entre tâches (§4.2.1). */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const access = await getProjectAccess(user, id);
    if (!canEditPlanning(access.role)) return fail(403, 'Seul le chef de projet peut modifier le planning.');

    const body = await request.json();
    const { predecessorId, successorId } = body;
    if (!predecessorId || !successorId) return fail(400, 'Prédécesseur et successeur sont obligatoires.');
    if (predecessorId === successorId) return fail(400, 'Une tâche ne peut pas dépendre d’elle-même.');

    const tasks = await prisma.task.findMany({
      where: { id: { in: [predecessorId, successorId] }, projectId: id },
      select: { id: true },
    });
    if (tasks.length !== 2) return fail(400, 'Les deux tâches doivent appartenir au projet.');

    // Refus des cycles : le prédécesseur ne doit pas déjà dépendre du successeur.
    const all = await prisma.taskDependency.findMany({
      where: { predecessor: { projectId: id } },
      select: { predecessorId: true, successorId: true },
    });
    const reachable = new Set<string>([successorId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const dep of all) {
        if (reachable.has(dep.predecessorId) && !reachable.has(dep.successorId)) {
          reachable.add(dep.successorId);
          changed = true;
        }
      }
    }
    if (reachable.has(predecessorId)) return fail(400, 'Ce lien créerait un cycle dans le planning.');

    const dependency = await prisma.taskDependency.upsert({
      where: { predecessorId_successorId: { predecessorId, successorId } },
      create: { predecessorId, successorId, type: body.type ?? 'FS', lagDays: Number(body.lagDays ?? 0) },
      update: { type: body.type ?? 'FS', lagDays: Number(body.lagDays ?? 0) },
    });

    return ok({ dependency }, 201);
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const access = await getProjectAccess(user, id);
    if (!canEditPlanning(access.role)) return fail(403, 'Seul le chef de projet peut modifier le planning.');

    const dependencyId = new URL(request.url).searchParams.get('dependencyId');
    if (!dependencyId) return fail(400, 'Identifiant de dépendance manquant.');

    const dependency = await prisma.taskDependency.findFirst({
      where: { id: dependencyId, predecessor: { projectId: id } },
      select: { id: true },
    });
    if (!dependency) return fail(404, 'Dépendance introuvable.');

    await prisma.taskDependency.delete({ where: { id: dependencyId } });
    return ok({ ok: true });
  });
}
