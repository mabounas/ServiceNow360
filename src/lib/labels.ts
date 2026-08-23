import type {
  AccountStatus,
  DependencyType,
  Priority,
  ProjectRole,
  RiskStatus,
  Severity,
  TaskStatus,
  TicketStatus,
  TicketType,
} from '@prisma/client';

export const TICKET_TYPE_LABEL: Record<TicketType, string> = {
  INCIDENT: 'Incident / Anomalie',
  EVOLUTION: 'Évolution / Amélioration',
  DEMANDE: 'Nouvelle demande / Nouveau module',
};

export const TICKET_TYPE_SHORT: Record<TicketType, string> = {
  INCIDENT: 'Incident',
  EVOLUTION: 'Évolution',
  DEMANDE: 'Nouvelle demande',
};

export const TICKET_PREFIX: Record<TicketType, string> = {
  INCIDENT: 'INC',
  EVOLUTION: 'EVO',
  DEMANDE: 'DEM',
};

export const TICKET_SUBCATEGORIES: Record<TicketType, string[]> = {
  INCIDENT: ['Bloquant', 'Majeur', 'Mineur', 'Cosmétique'],
  EVOLUTION: ['Amélioration fonctionnelle', 'Amélioration technique'],
  DEMANDE: ['Nouveau module', 'Extension de périmètre'],
};

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  NEW: 'Nouveau',
  IN_QUALIFICATION: 'En qualification',
  ASSIGNED: 'Assigné',
  IN_PROGRESS: 'En cours de traitement',
  WAITING_INFO: "En attente d'information",
  RESOLVED: 'Traité — à valider',
  REJECTED: 'Rejeté / Non reproductible',
  SUBMITTED: 'Soumise',
  IN_ANALYSIS: 'En analyse',
  ESTIMATED: 'Chiffrée',
  PENDING_ARBITRATION: "En attente d'arbitrage",
  ACCEPTED_PLANNED: 'Acceptée / Planifiée',
  REFUSED: 'Refusée',
  POSTPONED: 'Reportée',
  IN_DEVELOPMENT: 'En cours de réalisation',
  DELIVERED: 'Livrée',
  CLOSED: 'Clôturé',
};

/** Statuts considérés comme terminés (ni ouverts, ni en cours). */
export const CLOSED_STATUSES: TicketStatus[] = ['CLOSED', 'REJECTED', 'REFUSED'];

export const SEVERITY_LABEL: Record<Severity, string> = {
  BLOCKING: 'Bloquante',
  MAJOR: 'Majeure',
  MINOR: 'Mineure',
  COSMETIC: 'Cosmétique',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  P1: 'P1 — Critique',
  P2: 'P2 — Haute',
  P3: 'P3 — Normale',
  P4: 'P4 — Basse',
};

export const PROJECT_ROLE_LABEL: Record<ProjectRole, string> = {
  USER: 'Utilisateur standard',
  SUPERVISOR: 'Superviseur',
  TECHNICIAN: 'Technicien IT',
  PROJECT_MANAGER: 'Chef de projet',
};

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  PENDING: 'En attente de validation',
  ACTIVE: 'Actif',
  DISABLED: 'Désactivé',
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: 'À faire',
  IN_PROGRESS: 'En cours',
  DONE: 'Terminé',
  LATE: 'En retard',
  BLOCKED: 'Bloqué',
};

export const RISK_STATUS_LABEL: Record<RiskStatus, string> = {
  OPEN: 'Ouvert',
  MITIGATED: 'Maîtrisé',
  CLOSED: 'Clos',
};

export const DEPENDENCY_TYPE_LABEL: Record<DependencyType, string> = {
  FS: 'Fin → Début',
  SS: 'Début → Début',
  FF: 'Fin → Fin',
  SF: 'Début → Fin',
};

export const ENVIRONMENTS = ['Production', 'Recette', 'Développement', 'Formation'];

export function fullName(u: { firstName: string; lastName: string }) {
  return `${u.firstName} ${u.lastName}`.trim();
}

export function formatDate(d: Date | string | null | undefined) {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(d: Date | string | null | undefined) {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDuration(ms: number | null | undefined) {
  if (ms == null) return '—';
  const hours = ms / 3_600_000;
  if (hours < 24) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} j`;
}
