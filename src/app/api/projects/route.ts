import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { listAccessibleProjects } from '@/lib/rbac';
import { fail, handle, ok } from '@/lib/api';
import { audit } from '@/lib/audit';

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const projects = await listAccessibleProjects(user);
    return ok({ projects });
  });
}

/** Création d'un projet — administrateur uniquement (§5.2). */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    if (!user.isAdmin) return fail(403, "Seul l'administrateur peut créer un projet.");

    const body = await request.json();
    const code = String(body.code ?? '').trim().toUpperCase();
    const name = String(body.name ?? '').trim();
    const clientName = String(body.clientName ?? '').trim();
    if (!code || !name || !clientName) return fail(400, 'Code, nom et client sont obligatoires.');

    const existing = await prisma.project.findUnique({ where: { code }, select: { id: true } });
    if (existing) return fail(409, 'Ce code projet est déjà utilisé.');

    const project = await prisma.project.create({
      data: {
        code,
        name,
        clientName,
        description: body.description ? String(body.description).trim() : null,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
      },
    });

    await audit({ userId: user.id, action: 'project.create', entity: 'Project', entityId: project.id, meta: { code } });
    return ok({ project }, 201);
  });
}
