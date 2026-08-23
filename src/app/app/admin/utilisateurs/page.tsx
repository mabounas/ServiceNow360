import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import AdminUsers from '@/components/app/AdminUsers';
import { fullName } from '@/lib/labels';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const user = await requireUser();
  if (!user.isAdmin) notFound();

  const users = await prisma.user.findMany({
    include: { memberships: { include: { project: { select: { id: true, name: true } } } } },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">Administration</div>
          <h1 className="page-title">Utilisateurs et droits</h1>
        </div>
      </div>

      <AdminUsers
        users={users.map((u) => ({
          id: u.id,
          name: fullName(u),
          email: u.email,
          company: u.company,
          jobRole: u.jobRole,
          status: u.status,
          isAdmin: u.isAdmin,
          createdAt: u.createdAt.toISOString(),
          memberships: u.memberships.map((m) => ({
            projectId: m.projectId,
            projectName: m.project.name,
            role: m.role,
          })),
        }))}
      />
    </>
  );
}
