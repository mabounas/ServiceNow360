import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { canEditPlanning, getProjectAccess } from '@/lib/rbac';
import { fail, handle, ok } from '@/lib/api';
import { audit } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

/**
 * Réordonne une tâche du planning.
 * - `direction: 'up' | 'down'` : échange avec la tâche voisine du même niveau ;
 * - `parentId` (id ou null) : rattache la tâche à une autre phase, en dernière position.
 * Les tâches du niveau concerné sont renumérotées (10, 20, 30…) pour rester stables.
 */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return fail(404, 'Tâche introuvable.');

    const access = await getProjectAccess(user, task.projectId);
    if (!canEditPlanning(access.role)) return fail(403, 'Seul le chef de projet peut modifier le planning.');

    const body = await request.json();
    const all = await prisma.task.findMany({
      where: { projectId: task.projectId },
      select: { id: true, parentId: true, sortOrder: true, startDate: true, isMilestone: true },
    });

    let parentId = task.parentId;
    if (body.parentId !== undefined && (body.parentId || null) !== task.parentId) {
      parentId = body.parentId || null;
      if (parentId) {
        const parent = all.find((t) => t.id === parentId);
        if (!parent) return fail(400, 'Phase introuvable dans ce projet.');
        if (parent.isMilestone) return fail(400, 'Un jalon ne peut pas contenir de tâche.');
        // Interdit de placer une tâche sous elle-même ou sous l'une de ses sous-tâches.
        for (let cur: string | null = parentId; cur; cur = all.find((t) => t.id === cur)?.parentId ?? null) {
          if (cur === task.id) return fail(400, 'Une tâche ne peut pas être rangée dans l’une de ses sous-tâches.');
        }
      }
    }

    const siblings = all
      .filter((t) => t.parentId === parentId && t.id !== task.id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.startDate.getTime() - b.startDate.getTime());

    if (parentId !== task.parentId) {
      siblings.push({ ...task });
    } else {
      const ordered = all
        .filter((t) => t.parentId === parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.startDate.getTime() - b.startDate.getTime());
      const index = ordered.findIndex((t) => t.id === task.id);
      const target = body.direction === 'up' ? index - 1 : body.direction === 'down' ? index + 1 : index;
      if (target < 0 || target >= ordered.length) return fail(400, 'La tâche est déjà à cette extrémité.');
      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
      siblings.splice(0, siblings.length, ...ordered);
    }

    const updates = siblings.map((t, i) => ({ id: t.id, parentId, sortOrder: (i + 1) * 10 }));
    await prisma.$transaction(
      updates.map((u) =>
        prisma.task.update({
          where: { id: u.id },
          data: u.id === task.id ? { sortOrder: u.sortOrder, parentId: u.parentId } : { sortOrder: u.sortOrder },
        }),
      ),
    );

    await audit({
      userId: user.id,
      action: 'task.move',
      entity: 'Task',
      entityId: task.id,
      meta: { projectId: task.projectId, direction: body.direction ?? null, parentId },
    });

    return ok({ tasks: updates });
  });
}
