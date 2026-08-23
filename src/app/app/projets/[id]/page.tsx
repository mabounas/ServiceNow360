import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getProjectAccess, ticketScope } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import {
  CLOSED_STATUSES,
  PRIORITY_LABEL,
  SEVERITY_LABEL,
  TICKET_STATUS_LABEL,
  TICKET_TYPE_SHORT,
  formatDate,
  formatDuration,
} from '@/lib/labels';
import { SLA_STATE_LABEL, SLA_STATE_TONE, slaState } from '@/lib/sla';
import { buildTree, lateTasks, rollupProgress, type PlanTask } from '@/lib/planning';

export const dynamic = 'force-dynamic';

const PIPELINE: { status: string; label: string }[] = [
  { status: 'SUBMITTED', label: 'Soumises' },
  { status: 'IN_ANALYSIS', label: 'En analyse' },
  { status: 'ESTIMATED', label: 'Chiffrées' },
  { status: 'PENDING_ARBITRATION', label: 'Arbitrage' },
  { status: 'ACCEPTED_PLANNED', label: 'Acceptées' },
  { status: 'IN_DEVELOPMENT', label: 'En réalisation' },
  { status: 'DELIVERED', label: 'Livrées' },
];

export default async function ProjectDashboard({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { role } = await getProjectAccess(user, id);
  const scope = ticketScope(id, role, user.id);

  const [tickets, tasks] = await Promise.all([
    prisma.ticket.findMany({
      where: scope,
      select: {
        id: true,
        reference: true,
        title: true,
        type: true,
        status: true,
        severity: true,
        priority: true,
        moduleName: true,
        createdAt: true,
        resolvedAt: true,
        closedAt: true,
        firstResponseAt: true,
        slaResolutionDue: true,
        slaFirstResponseDue: true,
        satisfactionRating: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.task.findMany({
      where: { projectId: id },
      orderBy: [{ sortOrder: 'asc' }],
    }),
  ]);

  const open = tickets.filter((t) => !CLOSED_STATUSES.includes(t.status));
  const incidents = tickets.filter((t) => t.type === 'INCIDENT');
  const changes = tickets.filter((t) => t.type !== 'INCIDENT');

  // Délai moyen de traitement (création → résolution ou clôture).
  const treated = tickets.filter((t) => t.resolvedAt ?? t.closedAt);
  const avgDelay =
    treated.length === 0
      ? null
      : treated.reduce((sum, t) => sum + (new Date(t.resolvedAt ?? t.closedAt!).getTime() - new Date(t.createdAt).getTime()), 0) /
        treated.length;

  // Respect des SLA sur les incidents mesurables.
  const slaMeasurable = incidents.filter((t) => t.slaResolutionDue && (t.resolvedAt || t.closedAt));
  const slaMet = slaMeasurable.filter((t) => slaState(t) === 'MET').length;
  const slaRate = slaMeasurable.length ? Math.round((slaMet / slaMeasurable.length) * 100) : null;

  const breached = incidents.filter((t) => {
    const state = slaState(t);
    return state === 'BREACHED' || state === 'AT_RISK';
  });

  const rated = tickets.filter((t) => t.satisfactionRating != null);
  const avgRating = rated.length
    ? (rated.reduce((sum, t) => sum + (t.satisfactionRating ?? 0), 0) / rated.length).toFixed(1)
    : null;

  const byType = (['INCIDENT', 'EVOLUTION', 'DEMANDE'] as const).map((type) => ({
    type,
    total: tickets.filter((t) => t.type === type).length,
    open: open.filter((t) => t.type === type).length,
  }));

  const bySeverity = (['BLOCKING', 'MAJOR', 'MINOR', 'COSMETIC'] as const).map((severity) => ({
    severity,
    count: incidents.filter((t) => t.severity === severity).length,
  }));

  const modules = [...new Set(tickets.map((t) => t.moduleName).filter(Boolean))] as string[];
  const byModule = modules
    .map((m) => ({ module: m, count: tickets.filter((t) => t.moduleName === m).length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const planTasks: PlanTask[] = tasks.map((t) => ({
    id: t.id,
    parentId: t.parentId,
    name: t.name,
    startDate: t.startDate.toISOString(),
    endDate: t.endDate.toISOString(),
    progress: t.progress,
    status: t.status,
    isMilestone: t.isMilestone,
    sortOrder: t.sortOrder,
  }));
  const globalProgress = rollupProgress(planTasks);
  const late = lateTasks(planTasks);
  const phases = buildTree(planTasks).filter((n) => n.depth === 0 && n.hasChildren);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">Module 4 — Tableau de bord</div>
          <h1 className="page-title">Pilotage du projet</h1>
        </div>
        <div className="page-actions">
          <Link href={`/app/projets/${id}/tickets/nouveau`} className="btn btn-primary">
            Déclarer un ticket
          </Link>
          <a href={`/api/projects/${id}/export?dataset=tickets`} className="btn btn-secondary">
            Export tickets (CSV)
          </a>
        </div>
      </div>

      <div className="stat-grid mb-24">
        <div className="stat">
          <div className="stat-value">{open.length}</div>
          <div className="stat-label">tickets en cours sur {tickets.length} au total</div>
        </div>
        <div className="stat">
          <div className="stat-value">{formatDuration(avgDelay)}</div>
          <div className="stat-label">délai moyen de traitement</div>
        </div>
        <div className="stat">
          <div className="stat-value">{slaRate == null ? '—' : `${slaRate} %`}</div>
          <div className="stat-label">de SLA respectés sur les incidents clôturés</div>
        </div>
        <div className="stat">
          <div className="stat-value">{globalProgress} %</div>
          <div className="stat-label">avancement global du planning</div>
        </div>
      </div>

      {breached.length > 0 ? (
        <div className="alert alert-error mb-24">
          <strong>{breached.length} incident(s) en dépassement ou proches de l’échéance SLA.</strong>{' '}
          <Link href={`/app/projets/${id}/tickets?type=INCIDENT&status=open`}>Voir la file des incidents</Link>
        </div>
      ) : null}

      <div className="grid grid-2 gap-24 mb-24">
        <div className="panel">
          <div className="panel-head">
            <h3 className="panel-title">Tickets par type</h3>
            <span className="small muted">total / en cours</span>
          </div>
          <div className="panel-body panel-body-flush">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Type</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">En cours</th>
                </tr>
              </thead>
              <tbody>
                {byType.map((row) => (
                  <tr key={row.type}>
                    <td>
                      <Link href={`/app/projets/${id}/tickets?type=${row.type}`}>{TICKET_TYPE_SHORT[row.type]}</Link>
                    </td>
                    <td className="text-right mono">{row.total}</td>
                    <td className="text-right mono">{row.open}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3 className="panel-title">Incidents par sévérité</h3>
            <span className="small muted">{incidents.length} incident(s)</span>
          </div>
          <div className="panel-body panel-body-flush">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Sévérité</th>
                  <th className="text-right">Nombre</th>
                  <th style={{ width: '45%' }}>Répartition</th>
                </tr>
              </thead>
              <tbody>
                {bySeverity.map((row) => (
                  <tr key={row.severity}>
                    <td>{SEVERITY_LABEL[row.severity]}</td>
                    <td className="text-right mono">{row.count}</td>
                    <td>
                      <div className="progress">
                        <span style={{ width: `${incidents.length ? (row.count / incidents.length) * 100 : 0}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel mb-24">
        <div className="panel-head">
          <h3 className="panel-title">Pipeline des évolutions et nouvelles demandes</h3>
          <span className="small muted">{changes.length} demande(s)</span>
        </div>
        <div className="panel-body panel-body-flush">
          <div className="pipeline">
            {PIPELINE.map((col) => {
              const items = changes.filter((t) => t.status === col.status);
              return (
                <div key={col.status} className="pipeline-col">
                  <h4>
                    {col.label} ({items.length})
                  </h4>
                  {items.slice(0, 6).map((t) => (
                    <Link key={t.id} href={`/app/tickets/${t.id}`} className="pipeline-card">
                      <div className="small mono muted">{t.reference}</div>
                      <div>{t.title}</div>
                    </Link>
                  ))}
                  {items.length === 0 ? <div className="small muted">—</div> : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-2 gap-24 mb-24">
        <div className="panel">
          <div className="panel-head">
            <h3 className="panel-title">Avancement par phase</h3>
            <Link href={`/app/projets/${id}/planning`} className="small">
              Ouvrir le planning
            </Link>
          </div>
          <div className="panel-body panel-body-flush">
            {phases.length === 0 ? (
              <div className="empty">Aucune phase définie dans le planning.</div>
            ) : (
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>Phase</th>
                    <th>Période</th>
                    <th style={{ width: 160 }}>Avancement</th>
                  </tr>
                </thead>
                <tbody>
                  {phases.map(({ task }) => {
                    const subtree = planTasks.filter((t) => t.id === task.id || t.parentId === task.id);
                    const progress = rollupProgress(subtree);
                    return (
                      <tr key={task.id}>
                        <td>{task.name}</td>
                        <td className="small muted nowrap">
                          {formatDate(task.startDate)} → {formatDate(task.endDate)}
                        </td>
                        <td>
                          <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                            <div className="progress" style={{ flex: 1 }}>
                              <span style={{ width: `${progress}%` }} />
                            </div>
                            <span className="small mono">{progress} %</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3 className="panel-title">Tâches en retard</h3>
            <span className="small muted">{late.length} tâche(s)</span>
          </div>
          <div className="panel-body panel-body-flush">
            {late.length === 0 ? (
              <div className="empty">Aucun retard constaté sur le planning.</div>
            ) : (
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>Tâche</th>
                    <th>Échéance</th>
                    <th className="text-right">Retard</th>
                  </tr>
                </thead>
                <tbody>
                  {late.map((task) => {
                    const days = Math.ceil((Date.now() - new Date(task.endDate).getTime()) / 86_400_000);
                    return (
                      <tr key={task.id}>
                        <td>{task.name}</td>
                        <td className="small muted nowrap">{formatDate(task.endDate)}</td>
                        <td className="text-right mono">{days} j</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-2 gap-24">
        <div className="panel">
          <div className="panel-head">
            <h3 className="panel-title">Tickets par module</h3>
            <span className="small muted">{avgRating ? `Satisfaction moyenne : ${avgRating}/5` : 'Satisfaction : —'}</span>
          </div>
          <div className="panel-body panel-body-flush">
            {byModule.length === 0 ? (
              <div className="empty">Aucun module renseigné.</div>
            ) : (
              <table className="table table-compact">
                <tbody>
                  {byModule.map((row) => (
                    <tr key={row.module}>
                      <td>{row.module}</td>
                      <td className="text-right mono" style={{ width: 60 }}>
                        {row.count}
                      </td>
                      <td style={{ width: '50%' }}>
                        <div className="progress">
                          <span style={{ width: `${(row.count / byModule[0].count) * 100}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3 className="panel-title">Derniers tickets</h3>
            <Link href={`/app/projets/${id}/tickets`} className="small">
              Tout voir
            </Link>
          </div>
          <div className="panel-body panel-body-flush">
            {tickets.length === 0 ? (
              <div className="empty">Aucun ticket déclaré.</div>
            ) : (
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Titre</th>
                    <th>Statut</th>
                    <th>SLA</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.slice(0, 8).map((t) => {
                    const state = slaState(t);
                    return (
                      <tr key={t.id}>
                        <td className="mono nowrap">
                          <Link href={`/app/tickets/${t.id}`}>{t.reference}</Link>
                        </td>
                        <td>{t.title}</td>
                        <td className="small">{TICKET_STATUS_LABEL[t.status]}</td>
                        <td>
                          <span className={`badge badge-${SLA_STATE_TONE[state]}`}>{SLA_STATE_LABEL[state]}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <p className="small muted mt-24">
        Priorités suivies : {Object.values(PRIORITY_LABEL).join(' · ')}.
      </p>
    </>
  );
}
