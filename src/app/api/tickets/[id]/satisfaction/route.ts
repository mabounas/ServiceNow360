import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { requireTicketAccess } from '@/lib/rbac';
import { fail, handle, ok } from '@/lib/api';

type Params = { params: Promise<{ id: string }> };

/** §3.3.4 — enquête de satisfaction courte à la clôture du ticket. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const { ticket, ctx } = await requireTicketAccess(user, id);

    if (!ctx.isCreator) return fail(403, "Seul l'initiateur du ticket peut répondre à l'enquête.");
    if (ticket.status !== 'CLOSED') return fail(400, "L'enquête n'est ouverte qu'après clôture du ticket.");

    const body = await request.json();
    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return fail(400, 'Note attendue entre 1 et 5.');

    const updated = await prisma.ticket.update({
      where: { id },
      data: {
        satisfactionRating: rating,
        satisfactionComment: body.comment ? String(body.comment).trim() : null,
      },
    });

    return ok({ ticket: updated });
  });
}
