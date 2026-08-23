import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { canEditPlanning, getProjectAccess } from '@/lib/rbac';
import { fail, handle, ok } from '@/lib/api';
import { audit } from '@/lib/audit';
import type { Prisma } from '@prisma/client';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return fail(404, 'Tâche introuvable.');

    const access = await getProjectAccess(user, task.projectId);
    if (!canEditPlanning(access.role)) return fail(403, 'Seul le chef de projet peut modifier le planning.');

    const body = await request.json();
    const data: Prisma.TaskUpdateInput = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return fail(400, 'Le nom de la tâche est obligatoire.');
      data.name = name;
    }
    if (body.description !== undefined) data.description = String(body.description).trim() || null;
    const progress = body.progress !== undefined ? Math.min(100, Math.max(0, Number(body.progress))) : task.progress;
    if (body.progress !== undefined) data.progress = progress;
    if (body.status !== undefined) data.status = body.status;
    if (body.isMilestone !== undefined) data.isMilestone = Boolean(body.isMilestone);
    if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder);

    if (body.ownerId !== undefined) {
      data.owner = body.ownerId ? { connect: { id: body.ownerId } } : { disconnect: true };
    }

    let start = task.startDate;
    let end = task.endDate;
    if (body.startDate !== undefined) {
      start = new Date(body.startDate);
      if (Number.isNaN(start.getTime())) return fail(400, 'Date de début invalide.');
      data.startDate = start;
    }
    if (body.endDate !== undefined) {
      end = new Date(body.endDate);
      if (Number.isNaN(end.getTime())) return fail(400, 'Date de fin invalide.');
      data.endDate = end;
    }
    if (end < start) return fail(400, 'La date de fin précède la date de début.');

    // Un jalon est ponctuel : fin = début.
    if ((body.isMilestone ?? task.isMilestone) === true) data.endDate = data.startDate ?? start;

    // Cohérence du statut avec l'avancement saisi.
    if (body.status === undefined) {
      if (progress >= 100) data.status = 'DONE';
      else if (progress > 0) data.status = 'IN_PROGRESS';
    }

    const updated = await prisma.task.update({ where: { id }, data });
    await audit({ userId: user.id, action: 'task.update', entity: 'Task', entityId: id });
    return ok({ task: updated });
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return fail(404, 'Tâche introuvable.');

    const access = await getProjectAccess(user, task.projectId);
    if (!canEditPlanning(access.role)) return fail(403, 'Seul le chef de projet peut modifier le planning.');

    await prisma.task.delete({ where: { id } });
    await audit({ userId: user.id, action: 'task.delete', entity: 'Task', entityId: id });
    return ok({ ok: true });
  });
}
