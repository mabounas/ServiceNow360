import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { getProjectAccess } from '@/lib/rbac';
import { handle, ok } from '@/lib/api';
import { MEETING_INCLUDE, archiveFilter } from '@/lib/meetings';

type Params = { params: Promise<{ id: string }> };

/** Tous les PV du projet, toutes tâches confondues (`?archive=all|archived`, `?task=<id>`). */
export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    await getProjectAccess(user, id);
    const search = new URL(request.url).searchParams;
    const taskId = search.get('task');

    const meetings = await prisma.meetingMinute.findMany({
      where: { projectId: id, ...(taskId ? { taskId } : {}), ...archiveFilter(search.get('archive')) },
      include: MEETING_INCLUDE,
      orderBy: { meetingDate: 'desc' },
    });
    return ok({ meetings });
  });
}
