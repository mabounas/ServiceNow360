import type { Prisma } from '@prisma/client';
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

const PROFILE_FIELDS: [('firstName' | 'lastName' | 'company' | 'phone' | 'jobRole' | 'country'), string, boolean, number][] = [
  ['firstName', 'Prénom', true, 80],
  ['lastName', 'Nom', true, 80],
  ['company', 'Société', true, 120],
  ['phone', 'Téléphone', false, 40],
  ['jobRole', 'Fonction', false, 120],
  ['country', 'Pays', false, 80],
];

/** Activation, désactivation, promotion administrateur et modification du profil (§5.3). */
export async function PATCH(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    if (!user.isAdmin) return fail(403, 'Réservé à l’administrateur.');

    const body = await request.json();
    const userId = String(body.userId ?? '');
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, isAdmin: true, email: true } });
    if (!target) return fail(404, 'Utilisateur introuvable.');
    if (userId === user.id && body.status === 'DISABLED') return fail(400, 'Vous ne pouvez pas désactiver votre propre compte.');

    const data: Prisma.UserUpdateInput = {
      status: body.status ?? undefined,
      isAdmin: body.isAdmin !== undefined ? Boolean(body.isAdmin) : undefined,
    };
    if (userId === user.id && body.isAdmin === false) return fail(400, 'Vous ne pouvez pas retirer vos propres droits d’administrateur.');

    // Informations du profil (§5.3) : nom, prénom, e-mail, société, coordonnées.
    for (const [key, label, required, max] of PROFILE_FIELDS) {
      if (body[key] === undefined) continue;
      const value = String(body[key] ?? '').trim();
      if (required && !value) return fail(400, `${label} : champ obligatoire.`);
      if (value.length > max) return fail(400, `${label} : ${max} caractères maximum.`);
      (data as Record<string, unknown>)[key] = required ? value : value || null;
    }
    if (body.email !== undefined) {
      const email = String(body.email ?? '').trim().toLowerCase();
      if (!EMAIL_RE.test(email)) return fail(400, 'Adresse e-mail invalide.');
      if (email !== target.email) {
        const taken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
        if (taken) return fail(409, 'Un autre compte utilise déjà cette adresse e-mail.');
      }
      data.email = email;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        status: true,
        isAdmin: true,
        firstName: true,
        lastName: true,
        email: true,
        company: true,
        phone: true,
        jobRole: true,
        country: true,
      },
    });

    const changes = Object.keys(data).filter((k) => data[k as keyof typeof data] !== undefined);
    await audit({
      userId: user.id,
      action: 'user.update',
      entity: 'User',
      entityId: userId,
      meta: { changes, ...(data.email && data.email !== target.email ? { emailFrom: target.email, emailTo: data.email } : {}) },
    });
    return ok({ user: updated });
  });
}
