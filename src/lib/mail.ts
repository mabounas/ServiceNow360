/**
 * Envoi d'e-mails via SMTP (variables SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM).
 * Sans configuration, l'envoi est ignoré et `sendMail` renvoie false.
 */
export function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

export function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
}

export async function sendMail(message: {
  to?: string | string[];
  cc?: string | string[];
  bcc?: string[];
  replyTo?: string;
  subject: string;
  text: string;
  html?: string;
}) {
  if (!smtpConfigured()) return false;
  try {
    // nodemailer est chargé dynamiquement : le portail fonctionne sans dépendance e-mail.
    const mod = await import('nodemailer').catch(() => null);
    if (!mod) return false;
    const port = Number(process.env.SMTP_PORT ?? 587);
    const transport = mod.default.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      ...message,
    });
    return true;
  } catch (error) {
    console.error('Envoi e-mail impossible', error);
    return false;
  }
}
