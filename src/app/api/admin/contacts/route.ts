import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { csvResponse, fail, handle, ok, toCsv } from '@/lib/api';
import { audit } from '@/lib/audit';
import { formatDateTime } from '@/lib/labels';
import type { ContactStatus } from '@prisma/client';

const STATUS_LABEL: Record<ContactStatus, string> = {
  NEW: 'Nouveau',
  READ: 'Lu',
  HANDLED: 'Traité',
  ARCHIVED: 'Archivé',
};

export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    if (!user.isAdmin) return fail(403, 'Réservé à l’administrateur.');

    const params = new URL(request.url).searchParams;
    const status = params.get('status');
    const q = params.get('q')?.trim();

    const contacts = await prisma.contactMessage.findMany({
      where: {
        status: status ? (status as ContactStatus) : undefined,
        OR: q
          ? [
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { company: { contains: q, mode: 'insensitive' } },
              { subject: { contains: q, mode: 'insensitive' } },
              { message: { contains: q, mode: 'insensitive' } },
            ]
          : undefined,
      },
      include: { handledBy: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    if (params.get('format') === 'csv') {
      const rows = contacts.map((c) => ({
        date: formatDateTime(c.createdAt),
        nom: `${c.firstName} ${c.lastName}`,
        email: c.email,
        societe: c.company ?? '',
        telephone: c.phone ?? '',
        objet: c.subject,
        message: c.message,
        statut: STATUS_LABEL[c.status],
        traitePar: c.handledBy ? `${c.handledBy.firstName} ${c.handledBy.lastName}` : '',
      }));
      return csvResponse(
        `contacts-${new Date().toISOString().slice(0, 10)}.csv`,
        toCsv(rows, [
          { key: 'date', label: 'Reçu le' },
          { key: 'nom', label: 'Nom' },
          { key: 'email', label: 'E-mail' },
          { key: 'societe', label: 'Société' },
          { key: 'telephone', label: 'Téléphone' },
          { key: 'objet', label: 'Objet' },
          { key: 'message', label: 'Message' },
          { key: 'statut', label: 'Statut' },
          { key: 'traitePar', label: 'Traité par' },
        ]),
      );
    }

    return ok({ contacts });
  });
}

/** Changement de statut et note interne. */
export async function PATCH(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    if (!user.isAdmin) return fail(403, 'Réservé à l’administrateur.');

    const body = await request.json();
    const id = String(body.id ?? '');
    const existing = await prisma.contactMessage.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return fail(404, 'Message introuvable.');

    const status = body.status as ContactStatus | undefined;
    const contact = await prisma.contactMessage.update({
      where: { id },
      data: {
        status: status ?? undefined,
        internalNote: body.internalNote !== undefined ? String(body.internalNote).trim() || null : undefined,
        handledById: status === 'HANDLED' ? user.id : undefined,
        handledAt: status === 'HANDLED' ? new Date() : undefined,
      },
      include: { handledBy: { select: { firstName: true, lastName: true } } },
    });

    await audit({ userId: user.id, action: 'contact.update', entity: 'ContactMessage', entityId: id, meta: { status } });
    return ok({ contact });
  });
}

export async function DELETE(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    if (!user.isAdmin) return fail(403, 'Réservé à l’administrateur.');

    const id = new URL(request.url).searchParams.get('id');
    if (!id) return fail(400, 'Identifiant manquant.');

    const existing = await prisma.contactMessage.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return fail(404, 'Message introuvable.');

    await prisma.contactMessage.delete({ where: { id } });
    await audit({ userId: user.id, action: 'contact.delete', entity: 'ContactMessage', entityId: id });
    return ok({ ok: true });
  });
}
