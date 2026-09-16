import { requireUser } from '@/lib/auth';
import { canEditPlanning, getProjectAccess } from '@/lib/rbac';
import { canWriteMeetings } from '@/lib/meetings';
import { prisma } from '@/lib/prisma';
import PlanningBoard from '@/components/app/PlanningBoard';
import { fullName } from '@/lib/labels';
import type { PlanTask } from '@/lib/planning';

export const dynamic = 'force-dynamic';

export default async function PlanningPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { role } = await getProjectAccess(user, id);

  const [tasks, dependencies, members, baselines, meetingCounts] = await Promise.all([
    prisma.task.findMany({
      where: { projectId: id },
      include: {
        comments: {
          include: { author: { select: { firstName: true, lastName: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { startDate: 'asc' }],
    }),
    prisma.taskDependency.findMany({ where: { predecessor: { projectId: id } } }),
    prisma.projectMember.findMany({
      where: { projectId: id },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.planBaseline.findMany({ where: { projectId: id }, orderBy: { createdAt: 'desc' }, take: 10 }),
    prisma.meetingMinute.groupBy({
      by: ['taskId'],
      where: { projectId: id, archived: false, taskId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const meetingsByTask = new Map(meetingCounts.map((m) => [m.taskId, m._count._all]));

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
    ownerLabel: t.ownerLabel,
    description: t.description,
    meetingCount: meetingsByTask.get(t.id) ?? 0,
    comments: t.comments.map((c) => ({
      id: c.id,
      body: c.body,
      authorName: fullName(c.author),
      createdAt: c.createdAt.toISOString(),
    })),
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
        canWriteMeetings={canWriteMeetings(role)}
      />
    </>
  );
}
