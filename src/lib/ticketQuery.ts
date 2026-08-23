import type { Prisma, Priority, Severity, TicketStatus, TicketType } from '@prisma/client';
import { ticketScope } from './rbac';
import type { EffectiveRole } from './workflow';

/** Filtres de la liste des tickets (§3.3.2), appliqués par-dessus le cloisonnement. */
export function buildTicketWhere(
  projectId: string,
  role: EffectiveRole,
  userId: string,
  params: URLSearchParams,
): Prisma.TicketWhereInput {
  const filters: Prisma.TicketWhereInput[] = [ticketScope(projectId, role, userId)];

  const type = params.get('type');
  if (type) filters.push({ type: type as TicketType });

  const status = params.get('status');
  if (status === 'open') filters.push({ status: { notIn: ['CLOSED', 'REJECTED', 'REFUSED'] } });
  else if (status) filters.push({ status: status as TicketStatus });

  const severity = params.get('severity');
  if (severity) filters.push({ severity: severity as Severity });

  const priority = params.get('priority');
  if (priority) filters.push({ priority: priority as Priority });

  const moduleName = params.get('module');
  if (moduleName) filters.push({ moduleName: { contains: moduleName, mode: 'insensitive' } });

  const assignee = params.get('assignee');
  if (assignee === 'none') filters.push({ assigneeId: null });
  else if (assignee) filters.push({ assigneeId: assignee });

  const author = params.get('author');
  if (author) filters.push({ createdById: author });

  const from = params.get('from');
  if (from) filters.push({ createdAt: { gte: new Date(from) } });

  const to = params.get('to');
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    filters.push({ createdAt: { lte: end } });
  }

  const q = params.get('q')?.trim();
  if (q) {
    filters.push({
      OR: [
        { reference: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ],
    });
  }

  return { AND: filters };
}

export const TICKET_LIST_INCLUDE = {
  createdBy: { select: { id: true, firstName: true, lastName: true, company: true } },
  assignee: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.TicketInclude;
