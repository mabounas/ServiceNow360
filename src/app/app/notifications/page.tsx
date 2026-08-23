import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatDateTime } from '@/lib/labels';
import MarkAllRead from '@/components/app/MarkAllRead';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">Module 5 — Notifications</div>
          <h1 className="page-title">Vos notifications</h1>
        </div>
        <div className="page-actions">{unread > 0 ? <MarkAllRead /> : null}</div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3 className="panel-title">{notifications.length} notification(s)</h3>
          <span className="small muted">{unread} non lue(s)</span>
        </div>
        <div className="panel-body panel-body-flush">
          {notifications.length === 0 ? (
            <div className="empty">Aucune notification.</div>
          ) : (
            <div className="thread" style={{ borderTop: 0 }}>
              {notifications.map((n) => (
                <div key={n.id} className="thread-item" style={{ padding: '14px 18px' }}>
                  <div className="thread-meta">
                    <span className="thread-author">{n.title}</span>
                    <span className="muted">{formatDateTime(n.createdAt)}</span>
                    {!n.readAt ? <span className="badge badge-accent">Nouveau</span> : null}
                    {n.emailSentAt ? <span className="badge badge-neutral">E-mail envoyé</span> : null}
                  </div>
                  <p className="thread-body">{n.body}</p>
                  {n.link ? (
                    <Link href={n.link} className="small">
                      Ouvrir
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
