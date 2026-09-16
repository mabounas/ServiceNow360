import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { HttpError, type SessionUser } from './auth';
import type { EffectiveRole } from './workflow';

export type ProjectAccess = {
  projectId: string;
  role: EffectiveRole;
};

/**
 * Cloisonnement multi-projet (§2.3, §5.2, §6.3) : un utilisateur n'accède
 * qu'aux projets auxquels il est explicitement affecté. L'administrateur
 * voit tous les projets.
 */
export async function getProjectAccess(
  user: SessionUser,
  projectId: string,
): Promise<ProjectAccess> {
  if (user.isAdmin) {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) throw new HttpError(404, 'Projet introuvable.');
    return { projectId, role: 'ADMIN' };
  }

  if (user.status !== 'ACTIVE') {
    throw new HttpError(403, "Votre compte est en attente de validation par l'administrateur.");
  }

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
    select: { role: true },
  });
  if (!member) throw new HttpError(404, 'Projet introuvable.');
  return { projectId, role: member.role };
}

/** Projets visibles par l'utilisateur, avec son rôle sur chacun. */
export async function listAccessibleProjects(user: SessionUser) {
  if (user.isAdmin) {
    const projects = await prisma.project.findMany({
      where: { archived: false },
      orderBy: { createdAt: 'desc' },
    });
    return projects.map((p) => ({ project: p, role: 'ADMIN' as EffectiveRole }));
  }
  if (user.status !== 'ACTIVE') return [];

  const memberships = await prisma.projectMember.findMany({
    where: { userId: user.id, project: { archived: false } },
    include: { project: true },
    orderBy: { project: { createdAt: 'desc' } },
  });
  return memberships.map((m) => ({ project: m.project, role: m.role as EffectiveRole }));
}

export function isStaff(role: EffectiveRole) {
  return role === 'ADMIN' || role === 'PROJECT_MANAGER' || role === 'TECHNICIAN';
}

/** Écriture sur le planning : chef de projet et administrateur uniquement (§4.2.4). */
export function canEditPlanning(role: EffectiveRole) {
  return role === 'ADMIN' || role === 'PROJECT_MANAGER';
}

export function canManageMembers(user: SessionUser, role: EffectiveRole) {
  return user.isAdmin || role === 'PROJECT_MANAGER';
}

/**
 * Filtre Prisma traduisant le tableau de visibilité §2.5.
 *
 * - MEMBER      : uniquement les tickets qu'il a créés, dont il suit l'avancement ;
 *                 il peut en déclarer de nouveaux
 * - SUPERVISOR  : tous les tickets du projet
 * - TECHNICIAN  : les tickets qui lui sont assignés, plus la file non assignée
 *                 en début de circuit (sans quoi personne ne peut qualifier)
 * - PROJECT_MANAGER / ADMIN : tous les tickets du projet
 */
export function ticketScope(projectId: string, role: EffectiveRole, userId: string): Prisma.TicketWhereInput {
  const base: Prisma.TicketWhereInput = { projectId };

  switch (role) {
    case 'ADMIN':
    case 'PROJECT_MANAGER':
    case 'SUPERVISOR':
      return base;
    case 'TECHNICIAN':
      return {
        ...base,
        OR: [
          { assigneeId: userId },
          { assigneeId: null, status: { in: ['NEW', 'IN_QUALIFICATION', 'SUBMITTED', 'IN_ANALYSIS'] } },
        ],
      };
    case 'MEMBER':
    default:
      return { ...base, createdById: userId };
  }
}

/** Vérifie l'accès à un ticket précis et renvoie le contexte d'acteur. */
export async function requireTicketAccess(user: SessionUser, ticketId: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      project: true,
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true, company: true } },
      assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
      task: { select: { id: true, name: true } },
    },
  });
  if (!ticket) throw new HttpError(404, 'Ticket introuvable.');

  const access = await getProjectAccess(user, ticket.projectId);
  const visible = await prisma.ticket.findFirst({
    where: { AND: [{ id: ticketId }, ticketScope(ticket.projectId, access.role, user.id)] },
    select: { id: true },
  });
  if (!visible) throw new HttpError(403, "Vous n'avez pas accès à ce ticket.");

  return {
    ticket,
    role: access.role,
    ctx: {
      role: access.role,
      isCreator: ticket.createdById === user.id,
      isAssignee: ticket.assigneeId === user.id,
    },
  };
}
