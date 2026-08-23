import { notFound } from 'next/navigation';
import ProjectNav from '@/components/app/ProjectNav';
import { requireUser } from '@/lib/auth';
import { canManageMembers, getProjectAccess } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { PROJECT_ROLE_LABEL } from '@/lib/labels';

export const dynamic = 'force-dynamic';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const access = await getProjectAccess(user, id).catch(() => null);
  if (!access) notFound();
  const { role } = access;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div className="page-kicker">
            {project.code} — {project.clientName}
          </div>
          <h2 style={{ fontSize: 24, margin: 0 }}>{project.name}</h2>
        </div>
        <span className="badge badge-neutral">
          Votre rôle : {role === 'ADMIN' ? 'Administrateur' : PROJECT_ROLE_LABEL[role]}
        </span>
      </div>

      <ProjectNav projectId={id} canManage={canManageMembers(user, role)} />

      {children}
    </>
  );
}
