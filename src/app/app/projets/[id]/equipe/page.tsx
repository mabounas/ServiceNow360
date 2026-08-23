import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { canManageMembers, getProjectAccess } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import MemberManager from '@/components/app/MemberManager';
import { fullName } from '@/lib/labels';

export const dynamic = 'force-dynamic';

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { role } = await getProjectAccess(user, id);
  if (!canManageMembers(user, role)) notFound();

  const [members, allUsers] = await Promise.all([
    prisma.projectMember.findMany({
      where: { projectId: id },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.user.findMany({
      where: { status: { not: 'DISABLED' } },
      orderBy: [{ status: 'asc' }, { lastName: 'asc' }],
    }),
  ]);

  const assigned = new Set(members.map((m) => m.userId));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">Module 3 — Utilisateurs et droits</div>
          <h1 className="page-title">Équipe et affectations</h1>
        </div>
      </div>

      <MemberManager
        projectId={id}
        members={members.map((m) => ({
          userId: m.userId,
          name: fullName(m.user),
          email: m.user.email,
          company: m.user.company,
          role: m.role,
          status: m.user.status,
        }))}
        candidates={allUsers
          .filter((u) => !assigned.has(u.id))
          .map((u) => ({ id: u.id, name: fullName(u), email: u.email, company: u.company, status: u.status }))}
      />
    </>
  );
}
