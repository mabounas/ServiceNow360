import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { canEditPlanning, getProjectAccess } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import PlanImport from '@/components/app/PlanImport';

export const dynamic = 'force-dynamic';

export default async function PlanImportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { role } = await getProjectAccess(user, id);
  if (!canEditPlanning(role)) notFound();

  const existingTasks = await prisma.task.count({ where: { projectId: id } });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">Module 2 — Suivi de projet</div>
          <h1 className="page-title">Importer un planning</h1>
        </div>
        <div className="page-actions">
          <Link href={`/app/projets/${id}/planning`} className="btn btn-secondary">
            Retour au planning
          </Link>
        </div>
      </div>

      <div className="alert alert-info mb-24">
        <strong>Format attendu</strong>
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          Une feuille comportant les colonnes <strong>PHASE</strong>, <strong>TÂCHE / LIVRABLE</strong>,{' '}
          <strong>RESPONSABLE</strong> et <strong>TYPE</strong>, suivies d’une colonne par semaine intitulée
          <strong> S1, S2…</strong> ou <strong>Sem 1, Sem 2…</strong> La phase n’est portée que par sa première ligne,
          les cellules de semaine cochées ou colorées définissent la période, et un TYPE contenant « Jalon » crée un jalon.
        </p>
      </div>

      <PlanImport projectId={id} existingTasks={existingTasks} />
    </>
  );
}
