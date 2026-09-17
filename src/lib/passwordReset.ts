import { createHash, randomBytes } from 'node:crypto';
import { prisma } from './prisma';
import { appUrl, sendMail } from './mail';

export const RESET_TTL_MINUTES = 60;
/** Nombre maximal de liens émis par compte sur une heure (limite l'abus du formulaire). */
const MAX_PER_HOUR = 3;

export const PWD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
export const PWD_RULE = 'Mot de passe trop faible : 8 caractères minimum, avec majuscule, minuscule et chiffre.';

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Crée un lien de réinitialisation pour l'utilisateur et l'envoie par e-mail.
 * Les liens précédents non utilisés sont invalidés.
 * Renvoie null si la limite horaire est atteinte.
 */
export async function issueResetLink(user: { id: string; email: string; firstName: string }, opts: { bypassLimit?: boolean } = {}) {
  if (!opts.bypassLimit) {
    const recent = await prisma.passwordResetToken.count({
      where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 3_600_000) } },
    });
    if (recent >= MAX_PER_HOUR) return null;
  }

  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + RESET_TTL_MINUTES * 60_000),
      },
    }),
  ]);

  const link = `${appUrl()}/reinitialiser-mot-de-passe?token=${token}`;
  const sent = await sendMail({
    to: user.email,
    subject: 'ServiceDesk360 — réinitialisation de votre mot de passe',
    text: [
      `Bonjour ${user.firstName},`,
      '',
      'Une réinitialisation du mot de passe de votre compte ServiceDesk360 a été demandée.',
      `Pour choisir un nouveau mot de passe, ouvrez ce lien (valable ${RESET_TTL_MINUTES} minutes, une seule utilisation) :`,
      '',
      link,
      '',
      "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable.",
    ].join('\n'),
    html: `<p>Bonjour ${escapeHtml(user.firstName)},</p>
<p>Une réinitialisation du mot de passe de votre compte <strong>ServiceDesk360</strong> a été demandée.</p>
<p><a href="${link}" style="display:inline-block;background:#ec3013;color:#fff;padding:12px 20px;text-decoration:none;font-weight:bold">Choisir un nouveau mot de passe</a></p>
<p style="color:#666;font-size:13px">Ce lien est valable ${RESET_TTL_MINUTES} minutes et ne peut servir qu'une fois.<br>
Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable.</p>`,
  });

  return { link, sent };
}

/** Jeton valide (non utilisé, non expiré) → ligne en base, sinon null. */
export async function findValidToken(token: string) {
  if (!token) return null;
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, status: true } } },
  });
  if (!row || row.usedAt || row.expiresAt < new Date() || row.user.status === 'DISABLED') return null;
  return row;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
