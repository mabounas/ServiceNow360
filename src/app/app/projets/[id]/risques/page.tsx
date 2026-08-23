import { requireUser } from '@/lib/auth';
import { canEditPlanning, getProjectAccess } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import RiskBoard from '@/components/app/RiskBoard';
import { fullName } from '@/lib/labels';

export const dynamic = 'force-dynamic';

export default async function RisksPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { role } = await getProjectAccess(user, id);
  const editable = canEditPlanning(role);

  // Les risques marqués « internes » ne sont pas exposés au client (§4.2.3).
  const risks = await prisma.risk.findMany({
    where: { projectId: id, ...(editable ? {} : { sharedWithClient: true }) },
    include: { owner: { select: { firstName: true, lastName: true } } },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">Module 2 — Points d’attention</div>
          <h1 className="page-title">Risques du projet</h1>
        </div>
      </div>

      <RiskBoard
        projectId={id}
        editable={editable}
        risks={risks.map((r) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          probability: r.probability,
          impact: r.impact,
          status: r.status,
          sharedWithClient: r.sharedWithClient,
          createdAt: r.createdAt.toISOString(),
          ownerName: r.owner ? fullName(r.owner) : null,
        }))}
      />
    </>
  );
}
