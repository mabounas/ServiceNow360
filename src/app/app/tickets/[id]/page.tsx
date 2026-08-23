import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { isStaff, requireTicketAccess } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import {
  ENVIRONMENTS,
  PRIORITY_LABEL,
  SEVERITY_LABEL,
  TICKET_STATUS_LABEL,
  TICKET_TYPE_LABEL,
  formatDateTime,
  fullName,
} from '@/lib/labels';
import { SLA_STATE_LABEL, SLA_STATE_TONE, slaState } from '@/lib/sla';
import { availableTransitions, workflowSteps } from '@/lib/workflow';
import TicketActions from '@/components/app/TicketActions';
import TicketQualification from '@/components/app/TicketQualification';
import CommentForm from '@/components/app/CommentForm';
import SatisfactionForm from '@/components/app/SatisfactionForm';

export const dynamic = 'force-dynamic';

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const access = await requireTicketAccess(user, id).catch(() => null);
  if (!access) notFound();
  const { ticket, role, ctx } = access;

  const staff = isStaff(role);

  const [comments, events, attachments, members, tasks] = await Promise.all([
    prisma.ticketComment.findMany({
      where: { ticketId: id, ...(staff ? {} : { internal: false }) },
      include: { author: { select: { firstName: true, lastName: true } }, attachments: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.ticketEvent.findMany({
      where: { ticketId: id },
      include: { actor: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.attachment.findMany({ where: { ticketId: id, commentId: null } }),
    prisma.projectMember.findMany({
      where: { projectId: ticket.projectId },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.task.findMany({ where: { projectId: ticket.projectId }, select: { id: true, name: true }, orderBy: { sortOrder: 'asc' } }),
  ]);

  const transitions = availableTransitions(ticket.type, ticket.status, ctx);
  const steps = workflowSteps(ticket.type);
  const currentStep = steps.indexOf(ticket.status);
  const state = slaState(ticket);

  const memberOptions = members.map((m) => ({ id: m.user.id, name: fullName(m.user) }));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">
            <Link href={`/app/projets/${ticket.projectId}/tickets`} className="link-plain">
              {ticket.project.code} — {ticket.project.name}
            </Link>
          </div>
          <h1 className="page-title">
            <span className="mono">{ticket.reference}</span> — {ticket.title}
          </h1>
        </div>
        <div className="page-actions">
          <span className={`badge badge-${SLA_STATE_TONE[state]}`}>{SLA_STATE_LABEL[state]}</span>
          <span className="badge badge-accent">{TICKET_STATUS_LABEL[ticket.status]}</span>
        </div>
      </div>

      <div className="steps mb-24">
        {steps.map((step, index) => (
          <div
            key={step}
            className={`step ${index < currentStep ? 'is-done' : ''} ${index === currentStep ? 'is-current' : ''}`}
          >
            {TICKET_STATUS_LABEL[step]}
          </div>
        ))}
      </div>

      <div className="grid gap-24" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' }}>
        <div className="stack">
          <div className="panel">
            <div className="panel-head">
              <h3 className="panel-title">{TICKET_TYPE_LABEL[ticket.type]}</h3>
              <span className="small muted">Déclaré le {formatDateTime(ticket.createdAt)}</span>
            </div>
            <div className="panel-body">
              <p className="thread-body">{ticket.description}</p>

              {ticket.reproSteps ? (
                <>
                  <hr className="hr" />
                  <h4 style={{ fontSize: 14 }}>Étapes de reproduction</h4>
                  <p className="thread-body">{ticket.reproSteps}</p>
                </>
              ) : null}

              {ticket.businessJustification ? (
                <>
                  <hr className="hr" />
                  <h4 style={{ fontSize: 14 }}>Justification métier</h4>
                  <p className="thread-body">{ticket.businessJustification}</p>
                </>
              ) : null}

              {ticket.expectedBenefit ? (
                <>
                  <h4 style={{ fontSize: 14, marginTop: 16 }}>Bénéfice attendu</h4>
                  <p className="thread-body">{ticket.expectedBenefit}</p>
                </>
              ) : null}

              {attachments.length > 0 ? (
                <>
                  <hr className="hr" />
                  <h4 style={{ fontSize: 14 }}>Pièces jointes</h4>
                  <ul className="small" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {attachments.map((file) => (
                      <li key={file.id}>
                        <a href={file.data} download={file.fileName}>
                          {file.fileName}
                        </a>{' '}
                        <span className="muted">({Math.round(file.size / 1024)} Ko)</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3 className="panel-title">Fil de discussion</h3>
              <span className="small muted">{comments.length} message(s)</span>
            </div>
            <div className="panel-body">
              {comments.length === 0 ? (
                <div className="small muted">Aucun échange pour le moment.</div>
              ) : (
                <div className="thread">
                  {comments.map((comment) => (
                    <div key={comment.id} className={`thread-item ${comment.internal ? 'thread-internal' : ''}`}>
                      <div className="thread-meta">
                        <span className="thread-author">{fullName(comment.author)}</span>
                        <span className="muted">{formatDateTime(comment.createdAt)}</span>
                        {comment.internal ? <span className="badge badge-bad">Note interne</span> : null}
                      </div>
                      <p className="thread-body">{comment.body}</p>
                      {comment.attachments.length > 0 ? (
                        <ul className="small mt-8" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                          {comment.attachments.map((file) => (
                            <li key={file.id}>
                              <a href={file.data} download={file.fileName}>
                                {file.fileName}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}

              <CommentForm ticketId={ticket.id} canPostInternal={staff} />
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3 className="panel-title">Historique (audit trail)</h3>
            </div>
            <div className="panel-body panel-body-flush table-wrap">
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Acteur</th>
                    <th>Champ</th>
                    <th>Avant</th>
                    <th>Après</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id}>
                      <td className="small nowrap mono">{formatDateTime(event.createdAt)}</td>
                      <td className="small nowrap">{event.actor ? fullName(event.actor) : 'Système'}</td>
                      <td className="small">{event.field}</td>
                      <td className="small">
                        {event.field === 'status' && event.fromValue
                          ? TICKET_STATUS_LABEL[event.fromValue as keyof typeof TICKET_STATUS_LABEL]
                          : (event.fromValue ?? '—')}
                      </td>
                      <td className="small">
                        {event.field === 'status' && event.toValue
                          ? TICKET_STATUS_LABEL[event.toValue as keyof typeof TICKET_STATUS_LABEL]
                          : (event.toValue ?? '—')}
                      </td>
                      <td className="small">{event.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-head">
              <h3 className="panel-title">Traitement</h3>
            </div>
            <div className="panel-body">
              <TicketActions
                ticketId={ticket.id}
                transitions={transitions.map((t) => ({ to: t.to, label: t.label, requiresNote: t.requiresNote }))}
                members={memberOptions}
                needsEstimate={ticket.type !== 'INCIDENT'}
              />
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3 className="panel-title">Caractéristiques</h3>
            </div>
            <div className="panel-body panel-body-flush table-wrap">
              <table className="table table-compact">
                <tbody>
                  <tr>
                    <th>Initiateur</th>
                    <td>
                      {fullName(ticket.createdBy)} <span className="muted small">({ticket.createdBy.company})</span>
                    </td>
                  </tr>
                  <tr>
                    <th>Assigné à</th>
                    <td>{ticket.assignee ? fullName(ticket.assignee) : '—'}</td>
                  </tr>
                  <tr>
                    <th>Priorité</th>
                    <td>{PRIORITY_LABEL[ticket.priority]}</td>
                  </tr>
                  {ticket.type === 'INCIDENT' ? (
                    <>
                      <tr>
                        <th>Sévérité</th>
                        <td>{ticket.severity ? SEVERITY_LABEL[ticket.severity] : '—'}</td>
                      </tr>
                      <tr>
                        <th>Environnement</th>
                        <td>{ticket.environmentName ?? ENVIRONMENTS[0]}</td>
                      </tr>
                      <tr>
                        <th>Échéance SLA</th>
                        <td className="mono small">{formatDateTime(ticket.slaResolutionDue)}</td>
                      </tr>
                      <tr>
                        <th>1re réponse</th>
                        <td className="mono small">{formatDateTime(ticket.firstResponseAt)}</td>
                      </tr>
                    </>
                  ) : (
                    <>
                      <tr>
                        <th>Urgence business</th>
                        <td>{ticket.businessUrgency ?? '—'}</td>
                      </tr>
                      <tr>
                        <th>Charge estimée</th>
                        <td>{ticket.estimateDays != null ? `${ticket.estimateDays} j` : '—'}</td>
                      </tr>
                      <tr>
                        <th>Coût estimé</th>
                        <td>{ticket.estimateCost != null ? `${ticket.estimateCost}` : '—'}</td>
                      </tr>
                    </>
                  )}
                  <tr>
                    <th>Module</th>
                    <td>{ticket.moduleName ?? '—'}</td>
                  </tr>
                  <tr>
                    <th>Sous-catégorie</th>
                    <td>{ticket.subCategory ?? '—'}</td>
                  </tr>
                  <tr>
                    <th>Tâche liée</th>
                    <td>
                      {ticket.task ? (
                        <Link href={`/app/projets/${ticket.projectId}/planning`}>{ticket.task.name}</Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {staff ? (
            <div className="panel">
              <div className="panel-head">
                <h3 className="panel-title">Qualification</h3>
              </div>
              <div className="panel-body">
                <TicketQualification
                  ticketId={ticket.id}
                  isIncident={ticket.type === 'INCIDENT'}
                  initial={{
                    priority: ticket.priority,
                    severity: ticket.severity,
                    moduleName: ticket.moduleName,
                    assigneeId: ticket.assigneeId,
                    taskId: ticket.taskId,
                  }}
                  members={memberOptions}
                  tasks={tasks}
                />
              </div>
            </div>
          ) : null}

          {ticket.status === 'CLOSED' && ctx.isCreator ? (
            <div className="panel">
              <div className="panel-head">
                <h3 className="panel-title">Votre satisfaction</h3>
              </div>
              <div className="panel-body">
                {ticket.satisfactionRating ? (
                  <div className="small">
                    Note attribuée : <strong>{ticket.satisfactionRating}/5</strong>
                    {ticket.satisfactionComment ? <p className="thread-body mt-8">{ticket.satisfactionComment}</p> : null}
                  </div>
                ) : (
                  <SatisfactionForm ticketId={ticket.id} />
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
