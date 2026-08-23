import { prisma } from './prisma';

/**
 * Module 5 — notifications.
 *
 * Les notifications sont systématiquement écrites en base (canal in-app).
 * Si une configuration SMTP est présente, un e-mail est également envoyé ;
 * sinon l'envoi est silencieusement ignoré et `emailSentAt` reste nul.
 */
export type NotifyInput = {
  userIds: string[];
  title: string;
  body: string;
  link?: string;
};

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

async function sendEmails(recipients: { email: string }[], input: NotifyInput) {
  if (!smtpConfigured() || recipients.length === 0) return false;
  try {
    // nodemailer est chargé dynamiquement : le portail fonctionne sans dépendance e-mail.
    const mod = await import('nodemailer').catch(() => null);
    if (!mod) return false;
    const transport = mod.default.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
    const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
    await transport.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      bcc: recipients.map((r) => r.email),
      subject: input.title,
      text: input.link ? `${input.body}\n\n${base}${input.link}` : input.body,
    });
    return true;
  } catch (error) {
    console.error('Envoi e-mail impossible', error);
    return false;
  }
}

export async function notify(input: NotifyInput) {
  const userIds = [...new Set(input.userIds)].filter(Boolean);
  if (userIds.length === 0) return;

  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, status: 'ACTIVE' },
    select: { id: true, email: true },
  });
  if (users.length === 0) return;

  const emailed = await sendEmails(users, input);

  await prisma.notification.createMany({
    data: users.map((u) => ({
      userId: u.id,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
      emailSentAt: emailed ? new Date() : null,
    })),
  });
}

/** Destinataires métier d'un ticket : initiateur, assigné, chefs de projet et superviseurs. */
export async function ticketAudience(projectId: string, ticket: { createdById: string; assigneeId: string | null }) {
  const members = await prisma.projectMember.findMany({
    where: { projectId, role: { in: ['PROJECT_MANAGER', 'SUPERVISOR'] } },
    select: { userId: true },
  });
  return [ticket.createdById, ticket.assigneeId ?? '', ...members.map((m) => m.userId)].filter(Boolean);
}
