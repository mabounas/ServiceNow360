import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import AdminProjects from '@/components/app/AdminProjects';

export const dynamic = 'force-dynamic';

export default async function AdminProjectsPage() {
  const user = await requireUser();
  if (!user.isAdmin) notFound();

  const projects = await prisma.project.findMany({
    include: { _count: { select: { members: true, tickets: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">Administration</div>
          <h1 className="page-title">Projets</h1>
        </div>
      </div>

      <AdminProjects
        projects={projects.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          clientName: p.clientName,
          startDate: p.startDate ? p.startDate.toISOString() : null,
          endDate: p.endDate ? p.endDate.toISOString() : null,
          members: p._count.members,
          tickets: p._count.tickets,
        }))}
      />
    </>
  );
}
