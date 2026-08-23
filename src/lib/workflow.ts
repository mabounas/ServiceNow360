import type { TicketStatus, TicketType } from '@prisma/client';

/**
 * Rôle effectif d'un utilisateur sur un projet donné.
 * ADMIN est un rôle global (§2.5 du cahier des charges).
 */
export type EffectiveRole = 'ADMIN' | 'PROJECT_MANAGER' | 'SUPERVISOR' | 'TECHNICIAN' | 'USER';

/** Acteurs autorisés à déclencher une transition. */
type Actor = EffectiveRole | 'CREATOR' | 'ASSIGNEE';

export type Transition = {
  to: TicketStatus;
  label: string;
  by: Actor[];
  /** Impose une note explicative (motif de rejet, arbitrage...). */
  requiresNote?: boolean;
};

const STAFF: Actor[] = ['ADMIN', 'PROJECT_MANAGER', 'TECHNICIAN'];
const GOVERNANCE: Actor[] = ['ADMIN', 'PROJECT_MANAGER', 'SUPERVISOR'];

/** §3.2.1 — cycle de vie des incidents (traitement correctif piloté par SLA). */
const INCIDENT_FLOW: Partial<Record<TicketStatus, Transition[]>> = {
  NEW: [
    { to: 'IN_QUALIFICATION', label: 'Prendre en qualification', by: STAFF },
    { to: 'REJECTED', label: 'Rejeter', by: STAFF, requiresNote: true },
  ],
  IN_QUALIFICATION: [
    { to: 'ASSIGNED', label: 'Assigner à un technicien', by: STAFF },
    { to: 'REJECTED', label: 'Rejeter / non reproductible', by: STAFF, requiresNote: true },
  ],
  ASSIGNED: [
    { to: 'IN_PROGRESS', label: 'Démarrer le traitement', by: [...STAFF, 'ASSIGNEE'] },
    { to: 'WAITING_INFO', label: "Demander un complément d'information", by: [...STAFF, 'ASSIGNEE'], requiresNote: true },
    { to: 'RESOLVED', label: 'Marquer traité', by: [...STAFF, 'ASSIGNEE'] },
  ],
  IN_PROGRESS: [
    { to: 'WAITING_INFO', label: "Demander un complément d'information", by: [...STAFF, 'ASSIGNEE'], requiresNote: true },
    { to: 'RESOLVED', label: 'Marquer traité — réaffecter à l’initiateur', by: [...STAFF, 'ASSIGNEE'] },
    { to: 'REJECTED', label: 'Rejeter / non reproductible', by: STAFF, requiresNote: true },
  ],
  WAITING_INFO: [
    { to: 'IN_PROGRESS', label: 'Répondre et relancer le traitement', by: [...STAFF, 'ASSIGNEE', 'CREATOR'] },
  ],
  RESOLVED: [
    { to: 'CLOSED', label: 'Valider la résolution et clôturer', by: ['CREATOR', 'ADMIN', 'PROJECT_MANAGER', 'SUPERVISOR'] },
    { to: 'IN_PROGRESS', label: 'Rouvrir — la résolution ne convient pas', by: ['CREATOR', 'ADMIN', 'PROJECT_MANAGER'], requiresNote: true },
  ],
  REJECTED: [
    { to: 'CLOSED', label: 'Prendre acte et clôturer', by: ['CREATOR', 'ADMIN', 'PROJECT_MANAGER'] },
    { to: 'IN_QUALIFICATION', label: 'Contester — remettre en qualification', by: ['CREATOR', 'ADMIN', 'PROJECT_MANAGER'], requiresNote: true },
  ],
};

