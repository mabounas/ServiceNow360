import { redirect } from 'next/navigation';
import AppHeader from '@/components/app/AppHeader';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/');

  const [unread, newContacts] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    user.isAdmin ? prisma.contactMessage.count({ where: { status: 'NEW' } }) : Promise.resolve(0),
  ]);

  return (
    <div className="app-shell">
      <AppHeader user={user} unread={unread} newContacts={newContacts} />
      <main className="app-main">
        <div className="container-wide">{children}</div>
      </main>
    </div>
  );
}
