import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { getProjectAccess } from '@/lib/rbac';
import { fail, handle, ok } from '@/lib/api';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notify';
import { fullName, formatDate } from '@/lib/labels';
import {
  MEETING_INCLUDE,
  archiveFilter,
  canWriteMeetings,
  readMeetingFields,
  readMeetingFiles,
} from '@/lib/meetings';

type Params = { params: Promise<{ id: string }> };

async function loadTask(id: string) {
  return prisma.task.findUnique({ where: { id }, select: { id: true, name: true, projectId: true } });
}

/** PV de réunion d'une tâche (actifs par défaut, `?archive=all|archived`). */
export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const task = await loadTask(id);
    if (!task) return fail(404, 'Tâche introuvable.');
    await getProjectAccess(user, task.projectId);

    const meetings = await prisma.meetingMinute.findMany({
      where: { taskId: id, ...archiveFilter(new URL(request.url).searchParams.get('archive')) },
      include: MEETING_INCLUDE,
      orderBy: { meetingDate: 'desc' },
    });
    return ok({ meetings });
  });
}

/** Nouveau PV — chef de projet et administrateur. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const task = await loadTask(id);
    if (!task) return fail(404, 'Tâche introuvable.');
    const { role } = await getProjectAccess(user, task.projectId);
    if (!canWriteMeetings(role)) return fail(403, 'Seul le chef de projet ou un administrateur peut rédiger un PV.');

    const body = await request.json().catch(() => null);
    if (!body) return fail(400, 'Requête invalide.');
    const fields = readMeetingFields(body, false);
    const files = readMeetingFiles(body.files);

    const meeting = await prisma.meetingMinute.create({
      data: {
        ...(fields as { title: string; meetingDate: Date; content: string }),
        projectId: task.projectId,
        taskId: task.id,
        taskName: task.name,
        createdById: user.id,
        files: { create: files.map((f) => ({ ...f, uploadedById: user.id })) },
      },
      include: MEETING_INCLUDE,
    });

    const audience = await prisma.projectMember.findMany({
      where: { projectId: task.projectId, role: { in: ['PROJECT_MANAGER', 'SUPERVISOR'] } },
      select: { userId: true },
    });
    await notify({
      userIds: audience.map((m) => m.userId).filter((uid) => uid !== user.id),
      title: `PV de réunion — ${task.name}`,
      body: `${fullName(user)} a publié « ${meeting.title} » (réunion du ${formatDate(meeting.meetingDate)}).`,
      link: `/app/reunions/${meeting.id}`,
    });
    await audit({ userId: user.id, action: 'meeting.create', entity: 'MeetingMinute', entityId: meeting.id, meta: { taskId: task.id } });

    return ok({ meeting }, 201);
  });
}
