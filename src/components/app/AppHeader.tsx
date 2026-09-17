'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

type Props = {
  user: { firstName: string; lastName: string; isAdmin: boolean };
  unread: number;
  newContacts: number;
};

export default function AppHeader({ user, unread, newContacts }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  // Sur mobile, la navigation se replie derrière un bouton « Menu ».
  const [open, setOpen] = useState(false);

  // Changer de page referme le menu.
  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) => (href === '/app' ? pathname === '/app' : pathname.startsWith(href));

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  const badge = unread + newContacts;

  return (
    <header className={`app-bar no-print ${open ? 'is-open' : ''}`}>
      <div className="app-bar-inner">
        <Link href="/app" className="brand">
          <span className="brand-mark" />
          <span className="brand-name">ServiceDesk360</span>
        </Link>

        <button
          type="button"
          className="app-menu-toggle"
          aria-expanded={open}
          aria-controls="app-menu"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Fermer' : 'Menu'}
          {!open && badge > 0 ? <span className="app-menu-dot">{badge}</span> : null}
        </button>

        <div className="app-menu" id="app-menu">
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

          <div className="app-user">
            <span className="small muted nowrap">
              {user.firstName} {user.lastName}
            </span>
            <button type="button" className="btn btn-secondary" onClick={logout}>
              Se déconnecter
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
