import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getProjectAccess } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { MEETING_INCLUDE, canWriteMeetings } from '@/lib/meetings';
import { fullName } from '@/lib/labels';
import MeetingDetail from '@/components/app/MeetingDetail';

export const dynamic = 'force-dynamic';

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const meeting = await prisma.meetingMinute.findUnique({
    where: { id },
    include: { ...MEETING_INCLUDE, project: { select: { code: true, name: true } } },
  });
  if (!meeting) notFound();

  const access = await getProjectAccess(user, meeting.projectId).catch(() => null);
  if (!access) notFound();

  return (
    <MeetingDetail
      projectLabel={`${meeting.project.code} — ${meeting.project.name}`}
      canWrite={canWriteMeetings(access.role)}
      meeting={{
        id: meeting.id,
        projectId: meeting.projectId,
        taskId: meeting.taskId,
        taskName: meeting.task?.name ?? meeting.taskName,
        title: meeting.title,
        meetingDate: meeting.meetingDate.toISOString(),
        location: meeting.location,
        participants: meeting.participants,
        agenda: meeting.agenda,
        content: meeting.content,
        decisions: meeting.decisions,
        actions: meeting.actions,
        nextMeeting: meeting.nextMeeting?.toISOString() ?? null,
        archived: meeting.archived,
        archivedAt: meeting.archivedAt?.toISOString() ?? null,
        archivedByName: meeting.archivedBy ? fullName(meeting.archivedBy) : null,
        createdByName: fullName(meeting.createdBy),
        createdAt: meeting.createdAt.toISOString(),
        updatedAt: meeting.updatedAt.toISOString(),
        files: meeting.files.map((f) => ({ id: f.id, fileName: f.fileName, size: f.size })),
      }}
    />
  );
}
