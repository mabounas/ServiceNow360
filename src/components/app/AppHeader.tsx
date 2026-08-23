'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

type Props = {
  user: { firstName: string; lastName: string; isAdmin: boolean };
  unread: number;
  newContacts: number;
};

export default function AppHeader({ user, unread, newContacts }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) => (href === '/app' ? pathname === '/app' : pathname.startsWith(href));

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  return (
    <header className="app-bar no-print">
      <div className="app-bar-inner">
        <Link href="/app" className="brand">
          <span className="brand-mark" />
          <span className="brand-name">ServiceNow360</span>
        </Link>

        <nav className="app-nav">
          <Link href="/app" className={isActive('/app') ? 'is-active' : ''}>
            Mes projets
          </Link>
          <Link href="/app/notifications" className={isActive('/app/notifications') ? 'is-active' : ''}>
            Notifications{unread > 0 ? ` (${unread})` : ''}
          </Link>
          {user.isAdmin ? (
            <>
              <Link href="/app/admin/projets" className={isActive('/app/admin/projets') ? 'is-active' : ''}>
                Projets
              </Link>
              <Link href="/app/admin/utilisateurs" className={isActive('/app/admin/utilisateurs') ? 'is-active' : ''}>
                Utilisateurs
              </Link>
              <Link href="/app/admin/contacts" className={isActive('/app/admin/contacts') ? 'is-active' : ''}>
                Contacts{newContacts > 0 ? ` (${newContacts})` : ''}
              </Link>
            </>
          ) : null}
        </nav>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="small muted nowrap">
            {user.firstName} {user.lastName}
          </span>
          <button type="button" className="btn btn-secondary" onClick={logout}>
            Se déconnecter
          </button>
        </div>
      </div>
    </header>
  );
}
