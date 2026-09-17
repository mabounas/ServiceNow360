import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { fail, handle, ok } from '@/lib/api';
import { audit, clientIp } from '@/lib/audit';
import { PWD_RE, PWD_RULE, findValidToken } from '@/lib/passwordReset';

const INVALID = 'Ce lien de réinitialisation est invalide ou a expiré. Faites une nouvelle demande.';

/** Vérifie qu'un lien est encore utilisable (affichage de la page). */
export async function GET(request: Request) {
  return handle(async () => {
    const token = new URL(request.url).searchParams.get('token') ?? '';
    const row = await findValidToken(token);
    if (!row) return fail(400, INVALID);
    return ok({ email: row.user.email });
  });
}

/** Enregistre le nouveau mot de passe et ferme toutes les sessions existantes. */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await request.json().catch(() => ({}));
    const token = String(body.token ?? '');
    const password = String(body.password ?? '');

    const row = await findValidToken(token);
    if (!row) return fail(400, INVALID);
    if (!PWD_RE.test(password)) return fail(400, PWD_RULE);

    const now = new Date();
    await prisma.$transaction([
      prisma.user.update({
        where: { id: row.userId },
        data: { passwordHash: await hashPassword(password), passwordChangedAt: now },
      }),
      prisma.passwordResetToken.updateMany({ where: { userId: row.userId, usedAt: null }, data: { usedAt: now } }),
    ]);

    await audit({ userId: row.userId, action: 'user.password.reset', entity: 'User', entityId: row.userId, ip: clientIp(request) });
    return ok({ message: 'Votre mot de passe a été modifié. Vous pouvez vous connecter.' });
  });
}
