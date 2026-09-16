import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getProjectAccess } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { MEETING_INCLUDE, archiveFilter } from '@/lib/meetings';
import { formatDate, formatDateTime, fullName } from '@/lib/labels';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const VIEWS = [
  { key: 'active', label: 'Actifs' },
  { key: 'archived', label: 'Archivés' },
  { key: 'all', label: 'Tous' },
] as const;

/** Tous les PV de réunion du projet, toutes tâches confondues. */
export default async function ProjectMeetingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const { id } = await params;
  await getProjectAccess(user, id);
  const sp = await searchParams;
  const view = typeof sp.archive === 'string' ? sp.archive : 'active';
  const taskFilter = typeof sp.task === 'string' ? sp.task : '';

  const [meetings, counts, tasksWithMeetings] = await Promise.all([
    prisma.meetingMinute.findMany({
      where: { projectId: id, ...(taskFilter ? { taskName: taskFilter } : {}), ...archiveFilter(view) },
      include: MEETING_INCLUDE,
      orderBy: { meetingDate: 'desc' },
    }),
    prisma.meetingMinute.groupBy({ by: ['archived'], where: { projectId: id }, _count: { _all: true } }),
    prisma.meetingMinute.findMany({
      where: { projectId: id },
      distinct: ['taskName'],
      select: { taskName: true },
      orderBy: { taskName: 'asc' },
    }),
  ]);

  const active = counts.find((c) => !c.archived)?._count._all ?? 0;
  const archived = counts.find((c) => c.archived)?._count._all ?? 0;
  const countFor = { active, archived, all: active + archived } as Record<string, number>;
  const href = (archive: string, task = taskFilter) =>
    `/app/projets/${id}/reunions?archive=${archive}${task ? `&task=${encodeURIComponent(task)}` : ''}`;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">Module 2 — Suivi de projet</div>
          <h1 className="page-title">Réunions de suivi</h1>
        </div>
        <div className="page-actions">
          <Link href={`/app/projets/${id}/planning`} className="btn btn-secondary">
            Rédiger un PV depuis le planning
          </Link>
        </div>
      </div>

      <div className="row mb-16" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          {VIEWS.map((v) => (
            <Link key={v.key} href={href(v.key)} className={`btn ${view === v.key ? 'btn-primary' : 'btn-secondary'}`}>
              {v.label} ({countFor[v.key]})
            </Link>
          ))}
        </div>
        {tasksWithMeetings.length > 1 ? (
          <form method="get" className="row" style={{ gap: 8 }}>
            <input type="hidden" name="archive" value={view} />
            <select className="input" name="task" defaultValue={taskFilter} style={{ minWidth: 260 }}>
              <option value="">Toutes les tâches</option>
              {tasksWithMeetings.map((t) => (
                <option key={t.taskName} value={t.taskName}>
                  {t.taskName}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-secondary">
              Filtrer
            </button>
          </form>
        ) : null}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3 className="panel-title">{meetings.length} PV</h3>
          <span className="small muted">
            Un PV se rédige depuis le panneau d’une tâche du planning. Il s’archive, il ne se supprime pas.
          </span>
        </div>
        <div className="panel-body panel-body-flush table-wrap">
          {meetings.length === 0 ? (
            <div className="empty">Aucun PV de réunion dans cette vue.</div>
          ) : (
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Réunion</th>
                  <th>Tâche</th>
                  <th>PV</th>
                  <th>Rédigé par</th>
                  <th>Prochaine réunion</th>
                </tr>
              </thead>
              <tbody>
                {meetings.map((m) => (
                  <tr key={m.id} style={m.archived ? { opacity: 0.6 } : undefined}>
                    <td className="small mono nowrap">{formatDateTime(m.meetingDate)}</td>
                    <td className="small">
                      {m.task?.name ?? m.taskName}
                      {!m.taskId ? <div className="muted">(tâche retirée du planning)</div> : null}
                    </td>
                    <td>
                      <Link href={`/app/reunions/${m.id}`}>{m.title}</Link>
                      {m.files.length ? <span className="small muted"> · 📎 {m.files.length}</span> : null}
                      {m.archived ? (
                        <div>
                          <span className="badge badge-neutral mt-8">Archivé le {formatDate(m.archivedAt)}</span>
                        </div>
                      ) : null}
                    </td>
                    <td className="small nowrap">{fullName(m.createdBy)}</td>
                    <td className="small mono nowrap">{m.nextMeeting ? formatDate(m.nextMeeting) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
