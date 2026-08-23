import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import AdminContacts from '@/components/app/AdminContacts';
import { fullName } from '@/lib/labels';

export const dynamic = 'force-dynamic';

export default async function AdminContactsPage() {
  const user = await requireUser();
  if (!user.isAdmin) notFound();

  const contacts = await prisma.contactMessage.findMany({
    include: { handledBy: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">Administration</div>
          <h1 className="page-title">Messages de contact</h1>
        </div>
      </div>

      <AdminContacts
        contacts={contacts.map((c) => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          company: c.company,
          phone: c.phone,
          subject: c.subject,
          message: c.message,
          status: c.status,
          internalNote: c.internalNote,
          handledByName: c.handledBy ? fullName(c.handledBy) : null,
          handledAt: c.handledAt ? c.handledAt.toISOString() : null,
          createdAt: c.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
