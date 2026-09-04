import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { canEditPlanning, getProjectAccess } from '@/lib/rbac';
import { fail, handle, ok } from '@/lib/api';
import { audit } from '@/lib/audit';
import { parsePlanWorkbook } from '@/lib/planImport';

type Params = { params: Promise<{ id: string }> };

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Import d'un planning depuis un classeur Excel (§4.2.1).
 *
 * `dryRun` renvoie l'aperçu sans rien écrire : l'administrateur valide ce qu'il
 * voit avant que la moindre tâche ne soit créée.
 */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const access = await getProjectAccess(user, id);
    if (!canEditPlanning(access.role)) {
      return fail(403, 'Seul le chef de projet ou un administrateur peut importer un planning.');
    }

    const body = await request.json().catch(() => null);
    if (!body?.file) return fail(400, 'Aucun fichier reçu.');

    const base64 = String(body.file).replace(/^data:[^;]*;base64,/, '');
    const bytes = Buffer.from(base64, 'base64');
    if (!bytes.length) return fail(400, 'Fichier vide ou illisible.');
    if (bytes.length > MAX_BYTES) return fail(400, 'Fichier trop volumineux (8 Mo maximum).');

    const startDate = new Date(String(body.startDate ?? ''));
    if (Number.isNaN(startDate.getTime())) {
      return fail(400, 'Indiquez la date de début de la semaine 1.');
    }

    let plan;
    try {
      plan = await parsePlanWorkbook(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
        startDate,
      );
    } catch (error) {
      return fail(400, error instanceof Error ? error.message : 'Fichier illisible.');
    }

    const existing = await prisma.task.count({ where: { projectId: id } });

    if (body.dryRun) {
      return ok({ plan, existingTasks: existing, willReplace: Boolean(body.replace) });
    }

    if (existing > 0 && !body.replace) {
      return fail(
        409,
        `Ce projet contient déjà ${existing} tâche(s). Cochez le remplacement pour repartir du fichier.`,
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      if (body.replace && existing > 0) {
        // Les tickets rattachés survivent : le lien est simplement détaché.
        await tx.ticket.updateMany({ where: { projectId: id, taskId: { not: null } }, data: { taskId: null } });
        await tx.task.deleteMany({ where: { projectId: id } });
      }

      let order = 0;
      let phases = 0;
      let tasks = 0;

      for (const phase of plan.phases) {
        const parent = await tx.task.create({
          data: {
            projectId: id,
            name: phase.name,
            startDate: new Date(phase.startDate),
            endDate: new Date(phase.endDate),
            sortOrder: (order += 10),
          },
        });
        phases += 1;

        for (const task of phase.tasks) {
          await tx.task.create({
            data: {
              projectId: id,
              parentId: parent.id,
              name: task.name,
              // Le responsable du fichier est un rôle, pas un compte : on le
              // conserve en clair pour pouvoir l'affecter ensuite.
              description: task.ownerLabel ? `Responsable au planning source : ${task.ownerLabel}` : null,
              startDate: new Date(task.startDate),
              endDate: new Date(task.endDate),
              isMilestone: task.isMilestone,
              sortOrder: (order += 10),
            },
          });
          tasks += 1;
        }
      }

      return { phases, tasks };
    });

    await audit({
      userId: user.id,
      action: 'plan.import',
      entity: 'Project',
      entityId: id,
      meta: { ...created, replaced: Boolean(body.replace), sheet: plan.sheetName },
    });

    return ok({ imported: created, warnings: plan.warnings }, 201);
  });
}
