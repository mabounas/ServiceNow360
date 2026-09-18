import { prisma } from './prisma';
import { appUrl, sendMail } from './mail';
import { TICKET_STATUS_LABEL } from './labels';
import type { TicketStatus } from '@prisma/client';

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

// ─────────────────────────────────────────────────────────────────────────────
// Alertes de mise à jour d'un ticket
// ─────────────────────────────────────────────────────────────────────────────

/** Adresse mise en copie de chaque alerte ticket (par défaut : la boîte d'envoi, helpdesk). */
export function ticketMailCc() {
  const raw = process.env.TICKET_MAIL_CC ?? process.env.SMTP_USER ?? '';
  return raw.trim().toLowerCase();
}

export type TicketForAlert = {
  id: string;
  reference: string;
  title: string;
  status: TicketStatus;
  projectId: string;
  createdById: string;
  assigneeId: string | null;
};

/**
 * Mise à jour d'un ticket :
 * - notification dans l'application pour l'équipe concernée (sauf l'auteur de l'action) ;
 * - un seul e-mail adressé au déclarant et à la personne en charge du ticket,
 *   avec helpdesk en copie.
 */
export async function notifyTicketUpdate(input: {
  ticket: TicketForAlert;
  actor: { id: string; firstName: string; lastName: string };
  /** Objet court : « Nouveau commentaire », « Statut : En cours »… */
  headline: string;
  /** Détail de la mise à jour, une ligne par changement. */
  lines: string[];
  /** Personnes à prévenir en plus dans l'application (ex. nouvel assigné). */
  extraUserIds?: string[];
}) {
  const { ticket, actor, headline, lines } = input;
  const link = `/app/tickets/${ticket.id}`;
  const title = `${ticket.reference} — ${headline}`;
  const body = [ticket.title, ...lines].join('\n');

  // 1. Dans l'application
  const audience = [...(await ticketAudience(ticket.projectId, ticket)), ...(input.extraUserIds ?? [])];
  const inApp = [...new Set(audience)].filter((id) => id && id !== actor.id);
  const inAppUsers = inApp.length
    ? await prisma.user.findMany({ where: { id: { in: inApp }, status: 'ACTIVE' }, select: { id: true } })
    : [];

  // 2. Par e-mail : déclarant + personne en charge, helpdesk en copie
  const people = await prisma.user.findMany({
    where: { id: { in: [ticket.createdById, ticket.assigneeId ?? ''].filter(Boolean) }, status: 'ACTIVE' },
    select: { id: true, email: true, firstName: true },
  });
  const cc = ticketMailCc();
  const to = [...new Set(people.map((p) => p.email.toLowerCase()))].filter((e) => e !== cc);
  const recipients = to.length ? to : cc ? [cc] : [];
  let emailed = false;
  if (recipients.length) {
    const url = `${appUrl()}${link}`;
    const actorName = `${actor.firstName} ${actor.lastName}`.trim();
    const statusLabel = TICKET_STATUS_LABEL[ticket.status];
    emailed = await sendMail({
      to: recipients,
      cc: to.length && cc ? cc : undefined,
      subject: `[ServiceDesk360] ${ticket.reference} — ${ticket.title} : ${headline}`,
      text: [
        'Bonjour,',
        '',
        `${actorName} a mis à jour le ticket ${ticket.reference} « ${ticket.title} ».`,
        '',
        ...lines.map((l) => `• ${l}`),
        '',
        `Statut actuel : ${statusLabel}`,
        `Consulter le ticket : ${url}`,
        '',
        '— ServiceDesk360',
      ].join('\n'),
      html: ticketMailHtml({ ticket, actorName, headline, lines, statusLabel, url }),
    });
  }

  if (inAppUsers.length) {
    await prisma.notification.createMany({
      data: inAppUsers.map((u) => ({
        userId: u.id,
        title,
        body,
        link,
        emailSentAt: emailed && people.some((p) => p.id === u.id) ? new Date() : null,
      })),
    });
  }
  return { emailed, to: recipients, cc: to.length ? cc : null };
}

function esc(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function ticketMailHtml(p: { ticket: TicketForAlert; actorName: string; headline: string; lines: string[]; statusLabel: string; url: string }) {
  const items = p.lines.map((l) => `<li style="margin:0 0 6px">${esc(l).replace(/\n/g, '<br>')}</li>`).join('');
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f2f2;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f2f2"><tr><td align="center" style="padding:20px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #dddcdc">
<tr><td style="padding:16px 24px;border-bottom:3px solid #ec3013;font-size:17px;font-weight:bold">
<span style="display:inline-block;width:14px;height:14px;background:#ec3013;vertical-align:-1px;margin-right:8px"></span>ServiceDesk360</td></tr>
<tr><td style="padding:22px 24px 6px">
<div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#ec3013;font-weight:bold">${esc(p.ticket.reference)} · ${esc(p.headline)}</div>
<h1 style="margin:8px 0 0;font-size:20px;line-height:26px">${esc(p.ticket.title)}</h1></td></tr>
<tr><td style="padding:12px 24px;font-size:15px;line-height:23px;color:#333">
<p style="margin:0 0 10px"><strong>${esc(p.actorName)}</strong> a mis à jour ce ticket :</p>
<ul style="margin:0 0 12px;padding-left:20px">${items}</ul>
<p style="margin:0">Statut actuel : <strong>${esc(p.statusLabel)}</strong></p></td></tr>
<tr><td style="padding:14px 24px 26px">
<a href="${p.url}" style="display:inline-block;background:#ec3013;color:#ffffff;text-decoration:none;font-weight:bold;padding:13px 22px">Ouvrir le ticket</a></td></tr>
<tr><td style="padding:12px 24px;background:#1a1a1a;color:#bbbbbb;font-size:12px">Message automatique de ServiceDesk360 — répondez directement dans le ticket.</td></tr>
</table></td></tr></table></body></html>`;
}
