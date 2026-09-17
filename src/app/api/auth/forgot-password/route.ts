import { prisma } from '@/lib/prisma';
import { handle, ok } from '@/lib/api';
import { audit, clientIp } from '@/lib/audit';
import { issueResetLink } from '@/lib/passwordReset';

const GENERIC =
  'Si un compte correspond à cette adresse, un e-mail contenant un lien de réinitialisation vient de lui être envoyé.';

/** Demande de réinitialisation : réponse identique que le compte existe ou non (pas d'énumération). */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!email) return ok({ message: GENERIC });

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, firstName: true, status: true },
    });
    if (!user || user.status === 'DISABLED') {
      await audit({ action: 'user.password.forgot.unknown', entity: 'User', meta: { email }, ip: clientIp(request) });
      return ok({ message: GENERIC });
    }

    const result = await issueResetLink(user);
    await audit({
      userId: user.id,
      action: result ? 'user.password.forgot' : 'user.password.forgot.throttled',
      entity: 'User',
      entityId: user.id,
      meta: { emailSent: result?.sent ?? false },
      ip: clientIp(request),
    });
    if (result && !result.sent) console.error(`Lien de réinitialisation non envoyé (SMTP indisponible) pour ${user.email}`);

    return ok({ message: GENERIC });
  });
}
