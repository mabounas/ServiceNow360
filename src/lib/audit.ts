import { prisma } from './prisma';

/** §6.3 — journalisation des actions sensibles (traçabilité / audit log). */
export async function audit(params: {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
  ip?: string | null;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        meta: (params.meta ?? undefined) as never,
        ip: params.ip ?? null,
      },
    });
  } catch (error) {
    console.error('Audit log impossible', error);
  }
}

export function clientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? null;
}
