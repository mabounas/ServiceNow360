import { requireUser } from '@/lib/auth';
import { canManageMembers, getProjectAccess } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import MemberManager from '@/components/app/MemberManager';
import TeamDirectory from '@/components/app/TeamDirectory';
import { fullName } from '@/lib/labels';

export const dynamic = 'force-dynamic';

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { role } = await getProjectAccess(user, id);
  const canManage = canManageMembers(user, role);

  const [members, allUsers] = await Promise.all([
    prisma.projectMember.findMany({
      where: { projectId: id },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true, company: true, jobRole: true, status: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    canManage
      ? prisma.user.findMany({
          where: { status: { not: 'DISABLED' } },
          select: { id: true, firstName: true, lastName: true, email: true, company: true, status: true },
          orderBy: [{ status: 'asc' }, { lastName: 'asc' }],
        })
      : Promise.resolve([]),
  ]);

  const assigned = new Set(members.map((m) => m.userId));
  // L'annuaire ne montre que les comptes utilisables.
  const directory = members
    .filter((m) => m.user.status !== 'DISABLED')
    .map((m) => ({
      id: m.userId,
      name: fullName(m.user),
      jobRole: m.user.jobRole,
      company: m.user.company,
      role: m.role,
      email: m.user.email,
      phone: m.user.phone,
      isMe: m.userId === user.id,
    }));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">Équipe projet</div>
          <h1 className="page-title">Équipe et contacts</h1>
        </div>
      </div>

      <TeamDirectory entries={directory} />

      {canManage ? (
        <>
          <h2 style={{ fontSize: 18, margin: '8px 0 12px' }}>Gérer les affectations</h2>
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
      ) : null}
    </>
  );
}
