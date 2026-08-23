import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getProjectAccess } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { buildTicketWhere, TICKET_LIST_INCLUDE } from '@/lib/ticketQuery';
import {
  PRIORITY_LABEL,
  SEVERITY_LABEL,
  TICKET_STATUS_LABEL,
  TICKET_TYPE_SHORT,
  formatDate,
  fullName,
} from '@/lib/labels';
import { SLA_STATE_LABEL, SLA_STATE_TONE, slaState } from '@/lib/sla';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TicketsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const { role } = await getProjectAccess(user, id);

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === 'string' && value) query.set(key, value);
  }

  const [tickets, members] = await Promise.all([
    prisma.ticket.findMany({
      where: buildTicketWhere(id, role, user.id, query),
      include: TICKET_LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
    prisma.projectMember.findMany({
      where: { projectId: id },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    }),
  ]);

  const value = (key: string) => (typeof sp[key] === 'string' ? (sp[key] as string) : '');

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">Module 1 — Portail des anomalies</div>
          <h1 className="page-title">Tickets</h1>
        </div>
        <div className="page-actions">
          <Link href={`/app/projets/${id}/tickets/nouveau`} className="btn btn-primary">
            Déclarer un ticket
          </Link>
          <a href={`/api/projects/${id}/export?dataset=tickets&${query.toString()}`} className="btn btn-secondary">
            Exporter (CSV)
          </a>
        </div>
      </div>

      <form className="filters no-print" method="get">
        <div className="field">
          <label htmlFor="f-q">Recherche</label>
          <input className="input" id="f-q" name="q" defaultValue={value('q')} placeholder="Référence, titre, description" />
        </div>
        <div className="field">
          <label htmlFor="f-type">Type</label>
          <select className="input" id="f-type" name="type" defaultValue={value('type')}>
            <option value="">Tous</option>
            <option value="INCIDENT">Incident</option>
            <option value="EVOLUTION">Évolution</option>
            <option value="DEMANDE">Nouvelle demande</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-status">Statut</label>
          <select className="input" id="f-status" name="status" defaultValue={value('status')}>
            <option value="">Tous</option>
            <option value="open">Non clôturés</option>
            {Object.entries(TICKET_STATUS_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-severity">Sévérité</label>
          <select className="input" id="f-severity" name="severity" defaultValue={value('severity')}>
            <option value="">Toutes</option>
            {Object.entries(SEVERITY_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-priority">Priorité</label>
          <select className="input" id="f-priority" name="priority" defaultValue={value('priority')}>
            <option value="">Toutes</option>
            {Object.entries(PRIORITY_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-assignee">Assigné à</label>
          <select className="input" id="f-assignee" name="assignee" defaultValue={value('assignee')}>
            <option value="">Tous</option>
            <option value="none">Non assigné</option>
            {members.map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {fullName(m.user)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-module">Module</label>
          <input className="input" id="f-module" name="module" defaultValue={value('module')} />
        </div>
        <div className="field">
          <label htmlFor="f-from">Créé du</label>
          <input className="input" id="f-from" name="from" type="date" defaultValue={value('from')} />
        </div>
        <div className="field">
          <label htmlFor="f-to">au</label>
          <input className="input" id="f-to" name="to" type="date" defaultValue={value('to')} />
        </div>
        <div className="field" style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <button type="submit" className="btn btn-primary">
            Filtrer
          </button>
          <Link href={`/app/projets/${id}/tickets`} className="btn btn-secondary">
            Réinitialiser
          </Link>
        </div>
      </form>

      <div className="panel">
        <div className="panel-head">
          <h3 className="panel-title">{tickets.length} ticket(s)</h3>
          <span className="small muted">
            {role === 'USER'
              ? 'Vous voyez uniquement les tickets que vous avez déclarés.'
              : role === 'TECHNICIAN'
                ? 'Vous voyez les tickets qui vous sont assignés et la file à qualifier.'
                : 'Vous voyez tous les tickets du projet.'}
          </span>
        </div>
        <div className="panel-body panel-body-flush table-wrap">
          {tickets.length === 0 ? (
            <div className="empty">Aucun ticket ne correspond à ces critères.</div>
          ) : (
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Type</th>
                  <th>Titre</th>
                  <th>Statut</th>
                  <th>Sévérité</th>
                  <th>Initiateur</th>
                  <th>Assigné à</th>
                  <th>Créé le</th>
                  <th>SLA</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => {
                  const state = slaState(t);
                  return (
                    <tr key={t.id}>
                      <td className="mono nowrap">
                        <Link href={`/app/tickets/${t.id}`}>{t.reference}</Link>
                      </td>
                      <td className="small nowrap">{TICKET_TYPE_SHORT[t.type]}</td>
                      <td>{t.title}</td>
                      <td className="small nowrap">{TICKET_STATUS_LABEL[t.status]}</td>
                      <td className="small nowrap">{t.severity ? SEVERITY_LABEL[t.severity] : '—'}</td>
                      <td className="small nowrap">{fullName(t.createdBy)}</td>
                      <td className="small nowrap">{t.assignee ? fullName(t.assignee) : '—'}</td>
                      <td className="small nowrap mono">{formatDate(t.createdAt)}</td>
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
    </>
  );
}
