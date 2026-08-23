'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function ProjectNav({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const pathname = usePathname();
  const base = `/app/projets/${projectId}`;

  const items = [
    { href: base, label: 'Tableau de bord', exact: true },
    { href: `${base}/tickets`, label: 'Tickets' },
    { href: `${base}/planning`, label: 'Planning / Gantt' },
    { href: `${base}/risques`, label: 'Risques' },
    ...(canManage ? [{ href: `${base}/equipe`, label: 'Équipe' }] : []),
  ];

  return (
    <nav className="app-nav no-print" style={{ marginLeft: 0, marginBottom: 24, borderBottom: '1px solid var(--color-divider)', paddingBottom: 12 }}>
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} className={active ? 'is-active' : ''}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
