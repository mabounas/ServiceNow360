import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { canEditPlanning, getProjectAccess } from '@/lib/rbac';
import { fail, handle, ok } from '@/lib/api';

type Params = { params: Promise<{ id: string }> };

/** §4.2.3 — historique des versions du planning (baseline vs planning actuel). */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const access = await getProjectAccess(user, id);
    if (!canEditPlanning(access.role)) return fail(403, 'Seul le chef de projet peut figer une version du planning.');

    const body = await request.json().catch(() => ({}));
    const tasks = await prisma.task.findMany({
      where: { projectId: id },
      select: { id: true, name: true, startDate: true, endDate: true, progress: true },
    });

    const baseline = await prisma.planBaseline.create({
      data: {
        projectId: id,
        label: String(body.label ?? `Version du ${new Date().toLocaleDateString('fr-FR')}`).trim(),
        snapshot: tasks.map((t) => ({
          taskId: t.id,
          name: t.name,
          startDate: t.startDate.toISOString(),
          endDate: t.endDate.toISOString(),
          progress: t.progress,
        })),
      },
    });

    return ok({ baseline }, 201);
  });
}
