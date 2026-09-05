import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { getProjectAccess } from '@/lib/rbac';
import { csvResponse, fail, handle, toCsv } from '@/lib/api';
import { buildTicketWhere, TICKET_LIST_INCLUDE } from '@/lib/ticketQuery';
import {
  PRIORITY_LABEL,
  SEVERITY_LABEL,
  TASK_STATUS_LABEL,
  TICKET_STATUS_LABEL,
  TICKET_TYPE_SHORT,
  formatDate,
  formatDateTime,
  fullName,
} from '@/lib/labels';
import { slaState, SLA_STATE_LABEL } from '@/lib/sla';
import { buildPlanWorkbook } from '@/lib/planExport';

type Params = { params: Promise<{ id: string }> };

/** §3.4 / §4.2.3 — export des données pour reporting (CSV exploitable dans Excel). */
export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const access = await getProjectAccess(user, id);
    const url = new URL(request.url);
    const dataset = url.searchParams.get('dataset') ?? 'tickets';

    const project = await prisma.project.findUnique({ where: { id }, select: { code: true } });
    const stamp = new Date().toISOString().slice(0, 10);

    if (dataset === 'tickets') {
      const tickets = await prisma.ticket.findMany({
        where: buildTicketWhere(id, access.role, user.id, url.searchParams),
        include: TICKET_LIST_INCLUDE,
        orderBy: { createdAt: 'desc' },
      });

      const rows = tickets.map((t) => ({
        reference: t.reference,
        type: TICKET_TYPE_SHORT[t.type],
        titre: t.title,
        statut: TICKET_STATUS_LABEL[t.status],
        severite: t.severity ? SEVERITY_LABEL[t.severity] : '',
        priorite: PRIORITY_LABEL[t.priority],
        module: t.moduleName ?? '',
        environnement: t.environmentName ?? '',
        initiateur: fullName(t.createdBy),
        societe: t.createdBy.company,
        assigne: t.assignee ? fullName(t.assignee) : '',
        creation: formatDateTime(t.createdAt),
        echeanceSla: formatDateTime(t.slaResolutionDue),
        etatSla: SLA_STATE_LABEL[slaState(t)],
        resolution: formatDateTime(t.resolvedAt),
        cloture: formatDateTime(t.closedAt),
        satisfaction: t.satisfactionRating ?? '',
      }));

      return csvResponse(
        `tickets-${project?.code ?? id}-${stamp}.csv`,
        toCsv(rows, [
          { key: 'reference', label: 'Référence' },
          { key: 'type', label: 'Type' },
          { key: 'titre', label: 'Titre' },
          { key: 'statut', label: 'Statut' },
          { key: 'severite', label: 'Sévérité' },
          { key: 'priorite', label: 'Priorité' },
          { key: 'module', label: 'Module' },
          { key: 'environnement', label: 'Environnement' },
          { key: 'initiateur', label: 'Initiateur' },
          { key: 'societe', label: 'Société' },
          { key: 'assigne', label: 'Assigné à' },
          { key: 'creation', label: 'Création' },
          { key: 'echeanceSla', label: 'Échéance SLA' },
          { key: 'etatSla', label: 'État SLA' },
          { key: 'resolution', label: 'Résolution' },
          { key: 'cloture', label: 'Clôture' },
          { key: 'satisfaction', label: 'Satisfaction /5' },
        ]),
      );
    }

    if (dataset === 'tasks' && url.searchParams.get('format') === 'xlsx') {
      const [full, tasks] = await Promise.all([
        prisma.project.findUnique({ where: { id }, select: { code: true, name: true, clientName: true } }),
        prisma.task.findMany({
          where: { projectId: id },
          include: { owner: { select: { firstName: true, lastName: true } } },
          orderBy: [{ sortOrder: 'asc' }],
        }),
      ]);
      if (!full) return fail(404, 'Projet introuvable.');

      const workbook = await buildPlanWorkbook(
        full,
        tasks.map((t) => ({
          id: t.id,
          parentId: t.parentId,
          name: t.name,
          description: t.description,
          ownerName: t.owner ? fullName(t.owner) : null,
          startDate: t.startDate,
          endDate: t.endDate,
          progress: t.progress,
          status: t.status,
          isMilestone: t.isMilestone,
          sortOrder: t.sortOrder,
        })),
      );

      return new Response(new Uint8Array(workbook), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="planning-${full.code}-${stamp}.xlsx"`,
        },
      });
    }

    if (dataset === 'tasks') {
      const tasks = await prisma.task.findMany({
        where: { projectId: id },
        include: { owner: { select: { firstName: true, lastName: true } }, parent: { select: { name: true } } },
        orderBy: [{ sortOrder: 'asc' }],
      });

      const rows = tasks.map((t) => ({
        nom: t.name,
        parent: t.parent?.name ?? '',
        type: t.isMilestone ? 'Jalon' : 'Tâche',
        responsable: t.owner ? fullName(t.owner) : '',
        debut: formatDate(t.startDate),
        fin: formatDate(t.endDate),
        avancement: `${t.progress} %`,
        statut: TASK_STATUS_LABEL[t.status],
      }));

      return csvResponse(
        `planning-${project?.code ?? id}-${stamp}.csv`,
        toCsv(rows, [
          { key: 'nom', label: 'Tâche' },
          { key: 'parent', label: 'Rattachée à' },
          { key: 'type', label: 'Type' },
          { key: 'responsable', label: 'Responsable' },
          { key: 'debut', label: 'Début' },
          { key: 'fin', label: 'Fin' },
          { key: 'avancement', label: 'Avancement' },
          { key: 'statut', label: 'Statut' },
        ]),
      );
    }

    return fail(400, 'Jeu de données inconnu.');
  });
}
