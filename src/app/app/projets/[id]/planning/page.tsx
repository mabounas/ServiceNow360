import { requireUser } from '@/lib/auth';
import { canEditPlanning, getProjectAccess } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import PlanningBoard from '@/components/app/PlanningBoard';
import { fullName } from '@/lib/labels';
import type { PlanTask } from '@/lib/planning';

export const dynamic = 'force-dynamic';

export default async function PlanningPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { role } = await getProjectAccess(user, id);

  const [tasks, dependencies, members, baselines] = await Promise.all([
    prisma.task.findMany({
      where: { projectId: id },
      include: { owner: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: [{ sortOrder: 'asc' }, { startDate: 'asc' }],
    }),
    prisma.taskDependency.findMany({ where: { predecessor: { projectId: id } } }),
    prisma.projectMember.findMany({
      where: { projectId: id },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.planBaseline.findMany({ where: { projectId: id }, orderBy: { createdAt: 'desc' }, take: 10 }),
  ]);

  const planTasks: PlanTask[] = tasks.map((t) => ({
    id: t.id,
    parentId: t.parentId,
    name: t.name,
    startDate: t.startDate.toISOString(),
    endDate: t.endDate.toISOString(),
    progress: t.progress,
    status: t.status,
    isMilestone: t.isMilestone,
    sortOrder: t.sortOrder,
    ownerId: t.ownerId,
    ownerName: t.owner ? fullName(t.owner) : null,
    description: t.description,
  }));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">Module 2 — Suivi de projet</div>
          <h1 className="page-title">Planning et diagramme de Gantt</h1>
        </div>
      </div>

      <PlanningBoard
        projectId={id}
        tasks={planTasks}
        dependencies={dependencies.map((d) => ({
          id: d.id,
          predecessorId: d.predecessorId,
          successorId: d.successorId,
          type: d.type,
          lagDays: d.lagDays,
        }))}
        members={members.map((m) => ({ id: m.user.id, name: fullName(m.user) }))}
        baselines={baselines.map((b) => ({
          id: b.id,
          label: b.label,
          snapshot: b.snapshot as unknown as { taskId: string; startDate: string; endDate: string }[],
        }))}
        editable={canEditPlanning(role)}
      />
    </>
  );
}
