import type { Severity, Ticket } from '@prisma/client';

/**
 * Grille de SLA appliquée aux incidents (§3.3.2).
 * Délais exprimés en heures calendaires depuis la création du ticket.
 * Les évolutions et nouvelles demandes sont hors SLA d'incident (§3.2.2).
 */
export const SLA_GRID: Record<Severity, { firstResponseHours: number; resolutionHours: number }> = {
  BLOCKING: { firstResponseHours: 1, resolutionHours: 4 },
  MAJOR: { firstResponseHours: 4, resolutionHours: 24 },
  MINOR: { firstResponseHours: 8, resolutionHours: 72 },
  COSMETIC: { firstResponseHours: 24, resolutionHours: 240 },
};

export function computeSlaDueDates(severity: Severity | null | undefined, from: Date) {
  if (!severity) return { slaFirstResponseDue: null, slaResolutionDue: null };
  const grid = SLA_GRID[severity];
  return {
    slaFirstResponseDue: new Date(from.getTime() + grid.firstResponseHours * 3_600_000),
    slaResolutionDue: new Date(from.getTime() + grid.resolutionHours * 3_600_000),
  };
}

export type SlaState = 'NA' | 'OK' | 'AT_RISK' | 'BREACHED' | 'MET';

type SlaInput = Pick<
  Ticket,
  'type' | 'slaResolutionDue' | 'slaFirstResponseDue' | 'firstResponseAt' | 'resolvedAt' | 'closedAt'
>;

/** État du SLA de résolution, pour la pastille de suivi et les alertes. */
export function slaState(ticket: SlaInput, now = new Date()): SlaState {
  if (ticket.type !== 'INCIDENT' || !ticket.slaResolutionDue) return 'NA';
  const due = new Date(ticket.slaResolutionDue).getTime();
  const done = ticket.resolvedAt ?? ticket.closedAt;

  if (done) return new Date(done).getTime() <= due ? 'MET' : 'BREACHED';

  const remaining = due - now.getTime();
  if (remaining < 0) return 'BREACHED';
  // Alerte d'approche d'échéance : moins de 4 h restantes.
  if (remaining < 4 * 3_600_000) return 'AT_RISK';
  return 'OK';
}

export const SLA_STATE_LABEL: Record<SlaState, string> = {
  NA: 'Hors SLA',
  OK: 'Dans les délais',
  AT_RISK: 'Échéance proche',
  BREACHED: 'SLA dépassé',
  MET: 'SLA respecté',
};

export const SLA_STATE_TONE: Record<SlaState, 'neutral' | 'ok' | 'warn' | 'bad'> = {
  NA: 'neutral',
  OK: 'ok',
  AT_RISK: 'warn',
  BREACHED: 'bad',
  MET: 'ok',
};
