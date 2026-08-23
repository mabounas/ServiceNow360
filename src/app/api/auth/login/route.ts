import { prisma } from '@/lib/prisma';
import { createSession, verifyPassword } from '@/lib/auth';
import { fail, handle, ok } from '@/lib/api';
import { audit, clientIp } from '@/lib/audit';

export async function POST(request: Request) {
  return handle(async () => {
    const body = await request.json();
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const remember = Boolean(body.remember);

    const user = await prisma.user.findUnique({ where: { email } });
    // Message volontairement identique dans les deux cas (pas d'énumération de comptes).
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      await audit({ action: 'user.login.failed', entity: 'User', meta: { email }, ip: clientIp(request) });
      return fail(401, 'Identifiants incorrects.');
    }
    if (user.status === 'DISABLED') return fail(403, 'Ce compte est désactivé.');

    await createSession(user.id, remember);
    await audit({ userId: user.id, action: 'user.login', entity: 'User', entityId: user.id, ip: clientIp(request) });

    return ok({ id: user.id, status: user.status, isAdmin: user.isAdmin });
  });
}
