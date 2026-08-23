import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { canManageMembers, getProjectAccess } from '@/lib/rbac';
import { fail, handle, ok } from '@/lib/api';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notify';
import { PROJECT_ROLE_LABEL } from '@/lib/labels';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    await getProjectAccess(user, id);

    const members = await prisma.projectMember.findMany({
      where: { projectId: id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, company: true, status: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return ok({ members });
  });
}

/**
 * §2.4 / §5.2 — affectation d'un utilisateur au projet avec son rôle.
 * L'affectation active le compte s'il était encore en attente.
 */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const access = await getProjectAccess(user, id);
    if (!canManageMembers(user, access.role)) return fail(403, 'Droits insuffisants pour affecter un utilisateur.');

    const body = await request.json();
    const userId = String(body.userId ?? '');
    const role = body.role ?? 'USER';
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, status: true } });
    if (!target) return fail(404, 'Utilisateur introuvable.');

    const member = await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: id, userId } },
      create: { projectId: id, userId, role },
      update: { role },
    });

    if (target.status === 'PENDING') {
      await prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
    }

    const project = await prisma.project.findUnique({ where: { id }, select: { name: true } });
    await notify({
      userIds: [userId],
      title: 'Accès accordé à un projet',
      body: `Vous êtes affecté au projet « ${project?.name ?? ''} » en tant que ${PROJECT_ROLE_LABEL[role as keyof typeof PROJECT_ROLE_LABEL]}.`,
      link: `/app/projets/${id}`,
    });
    await audit({ userId: user.id, action: 'project.member.assign', entity: 'ProjectMember', entityId: member.id, meta: { projectId: id, userId, role } });

    return ok({ member }, 201);
  });
}

/** Retrait d'un utilisateur du projet (§5.2). */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const access = await getProjectAccess(user, id);
    if (!canManageMembers(user, access.role)) return fail(403, 'Droits insuffisants pour retirer un utilisateur.');

    const userId = new URL(request.url).searchParams.get('userId');
    if (!userId) return fail(400, 'Utilisateur non précisé.');

    await prisma.projectMember.deleteMany({ where: { projectId: id, userId } });
    await audit({ userId: user.id, action: 'project.member.remove', entity: 'ProjectMember', meta: { projectId: id, userId } });

    return ok({ ok: true });
  });
}
