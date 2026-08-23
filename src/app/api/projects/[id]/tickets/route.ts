import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { getProjectAccess } from '@/lib/rbac';
import { handle, ok } from '@/lib/api';
import { buildTicketWhere, TICKET_LIST_INCLUDE } from '@/lib/ticketQuery';
import { createTicket } from '@/lib/tickets';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const access = await getProjectAccess(user, id);
    const url = new URL(request.url);

    const tickets = await prisma.ticket.findMany({
      where: buildTicketWhere(id, access.role, user.id, url.searchParams),
      include: TICKET_LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: Number(url.searchParams.get('take') ?? 500),
    });

    return ok({ tickets });
  });
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const body = await request.json();
    const ticket = await createTicket(user, { ...body, projectId: id });
    return ok({ ticket }, 201);
  });
}
