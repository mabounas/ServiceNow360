import { prisma } from '@/lib/prisma';
import { fail, handle, ok } from '@/lib/api';
import { audit, clientIp } from '@/lib/audit';
import { notify } from '@/lib/notify';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

const MAX = { name: 80, email: 160, company: 120, phone: 40, subject: 140, message: 4000 };

/**
 * Formulaire de contact public — aucune authentification requise.
 * Le message est stocké en base et les administrateurs sont notifiés.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await request.json().catch(() => null);
    if (!body) return fail(400, 'Requête invalide.');

    const firstName = String(body.firstName ?? '').trim();
    const lastName = String(body.lastName ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const subject = String(body.subject ?? '').trim();
    const message = String(body.message ?? '').trim();
    const company = String(body.company ?? '').trim();
    const phone = String(body.phone ?? '').trim();

    // Piège à robots : un champ masqué que seul un automate remplit.
    if (String(body.website ?? '').trim()) return ok({ ok: true }, 201);

    if (!firstName || !lastName) return fail(400, 'Nom et prénom sont obligatoires.');
    if (!EMAIL_RE.test(email)) return fail(400, 'Adresse e-mail invalide.');
    if (!subject) return fail(400, "L'objet est obligatoire.");
    if (message.length < 10) return fail(400, 'Merci de détailler votre message (10 caractères minimum).');
    if (
      firstName.length > MAX.name ||
      lastName.length > MAX.name ||
      email.length > MAX.email ||
      company.length > MAX.company ||
      phone.length > MAX.phone ||
      subject.length > MAX.subject ||
      message.length > MAX.message
    ) {
      return fail(400, 'Un des champs dépasse la longueur autorisée.');
    }

    const ip = clientIp(request);

    // Garde-fou anti-flood : pas plus de 5 messages par heure et par adresse e-mail.
    const recent = await prisma.contactMessage.count({
      where: { email, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
    });
    if (recent >= 5) return fail(429, 'Trop de messages envoyés. Réessayez dans une heure.');

    const contact = await prisma.contactMessage.create({
      data: {
        firstName,
        lastName,
        email,
        company: company || null,
        phone: phone || null,
        subject,
        message,
        ip,
        userAgent: request.headers.get('user-agent')?.slice(0, 300) ?? null,
      },
      select: { id: true, createdAt: true },
    });

    const admins = await prisma.user.findMany({ where: { isAdmin: true, status: 'ACTIVE' }, select: { id: true } });
    await notify({
      userIds: admins.map((a) => a.id),
      title: `Nouveau message de contact — ${subject}`,
      body: `${firstName} ${lastName}${company ? ` (${company})` : ''} — ${email}\n\n${message.slice(0, 400)}`,
      link: '/app/admin/contacts',
    });

    await audit({ action: 'contact.create', entity: 'ContactMessage', entityId: contact.id, meta: { email }, ip });

    return ok({ id: contact.id }, 201);
  });
}
