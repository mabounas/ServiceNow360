import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { canContribute, getProjectAccess } from '@/lib/rbac';
import { fail, handle, ok } from '@/lib/api';
import { notify } from '@/lib/notify';
import { fullName } from '@/lib/labels';

type Params = { params: Promise<{ id: string }> };

/** §4.2.4 — le client consulte le planning en lecture seule mais peut commenter une tâche. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;

    const task = await prisma.task.findUnique({ where: { id }, select: { id: true, name: true, projectId: true } });
    if (!task) return fail(404, 'Tâche introuvable.');
    const { role } = await getProjectAccess(user, task.projectId);
    if (!canContribute(role)) return fail(403, 'Votre profil est en lecture seule sur ce projet.');

    const body = await request.json();
    const text = String(body.body ?? '').trim();
    if (!text) return fail(400, 'Le commentaire est vide.');

    const created = await prisma.taskComment.create({ data: { taskId: id, authorId: user.id, body: text } });
    const comment = { ...created, authorName: fullName(user) };

    const managers = await prisma.projectMember.findMany({
      where: { projectId: task.projectId, role: { in: ['PROJECT_MANAGER', 'SUPERVISOR'] } },
      select: { userId: true },
    });
    await notify({
      userIds: managers.map((m) => m.userId).filter((uid) => uid !== user.id),
      title: `Commentaire sur « ${task.name} »`,
      body: `${fullName(user)} : ${text.slice(0, 240)}`,
      link: `/app/projets/${task.projectId}/planning`,
    });

    return ok({ comment }, 201);
  });
}
