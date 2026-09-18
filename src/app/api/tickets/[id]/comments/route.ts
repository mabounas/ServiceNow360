import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { canContribute, isStaff, requireTicketAccess } from '@/lib/rbac';
import { fail, handle, ok } from '@/lib/api';
import { notifyTicketUpdate } from '@/lib/notify';
import { fullName } from '@/lib/labels';

type Params = { params: Promise<{ id: string }> };

/** Fil de discussion horodaté entre client et équipe support (§3.3.2). */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const { ticket, role } = await requireTicketAccess(user, id);
    if (!canContribute(role)) return fail(403, 'Votre profil est en lecture seule sur ce projet.');

    const body = await request.json();
    const text = String(body.body ?? '').trim();
    if (!text) return fail(400, 'Le commentaire est vide.');

    // Une note interne n'est proposée qu'à l'équipe (elle reste invisible du client).
    const internal = Boolean(body.internal) && isStaff(role);

    const comment = await prisma.ticketComment.create({
      data: { ticketId: id, authorId: user.id, body: text, internal },
    });

    if (Array.isArray(body.attachments) && body.attachments.length) {
      await prisma.attachment.createMany({
        data: body.attachments.map((a: { fileName: string; mimeType: string; size: number; data: string }) => ({
          ticketId: id,
          commentId: comment.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          size: a.size,
          data: a.data,
          uploadedById: user.id,
        })),
      });
    }

    // Première réponse de l'équipe : jalon de SLA.
    if (!ticket.firstResponseAt && isStaff(role) && ticket.createdById !== user.id) {
      await prisma.ticket.update({ where: { id }, data: { firstResponseAt: new Date() } });
    }

    // Les notes internes restent dans l'équipe : ni alerte, ni e-mail au déclarant.
    if (!internal) {
      const files = Array.isArray(body.attachments) ? body.attachments.length : 0;
      await notifyTicketUpdate({
        ticket,
        actor: user,
        headline: 'Nouveau commentaire',
        lines: [
          `${fullName(user)} : ${text.length > 600 ? `${text.slice(0, 600)}…` : text}`,
          ...(files ? [`${files} pièce(s) jointe(s) ajoutée(s)`] : []),
        ],
      });
    }

    return ok({ comment }, 201);
  });
}
