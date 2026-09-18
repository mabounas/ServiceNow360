import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { assertTicketAssignable, canAssignTicket, canEditTicketContent, isStaff, requireTicketAccess } from '@/lib/rbac';
import { fail, handle, ok } from '@/lib/api';
import { computeSlaDueDates } from '@/lib/sla';
import { audit } from '@/lib/audit';
import { notifyTicketUpdate } from '@/lib/notify';
import { PRIORITY_LABEL, SEVERITY_LABEL, fullName } from '@/lib/labels';
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
 * Suppression définitive d'un ticket et de tout son historique (commentaires,
 * journal des changements, pièces jointes — supprimés en cascade).
 *
 * Réservée à l'administrateur, et interdite une fois le ticket clôturé : un
 * ticket clôturé fait partie de l'historique contractuel du projet.
 */
export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    if (!user.isAdmin) return fail(403, 'Seul un administrateur peut supprimer un ticket.');

    const { id } = await params;
    const { ticket } = await requireTicketAccess(user, id);
    if (ticket.status === 'CLOSED') {
      return fail(409, 'Un ticket clôturé ne peut pas être supprimé.');
    }

    await prisma.$transaction([
      // Les notifications ne référencent le ticket que par leur lien : on les retire aussi.
      prisma.notification.deleteMany({ where: { link: `/app/tickets/${id}` } }),
      prisma.ticket.delete({ where: { id } }),
    ]);

    // La trace de la suppression elle-même est conservée dans le journal d'audit.
    await audit({
      userId: user.id,
      action: 'ticket.delete',
      entity: 'Ticket',
      entityId: id,
      meta: { reference: ticket.reference, title: ticket.title, status: ticket.status, projectId: ticket.projectId },
    });

    return ok({ ok: true, projectId: ticket.projectId });
  });
}

const CONTENT_FIELDS = {
  title: { label: 'titre', max: 200, required: true },
  description: { label: 'description', max: 20_000, required: true },
  moduleName: { label: 'module', max: 200 },
  subCategory: { label: 'sous-catégorie', max: 120 },
  environmentName: { label: 'environnement', max: 120 },
  reproSteps: { label: 'étapes de reproduction', max: 20_000 },
  businessJustification: { label: 'justification métier', max: 20_000 },
  expectedBenefit: { label: 'bénéfice attendu', max: 20_000 },
  businessUrgency: { label: 'urgence business', max: 120 },
  estimatedBudget: { label: 'budget envisagé', max: 120 },
} as const;

/** Champs que l'équipe peut aussi reclasser lors de la qualification. */
const TRIAGE_FIELDS = new Set(['moduleName', 'subCategory', 'environmentName']);

