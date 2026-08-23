import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { getProjectAccess } from '@/lib/rbac';
import { fail, handle, ok } from '@/lib/api';
import { notify } from '@/lib/notify';
import { fullName } from '@/lib/labels';

type Params = { params: Promise<{ id: string }> };

/** §4.2.4 — le client consulte le planning en lecture seule mais peut commenter une tâche. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;

    const task = await prisma.task.findUnique({ where: { id }, select: { id: true, name: true, projectId: true, ownerId: true } });
    if (!task) return fail(404, 'Tâche introuvable.');
    await getProjectAccess(user, task.projectId);

    const body = await request.json();
    const text = String(body.body ?? '').trim();
    if (!text) return fail(400, 'Le commentaire est vide.');

    const comment = await prisma.taskComment.create({ data: { taskId: id, authorId: user.id, body: text } });

    const managers = await prisma.projectMember.findMany({
      where: { projectId: task.projectId, role: { in: ['PROJECT_MANAGER', 'SUPERVISOR'] } },
      select: { userId: true },
    });
    await notify({
      userIds: [...managers.map((m) => m.userId), task.ownerId ?? ''].filter((uid) => uid && uid !== user.id),
      title: `Commentaire sur « ${task.name} »`,
      body: `${fullName(user)} : ${text.slice(0, 240)}`,
      link: `/app/projets/${task.projectId}/planning`,
    });

    return ok({ comment }, 201);
  });
}
