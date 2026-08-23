import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { fail, handle, ok } from '@/lib/api';
import { audit } from '@/lib/audit';

/** §5.3 — vue d'ensemble des comptes pour l'administrateur. */
export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    if (!user.isAdmin) return fail(403, 'Réservé à l’administrateur.');

    const params = new URL(request.url).searchParams;
    const status = params.get('status');
    const projectId = params.get('projectId');
    const q = params.get('q')?.trim();

    const users = await prisma.user.findMany({
      where: {
        status: status ? (status as 'PENDING' | 'ACTIVE' | 'DISABLED') : undefined,
        memberships: projectId ? { some: { projectId } } : undefined,
        OR: q
          ? [
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { company: { contains: q, mode: 'insensitive' } },
            ]
          : undefined,
      },
      include: { memberships: { include: { project: { select: { id: true, name: true, code: true } } } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });

    return ok({
      users: users.map(({ passwordHash: _passwordHash, ...rest }) => rest),
    });
  });
}

/** Activation, désactivation, promotion administrateur (§5.3). */
export async function PATCH(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    if (!user.isAdmin) return fail(403, 'Réservé à l’administrateur.');

    const body = await request.json();
    const userId = String(body.userId ?? '');
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, isAdmin: true } });
    if (!target) return fail(404, 'Utilisateur introuvable.');
    if (userId === user.id && body.status === 'DISABLED') return fail(400, 'Vous ne pouvez pas désactiver votre propre compte.');

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        status: body.status ?? undefined,
        isAdmin: body.isAdmin !== undefined ? Boolean(body.isAdmin) : undefined,
      },
      select: { id: true, status: true, isAdmin: true },
    });

    await audit({ userId: user.id, action: 'user.update', entity: 'User', entityId: userId, meta: body });
    return ok({ user: updated });
  });
}