/** §3.2.2 — cycle de vie des évolutions et nouvelles demandes (gouvernance projet). */
const CHANGE_FLOW: Partial<Record<TicketStatus, Transition[]>> = {
  SUBMITTED: [
    { to: 'IN_ANALYSIS', label: "Lancer l'analyse de faisabilité", by: STAFF },
    { to: 'REFUSED', label: 'Refuser', by: GOVERNANCE, requiresNote: true },
  ],
  IN_ANALYSIS: [
    { to: 'ESTIMATED', label: 'Enregistrer le chiffrage', by: STAFF },
    { to: 'REFUSED', label: 'Refuser', by: GOVERNANCE, requiresNote: true },
  ],
  ESTIMATED: [
    { to: 'PENDING_ARBITRATION', label: "Soumettre à l'arbitrage", by: STAFF },
  ],
  PENDING_ARBITRATION: [
    { to: 'ACCEPTED_PLANNED', label: 'Accepter et planifier', by: GOVERNANCE },
    { to: 'POSTPONED', label: 'Reporter à une phase ultérieure', by: GOVERNANCE, requiresNote: true },
    { to: 'REFUSED', label: 'Refuser', by: GOVERNANCE, requiresNote: true },
  ],
  ACCEPTED_PLANNED: [
    { to: 'IN_DEVELOPMENT', label: 'Démarrer la réalisation', by: STAFF },
  ],
  IN_DEVELOPMENT: [
    { to: 'DELIVERED', label: 'Livrer', by: [...STAFF, 'ASSIGNEE'] },
  ],
  DELIVERED: [
    { to: 'CLOSED', label: 'Valider la livraison et clôturer', by: ['CREATOR', 'ADMIN', 'PROJECT_MANAGER', 'SUPERVISOR'] },
    { to: 'IN_DEVELOPMENT', label: 'Rouvrir — la livraison ne convient pas', by: ['CREATOR', 'ADMIN', 'PROJECT_MANAGER'], requiresNote: true },
  ],
  POSTPONED: [
    { to: 'PENDING_ARBITRATION', label: "Remettre à l'arbitrage", by: GOVERNANCE },
  ],
  REFUSED: [
    { to: 'CLOSED', label: 'Prendre acte et clôturer', by: ['CREATOR', 'ADMIN', 'PROJECT_MANAGER'] },
  ],
};

export function initialStatus(type: TicketType): TicketStatus {
  return type === 'INCIDENT' ? 'NEW' : 'SUBMITTED';
}

export function flowFor(type: TicketType) {
  return type === 'INCIDENT' ? INCIDENT_FLOW : CHANGE_FLOW;
}

/** Toutes les transitions déclarées depuis un statut, quel que soit l'acteur. */
export function transitionsFrom(type: TicketType, status: TicketStatus): Transition[] {
  return flowFor(type)[status] ?? [];
}

export type ActorContext = {
  role: EffectiveRole;
  isCreator: boolean;
  isAssignee: boolean;
};

function actorMatches(allowed: Actor[], ctx: ActorContext) {
  return allowed.some((a) => {
    if (a === 'CREATOR') return ctx.isCreator;
    if (a === 'ASSIGNEE') return ctx.isAssignee;
    return a === ctx.role;
  });
}

/** Transitions réellement proposées à l'utilisateur courant. */
export function availableTransitions(
  type: TicketType,
  status: TicketStatus,
  ctx: ActorContext,
): Transition[] {
  return transitionsFrom(type, status).filter((t) => actorMatches(t.by, ctx));
}

export function canTransition(
  type: TicketType,
  from: TicketStatus,
  to: TicketStatus,
  ctx: ActorContext,
): Transition | null {
  return availableTransitions(type, from, ctx).find((t) => t.to === to) ?? null;
}

/** Étapes du workflow, pour l'affichage du fil d'avancement. */
export function workflowSteps(type: TicketType): TicketStatus[] {
  return type === 'INCIDENT'
    ? ['NEW', 'IN_QUALIFICATION', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']
    : ['SUBMITTED', 'IN_ANALYSIS', 'ESTIMATED', 'PENDING_ARBITRATION', 'ACCEPTED_PLANNED', 'IN_DEVELOPMENT', 'DELIVERED', 'CLOSED'];
}
