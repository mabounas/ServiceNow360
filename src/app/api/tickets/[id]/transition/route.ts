import { requireUser } from '@/lib/auth';
import { requireTicketAccess } from '@/lib/rbac';
import { handle, ok } from '@/lib/api';
import { applyTransition } from '@/lib/tickets';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const { ctx } = await requireTicketAccess(user, id);
    const body = await request.json();

    const ticket = await applyTransition(user, id, ctx, {
      to: body.to,
      note: body.note ?? null,
      assigneeId: body.assigneeId || null,
      estimateDays: body.estimateDays != null && body.estimateDays !== '' ? Number(body.estimateDays) : null,
      estimateCost: body.estimateCost != null && body.estimateCost !== '' ? Number(body.estimateCost) : null,
    });

    return ok({ ticket });
  });
}
