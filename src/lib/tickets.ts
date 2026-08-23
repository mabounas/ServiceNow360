import type { Prisma, Severity, TicketStatus, TicketType } from '@prisma/client';
import { prisma } from './prisma';
import { HttpError, type SessionUser } from './auth';
import { getProjectAccess } from './rbac';
import { computeSlaDueDates } from './sla';
import { TICKET_PREFIX, TICKET_STATUS_LABEL, TICKET_TYPE_SHORT } from './labels';
import { canTransition, initialStatus, type ActorContext } from './workflow';
import { notify, ticketAudience } from './notify';
import { audit } from './audit';

/** Numérotation unique par type : INC-0001 / EVO-0001 / DEM-0001 (§3.3.1). */
async function nextReference(tx: Prisma.TransactionClient, type: TicketType) {
  const prefix = TICKET_PREFIX[type];
  const counter = await tx.counter.upsert({
    where: { id: prefix },
    create: { id: prefix, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${prefix}-${String(counter.value).padStart(4, '0')}`;
}

export type CreateTicketInput = {
  projectId: string;
  type: TicketType;
  title: string;
  description: string;
  moduleName?: string | null;
  subCategory?: string | null;
  environmentName?: string | null;
  severity?: Severity | null;
  reproSteps?: string | null;
  businessJustification?: string | null;
  expectedBenefit?: string | null;
  businessUrgency?: string | null;
  estimatedBudget?: string | null;
  attachments?: { fileName: string; mimeType: string; size: number; data: string }[];
};

const SEVERITY_TO_PRIORITY: Record<Severity, 'P1' | 'P2' | 'P3' | 'P4'> = {
  BLOCKING: 'P1',
  MAJOR: 'P2',
  MINOR: 'P3',
  COSMETIC: 'P4',
};

export async function createTicket(user: SessionUser, input: CreateTicketInput) {
  await getProjectAccess(user, input.projectId);

  if (!input.title?.trim()) throw new HttpError(400, 'Le titre est obligatoire.');
  if (!input.description?.trim()) throw new HttpError(400, 'La description est obligatoire.');
  if (input.type === 'INCIDENT' && !input.severity) {
    throw new HttpError(400, 'La sévérité est obligatoire pour un incident.');
  }

  const now = new Date();
  const sla = input.type === 'INCIDENT' ? computeSlaDueDates(input.severity, now) : { slaFirstResponseDue: null, slaResolutionDue: null };

  const ticket = await prisma.$transaction(async (tx) => {
    const reference = await nextReference(tx, input.type);
    const created = await tx.ticket.create({
      data: {
        reference,
        projectId: input.projectId,
        type: input.type,
        status: initialStatus(input.type),
        title: input.title.trim(),
        description: input.description.trim(),
        moduleName: input.moduleName?.trim() || null,
        subCategory: input.subCategory?.trim() || null,
        environmentName: input.type === 'INCIDENT' ? input.environmentName?.trim() || null : null,
        severity: input.type === 'INCIDENT' ? input.severity ?? null : null,
        priority: input.type === 'INCIDENT' && input.severity ? SEVERITY_TO_PRIORITY[input.severity] : 'P3',
        reproSteps: input.type === 'INCIDENT' ? input.reproSteps?.trim() || null : null,
        businessJustification: input.type === 'INCIDENT' ? null : input.businessJustification?.trim() || null,
        expectedBenefit: input.type === 'INCIDENT' ? null : input.expectedBenefit?.trim() || null,
        businessUrgency: input.type === 'INCIDENT' ? null : input.businessUrgency?.trim() || null,
        estimatedBudget: input.type === 'INCIDENT' ? null : input.estimatedBudget?.trim() || null,
        createdById: user.id,
        ...sla,
      },
    });

    if (input.attachments?.length) {
      await tx.attachment.createMany({
        data: input.attachments.map((a) => ({
          ticketId: created.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          size: a.size,
          data: a.data,
          uploadedById: user.id,
        })),
      });
    }

    await tx.ticketEvent.create({
      data: {
        ticketId: created.id,
        actorId: user.id,
        field: 'created',
        toValue: created.status,
        note: `Ticket ${created.reference} créé.`,
      },
    });

    return created;
  });

  // Accusé de réception à l'initiateur + information de l'équipe projet (§3.3.3).
  const audience = await ticketAudience(input.projectId, ticket);
  await notify({
    userIds: audience,
    title: `${ticket.reference} — ${TICKET_TYPE_SHORT[ticket.type]} enregistré`,
    body: `${ticket.title}\nStatut : ${TICKET_STATUS_LABEL[ticket.status]}`,
    link: `/app/tickets/${ticket.id}`,
  });

  await audit({ userId: user.id, action: 'ticket.create', entity: 'Ticket', entityId: ticket.id, meta: { reference: ticket.reference } });

  return ticket;
}

export type TransitionInput = {
  to: TicketStatus;
  note?: string | null;
  assigneeId?: string | null;
  estimateDays?: number | null;
  estimateCost?: number | null;
};

/**
 * Applique un changement de statut en vérifiant le workflow du type de ticket
 * et les droits de l'acteur, puis journalise et notifie.
 */
export async function applyTransition(
  user: SessionUser,
  ticketId: string,
  ctx: ActorContext,
  input: TransitionInput,
) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new HttpError(404, 'Ticket introuvable.');

  const transition = canTransition(ticket.type, ticket.status, input.to, ctx);
  if (!transition) {
    throw new HttpError(403, "Cette transition n'est pas autorisée pour votre rôle depuis ce statut.");
  }
  if (transition.requiresNote && !input.note?.trim()) {
    throw new HttpError(400, 'Un motif est obligatoire pour cette transition.');
  }
  if (input.to === 'ASSIGNED' && !input.assigneeId && !ticket.assigneeId) {
    throw new HttpError(400, 'Sélectionnez le technicien à qui assigner le ticket.');
  }
  if (input.to === 'ESTIMATED' && input.estimateDays == null && ticket.estimateDays == null) {
    throw new HttpError(400, 'Renseignez la charge estimée avant de passer au statut « Chiffrée ».');
  }

  const now = new Date();
  const data: Prisma.TicketUpdateInput = { status: input.to };

  if (input.assigneeId !== undefined && input.assigneeId !== null) {
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: ticket.projectId, userId: input.assigneeId } },
      select: { id: true },
    });
    const isAdmin = await prisma.user.findFirst({ where: { id: input.assigneeId, isAdmin: true }, select: { id: true } });
    if (!member && !isAdmin) throw new HttpError(400, "Ce destinataire n'est pas affecté au projet.");
    data.assignee = { connect: { id: input.assigneeId } };
  }
  if (input.estimateDays != null) data.estimateDays = input.estimateDays;
  if (input.estimateCost != null) data.estimateCost = input.estimateCost;
  if (input.to === 'ESTIMATED' || input.to === 'PENDING_ARBITRATION') {
    if (input.note?.trim()) data.arbitrationNote = input.note.trim();
  }

  // Jalons de mesure des SLA.
  if (!ticket.firstResponseAt && input.to !== 'NEW' && input.to !== 'SUBMITTED') data.firstResponseAt = now;
  if (input.to === 'RESOLVED' || input.to === 'DELIVERED') data.resolvedAt = now;
  if (input.to === 'CLOSED') data.closedAt = now;
  if (input.to === 'IN_PROGRESS' || input.to === 'IN_DEVELOPMENT') {
    data.resolvedAt = null;
    data.closedAt = null;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.ticket.update({ where: { id: ticketId }, data });

    await tx.ticketEvent.create({
      data: {
        ticketId,
        actorId: user.id,
        field: 'status',
        fromValue: ticket.status,
        toValue: input.to,
        note: input.note?.trim() || null,
      },
    });

    if (input.assigneeId && input.assigneeId !== ticket.assigneeId) {
      await tx.ticketEvent.create({
        data: {
          ticketId,
          actorId: user.id,
          field: 'assignee',
          fromValue: ticket.assigneeId,
          toValue: input.assigneeId,
        },
      });
    }

    // §4.2.4 — une demande acceptée génère la tâche correspondante au planning.
    if (input.to === 'ACCEPTED_PLANNED' && !result.taskId) {
      const start = new Date(now);
      const days = Math.max(1, Math.round(result.estimateDays ?? 5));
      const end = new Date(start.getTime() + (days - 1) * 86_400_000);
      const last = await tx.task.findFirst({
        where: { projectId: result.projectId, parentId: null },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      const task = await tx.task.create({
        data: {
          projectId: result.projectId,
          name: `${result.reference} — ${result.title}`,
          description: result.description,
          startDate: start,
          endDate: end,
          status: 'TODO',
          sortOrder: (last?.sortOrder ?? 0) + 10,
        },
      });
      await tx.ticket.update({ where: { id: ticketId }, data: { taskId: task.id } });
      await tx.ticketEvent.create({
        data: { ticketId, actorId: user.id, field: 'task', toValue: task.id, note: `Tâche « ${task.name} » créée au planning.` },
      });
      return { ...result, taskId: task.id };
    }

    return result;
  });

  const audience = await ticketAudience(ticket.projectId, updated);
  await notify({
    userIds: audience,
    title: `${updated.reference} — ${TICKET_STATUS_LABEL[input.to]}`,
    body: input.note?.trim()
      ? `${updated.title}\n${input.note.trim()}`
      : `${updated.title}\nNouveau statut : ${TICKET_STATUS_LABEL[input.to]}`,
    link: `/app/tickets/${updated.id}`,
  });

  await audit({
    userId: user.id,
    action: 'ticket.transition',
    entity: 'Ticket',
    entityId: ticketId,
    meta: { from: ticket.status, to: input.to },
  });

  return updated;
}
