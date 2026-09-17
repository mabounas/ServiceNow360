import { prisma } from './prisma';
import { appUrl, sendMail } from './mail';

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

async function sendEmails(recipients: { email: string }[], input: NotifyInput) {
  if (recipients.length === 0) return false;
  return sendMail({
    bcc: recipients.map((r) => r.email),
    subject: input.title,
    text: input.link ? `${input.body}\n\n${appUrl()}${input.link}` : input.body,
  });
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
