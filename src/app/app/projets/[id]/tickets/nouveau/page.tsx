import { requireUser } from '@/lib/auth';
import { notFound } from 'next/navigation';
import { canContribute, getProjectAccess } from '@/lib/rbac';
import NewTicketForm from '@/components/app/NewTicketForm';

export const dynamic = 'force-dynamic';

export default async function NewTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { role } = await getProjectAccess(user, id);
  if (!canContribute(role)) notFound();

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">Module 1 — Déclaration</div>
          <h1 className="page-title">Déclarer une anomalie ou une demande</h1>
        </div>
      </div>
      <NewTicketForm projectId={id} />
    </>
  );
}
