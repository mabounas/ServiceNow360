import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { fail, handle, ok } from '@/lib/api';
import { audit } from '@/lib/audit';
import { issueResetLink } from '@/lib/passwordReset';

/**
 * L'administrateur envoie un lien de réinitialisation à un utilisateur.
 * Sans SMTP configuré, le lien est renvoyé pour être transmis par un autre canal.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    if (!user.isAdmin) return fail(403, 'Réservé à l’administrateur.');

    const body = await request.json().catch(() => ({}));
    const target = await prisma.user.findUnique({
      where: { id: String(body.userId ?? '') },
      select: { id: true, email: true, firstName: true, status: true },
    });
    if (!target) return fail(404, 'Utilisateur introuvable.');
    if (target.status === 'DISABLED') return fail(400, 'Ce compte est désactivé : réactivez-le avant de réinitialiser son mot de passe.');

    const result = await issueResetLink(target, { bypassLimit: true });
    if (!result) return fail(500, 'Création du lien impossible.');

    await audit({
      userId: user.id,
      action: 'user.password.reset-link',
      entity: 'User',
      entityId: target.id,
      meta: { emailSent: result.sent },
    });

    return ok({
      sent: result.sent,
      email: target.email,
      // Le lien n'est renvoyé que s'il n'a pas pu partir par e-mail.
      link: result.sent ? null : result.link,
    });
  });
}
