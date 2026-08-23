import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { handle, fail, ok } from '@/lib/api';
import { audit, clientIp } from '@/lib/audit';
import { notify } from '@/lib/notify';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const PWD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

/**
 * §2.4 — auto-inscription. Le compte est créé en statut PENDING :
 * il reste inactif tant que l'administrateur ne l'a pas affecté à un projet.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await request.json();
    const email = String(body.email ?? '').trim().toLowerCase();
    const firstName = String(body.firstName ?? '').trim();
    const lastName = String(body.lastName ?? '').trim();
    const company = String(body.company ?? '').trim();
    const password = String(body.password ?? '');

    if (!firstName || !lastName || !company) return fail(400, 'Nom, prénom et société sont obligatoires.');
    if (!EMAIL_RE.test(email)) return fail(400, 'Adresse e-mail invalide.');
    if (!PWD_RE.test(password)) {
      return fail(400, 'Mot de passe trop faible : 8 caractères minimum, avec majuscule, minuscule et chiffre.');
    }

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) return fail(409, 'Un compte existe déjà avec cette adresse e-mail.');

    const isFirstUser = (await prisma.user.count()) === 0;

    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        company,
        phone: body.phone ? String(body.phone).trim() : null,
        jobRole: body.role ? String(body.role).trim() : null,
        country: body.country ? String(body.country).trim() : null,
        passwordHash: await hashPassword(password),
        // Le tout premier compte devient administrateur : sans lui, aucune
        // inscription ne pourrait jamais être validée.
        isAdmin: isFirstUser,
        status: isFirstUser ? 'ACTIVE' : 'PENDING',
      },
      select: { id: true, email: true, status: true, isAdmin: true },
    });

    await audit({
      userId: user.id,
      action: 'user.register',
      entity: 'User',
      entityId: user.id,
      ip: clientIp(request),
    });

    // Prévenir les administrateurs qu'une inscription attend validation.
    if (!isFirstUser) {
      const admins = await prisma.user.findMany({ where: { isAdmin: true, status: 'ACTIVE' }, select: { id: true } });
      await notify({
        userIds: admins.map((a) => a.id),
        title: 'Nouvelle inscription à valider',
        body: `${firstName} ${lastName} (${company}) a créé un compte et attend son affectation à un projet.`,
        link: '/app/admin/utilisateurs',
      });
    }

    return ok({ id: user.id, status: user.status, isAdmin: user.isAdmin }, 201);
  });
}
