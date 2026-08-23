import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { listAccessibleProjects } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { PROJECT_ROLE_LABEL, formatDate } from '@/lib/labels';
import { CLOSED_STATUSES } from '@/lib/labels';

export const dynamic = 'force-dynamic';

export default async function WorkspacePage() {
  const user = await requireUser();
  const projects = await listAccessibleProjects(user);

  const counts = await prisma.ticket.groupBy({
    by: ['projectId'],
    where: {
      projectId: { in: projects.map((p) => p.project.id) },
      status: { notIn: CLOSED_STATUSES },
    },
    _count: { _all: true },
  });
  const openByProject = new Map(counts.map((c) => [c.projectId, c._count._all]));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">Espace de travail</div>
          <h1 className="page-title">Bonjour {user.firstName}</h1>
        </div>
        {user.isAdmin ? (
          <div className="page-actions">
            <Link href="/app/admin/projets" className="btn btn-primary">
              Gérer les projets
            </Link>
          </div>
        ) : null}
      </div>

      {user.status === 'PENDING' ? (
        <div className="alert alert-info mb-24">
          <strong>Votre compte est en attente de validation.</strong>
          <p className="small muted" style={{ margin: '6px 0 0' }}>
            Un administrateur doit vous affecter à un projet et vous attribuer un rôle. Vous recevrez une notification
            dès que votre accès sera ouvert.
          </p>
        </div>
      ) : null}

      {projects.length === 0 ? (
        <div className="panel">
          <div className="empty">
            Aucun projet ne vous est affecté pour le moment.
            <br />
            La visibilité des tickets et des plannings est strictement limitée à vos projets.
          </div>
        </div>
      ) : (
        <div className="grid grid-3 gap-24">
          {projects.map(({ project, role }) => (
            <Link key={project.id} href={`/app/projets/${project.id}`} className="panel" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="panel-head">
                <div>
                  <div className="small muted mono">{project.code}</div>
                  <h3 className="panel-title" style={{ fontSize: 18, marginTop: 4 }}>
                    {project.name}
                  </h3>
                </div>
                <span className="badge badge-neutral">{PROJECT_ROLE_LABEL[role as keyof typeof PROJECT_ROLE_LABEL] ?? 'Administrateur'}</span>
              </div>
              <div className="panel-body">
                <div className="small muted">Client : {project.clientName}</div>
                <div className="small muted mt-8">
                  {formatDate(project.startDate)} → {formatDate(project.endDate)}
                </div>
                <div className="mt-16" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, color: 'var(--color-accent)' }}>
                  {openByProject.get(project.id) ?? 0}
                </div>
                <div className="small muted">ticket(s) en cours</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