/**
 * Mise à jour d'un ticket.
 *
 * - Contenu déclaré (titre, description, champs du formulaire) : créateur,
 *   superviseur, chef de projet ou administrateur, tant que le ticket n'est pas
 *   clôturé. Le module, la sous-catégorie et l'environnement restent aussi
 *   modifiables par l'équipe technique pour le tri.
 * - Qualification (priorité, sévérité, chiffrage, assignation, tâche liée) :
 *   équipe projet uniquement.
 */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const { ticket, role, ctx } = await requireTicketAccess(user, id);
    const body = await request.json();

    const staff = isStaff(role);
    const contentAllowed = canEditTicketContent(role, ctx, ticket.status);
    const data: Prisma.TicketUpdateInput = {};
    const events: { field: string; fromValue: string | null; toValue: string | null; note?: string }[] = [];

    // ── Contenu ──
    for (const [key, rule] of Object.entries(CONTENT_FIELDS) as [keyof typeof CONTENT_FIELDS, (typeof CONTENT_FIELDS)[keyof typeof CONTENT_FIELDS]][]) {
      if (body[key] === undefined) continue;
      const value = String(body[key] ?? '').trim();
      const previous = (ticket as Record<string, unknown>)[key] as string | null;
      // Une valeur renvoyée à l'identique n'est pas une modification.
      if ((previous ?? '') === value) continue;
      const allowed = contentAllowed || (staff && TRIAGE_FIELDS.has(key) && ticket.status !== 'CLOSED');
      if (!allowed) {
        return fail(
          403,
          ticket.status === 'CLOSED'
            ? 'Un ticket clôturé ne peut plus être modifié.'
            : 'Vous ne pouvez pas modifier le contenu de ce ticket.',
        );
      }
      if ('required' in rule && rule.required && !value) return fail(400, `Le champ ${rule.label} est obligatoire.`);
      if (value.length > rule.max) return fail(400, `Le champ ${rule.label} est trop long.`);
      (data as Record<string, unknown>)[key] = value || null;
      const short = (v: string | null) => (v && v.length > 80 ? `${v.slice(0, 80)}…` : v);
      events.push({ field: key, fromValue: short(previous), toValue: short(value || null), note: `${rule.label} modifié` });
    }

    // ── Qualification ──
    const triage = ['priority', 'severity', 'estimateDays', 'estimateCost', 'taskId'].some((k) => body[k] !== undefined);
    if (triage && !staff) return fail(403, 'Seule l’équipe projet peut modifier la qualification du ticket.');
    // Affectation : équipe projet et superviseur, jamais sur un ticket terminé.
    if (body.assigneeId !== undefined && (body.assigneeId || null) !== ticket.assigneeId) {
      if (!canAssignTicket(role)) return fail(403, 'Vous ne pouvez pas affecter ce ticket.');
      if (ticket.status === 'CLOSED') return fail(409, 'Un ticket clôturé ne peut plus être réaffecté.');
    }

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
    if (body.estimateDays !== undefined) data.estimateDays = body.estimateDays === '' ? null : Number(body.estimateDays);
    if (body.estimateCost !== undefined) data.estimateCost = body.estimateCost === '' ? null : Number(body.estimateCost);

    if (body.assigneeId !== undefined) {
      const assigneeId = body.assigneeId || null;
      if (assigneeId) {
        await assertTicketAssignable(ticket.projectId, assigneeId);
        data.assignee = { connect: { id: assigneeId } };
      } else {
        data.assignee = { disconnect: true };
      }
      if (assigneeId !== ticket.assigneeId) {
        events.push({ field: 'assignee', fromValue: ticket.assigneeId, toValue: assigneeId });
      }
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
      if (taskId !== ticket.taskId) {
        events.push({ field: 'task', fromValue: ticket.taskId, toValue: taskId });
      }
    }

    if (Object.keys(data).length === 0) return ok({ ticket });

    const updated = await prisma.ticket.update({ where: { id }, data });
    if (events.length) {
      await prisma.ticketEvent.createMany({
        data: events.map((e) => ({ ticketId: id, actorId: user.id, ...e })),
      });
    }
    await audit({ userId: user.id, action: 'ticket.update', entity: 'Ticket', entityId: id, meta: { fields: events.map((e) => e.field) } });

    if (events.length) {
      const lines: string[] = [];
      for (const e of events) {
        if (e.field === 'priority') lines.push(`Priorité : ${PRIORITY_LABEL[e.toValue as keyof typeof PRIORITY_LABEL] ?? e.toValue}`);
        else if (e.field === 'severity') lines.push(`Sévérité : ${e.toValue ? SEVERITY_LABEL[e.toValue as keyof typeof SEVERITY_LABEL] : '—'}`);
        else if (e.field === 'assignee') {
          const who = e.toValue ? await prisma.user.findUnique({ where: { id: e.toValue }, select: { firstName: true, lastName: true } }) : null;
          lines.push(who ? `Pris en charge par : ${fullName(who)}` : 'Affectation retirée');
        } else if (e.field === 'task') {
          const task = e.toValue ? await prisma.task.findUnique({ where: { id: e.toValue }, select: { name: true } }) : null;
          lines.push(task ? `Rattaché à la tâche du planning : ${task.name}` : 'Tâche du planning détachée');
        } else if (e.field === 'estimateDays') lines.push(`Charge estimée : ${e.toValue ?? '—'} j`);
        else if (e.field === 'estimateCost') lines.push(`Coût estimé : ${e.toValue ?? '—'}`);
        else lines.push(e.note ?? `${e.field} modifié`);
      }
      const assigned = events.find((e) => e.field === 'assignee');
      await notifyTicketUpdate({
        ticket: updated,
        actor: user,
        headline: assigned?.toValue && events.length === 1 ? 'Prise en charge' : 'Ticket mis à jour',
        lines,
      });
    }

    return ok({ ticket: updated });
  });
}
