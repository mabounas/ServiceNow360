import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { handle, ok } from '@/lib/api';

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const notifications = await prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return ok({ notifications, unread: notifications.filter((n) => !n.readAt).length });
  });
}

/** Marque une notification (ou toutes) comme lue. */
export async function PATCH(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));

    if (body.all) {
      await prisma.notification.updateMany({
        where: { userId: user.id, readAt: null },
        data: { readAt: new Date() },
      });
    } else if (body.id) {
      await prisma.notification.updateMany({
        where: { id: String(body.id), userId: user.id },
        data: { readAt: new Date() },
      });
    }

    return ok({ ok: true });
  });
}
