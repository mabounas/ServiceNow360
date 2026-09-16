import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { getProjectAccess } from '@/lib/rbac';
import { fail, handle, ok } from '@/lib/api';
import { audit } from '@/lib/audit';
import { MEETING_INCLUDE, canWriteMeetings, readMeetingFields, readMeetingFiles } from '@/lib/meetings';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const meeting = await prisma.meetingMinute.findUnique({ where: { id }, include: MEETING_INCLUDE });
    if (!meeting) return fail(404, 'PV introuvable.');
    await getProjectAccess(user, meeting.projectId);

    // Téléchargement d'une pièce jointe : ?file=<id>
    const fileId = new URL(request.url).searchParams.get('file');
    if (fileId) {
      const file = await prisma.meetingFile.findFirst({ where: { id: fileId, meetingId: id } });
      if (!file) return fail(404, 'Pièce jointe introuvable.');
      const base64 = file.data.replace(/^data:[^;]*;base64,/, '');
      return new Response(new Uint8Array(Buffer.from(base64, 'base64')), {
        headers: {
          'Content-Type': file.mimeType,
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        },
      });
    }

    return ok({ meeting });
  });
}

/**
 * Modification d'un PV, ajout ou retrait de pièces jointes, archivage et
 * restauration (`archived: true | false`). Un PV archivé n'est plus modifiable
 * tant qu'il n'a pas été restauré.
 */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const existing = await prisma.meetingMinute.findUnique({ where: { id }, select: { id: true, projectId: true, archived: true } });
    if (!existing) return fail(404, 'PV introuvable.');
    const { role } = await getProjectAccess(user, existing.projectId);
    if (!canWriteMeetings(role)) return fail(403, 'Seul le chef de projet ou un administrateur peut modifier un PV.');

    const body = await request.json().catch(() => null);
    if (!body) return fail(400, 'Requête invalide.');

    // Archivage / restauration : action à part entière.
    if (typeof body.archived === 'boolean') {
      const meeting = await prisma.meetingMinute.update({
        where: { id },
        data: body.archived
          ? { archived: true, archivedAt: new Date(), archivedById: user.id }
          : { archived: false, archivedAt: null, archivedById: null },
        include: MEETING_INCLUDE,
      });
      await audit({ userId: user.id, action: body.archived ? 'meeting.archive' : 'meeting.restore', entity: 'MeetingMinute', entityId: id });
      return ok({ meeting });
    }

    if (existing.archived) return fail(409, 'Ce PV est archivé : restaurez-le avant de le modifier.');

    const fields = readMeetingFields(body, true);
    const files = readMeetingFiles(body.files);
    const removeIds = Array.isArray(body.removeFileIds) ? body.removeFileIds.map(String) : [];

    const meeting = await prisma.$transaction(async (tx) => {
      if (removeIds.length) await tx.meetingFile.deleteMany({ where: { meetingId: id, id: { in: removeIds } } });
      if (files.length) {
        await tx.meetingFile.createMany({ data: files.map((f) => ({ ...f, meetingId: id, uploadedById: user.id })) });
      }
      return tx.meetingMinute.update({ where: { id }, data: fields, include: MEETING_INCLUDE });
    });

    await audit({ userId: user.id, action: 'meeting.update', entity: 'MeetingMinute', entityId: id });
    return ok({ meeting });
  });
}
