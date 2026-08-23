import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { isStaff, requireTicketAccess } from '@/lib/rbac';
import { fail, handle, ok } from '@/lib/api';
import { computeSlaDueDates } from '@/lib/sla';
import { audit } from '@/lib/audit';
import type { Prisma } from '@prisma/client';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const { ticket, role } = await requireTicketAccess(user, id);
    return ok({ ticket, role });
  });
}

/**
 * Mise à jour des champs de qualification (priorité, sévérité, module, assignation
 * directe, rattachement à une tâche du planning). Réservée à l'équipe projet.
 */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const { ticket, role } = await requireTicketAccess(user, id);
    if (!isStaff(role)) return fail(403, 'Seule l’équipe projet peut modifier la qualification du ticket.');

    const body = await request.json();
    const data: Prisma.TicketUpdateInput = {};
    const events: { field: string; fromValue: string | null; toValue: string | null }[] = [];

    if (body.priority && body.priority !== ticket.priority) {
      data.priority = body.priority;
      events.push({ field: 'priority', fromValue: ticket.priority, toValue: body.priority });
    }
    if (body.severity && body.severity !== ticket.severity) {
      data.severity = body.severity;
      events.push({ field: 'severity', fromValue: ticket.severity, toValue: body.severity });
      // La grille de SLA dépend de la sévérité : on recalcule les échéances.
      if (ticket.type === 'INCIDENT') {
        Object.assign(data, computeSlaDueDates(body.severity, ticket.createdAt));
      }
    }
    if (body.moduleName !== undefined) data.moduleName = String(body.moduleName).trim() || null;
    if (body.subCategory !== undefined) data.subCategory = String(body.subCategory).trim() || null;
    if (body.environmentName !== undefined) data.environmentName = String(body.environmentName).trim() || null;
    if (body.estimateDays !== undefined) data.estimateDays = body.estimateDays === '' ? null : Number(body.estimateDays);
    if (body.estimateCost !== undefined) data.estimateCost = body.estimateCost === '' ? null : Number(body.estimateCost);

    if (body.assigneeId !== undefined) {
      const assigneeId = body.assigneeId || null;
      if (assigneeId) {
        const member = await prisma.projectMember.findUnique({
          where: { projectId_userId: { projectId: ticket.projectId, userId: assigneeId } },
          select: { id: true },
        });
        const admin = await prisma.user.findFirst({ where: { id: assigneeId, isAdmin: true }, select: { id: true } });
        if (!member && !admin) return fail(400, "Ce destinataire n'est pas affecté au projet.");
        data.assignee = { connect: { id: assigneeId } };
      } else {
        data.assignee = { disconnect: true };
      }
      events.push({ field: 'assignee', fromValue: ticket.assigneeId, toValue: assigneeId });
    }

    if (body.taskId !== undefined) {
      const taskId = body.taskId || null;
      if (taskId) {
        const task = await prisma.task.findFirst({ where: { id: taskId, projectId: ticket.projectId }, select: { id: true } });
        if (!task) return fail(400, "Cette tâche n'appartient pas au projet.");
        data.task = { connect: { id: taskId } };
      } else {
        data.task = { disconnect: true };
      }
      events.push({ field: 'task', fromValue: ticket.taskId, toValue: taskId });
    }

    if (Object.keys(data).length === 0) return ok({ ticket });

    const updated = await prisma.ticket.update({ where: { id }, data });
    if (events.length) {
      await prisma.ticketEvent.createMany({
        data: events.map((e) => ({ ticketId: id, actorId: user.id, ...e })),
      });
    }
    await audit({ userId: user.id, action: 'ticket.update', entity: 'Ticket', entityId: id, meta: { fields: events.map((e) => e.field) } });

    return ok({ ticket: updated });
  });
}
