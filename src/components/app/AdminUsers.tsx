'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AccountStatus } from '@prisma/client';
import { ACCOUNT_STATUS_LABEL, PROJECT_ROLE_LABEL, formatDate } from '@/lib/labels';

export type UserRow = {
  id: string;
  name: string;
  email: string;
  company: string;
  jobRole: string | null;
  status: AccountStatus;
  isAdmin: boolean;
  createdAt: string;
  memberships: { projectId: string; projectName: string; role: keyof typeof PROJECT_ROLE_LABEL }[];
};

export default function AdminUsers({ users: initial }: { users: UserRow[] }) {
  const router = useRouter();
  const [users, setUsers] = useState(initial);
  const [filter, setFilter] = useState<'ALL' | AccountStatus>('ALL');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const visible = users.filter((u) => filter === 'ALL' || u.status === filter);

  async function patch(userId: string, body: Record<string, unknown>) {
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Opération impossible.');
        return;
      }
      setUsers((current) => current.map((u) => (u.id === userId ? { ...u, ...data.user } : u)));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error ? <div className="alert alert-error mb-16">{error}</div> : null}

      <div className="row mb-16">
        {(['ALL', 'PENDING', 'ACTIVE', 'DISABLED'] as const).map((key) => (
          <button
            key={key}
            type="button"
            className={`btn ${filter === key ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(key)}
          >
            {key === 'ALL' ? 'Tous' : ACCOUNT_STATUS_LABEL[key]} (
            {key === 'ALL' ? users.length : users.filter((u) => u.status === key).length})
          </button>
        ))}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3 className="panel-title">Comptes ({visible.length})</h3>
          <span className="small muted">Un compte devient actif dès son affectation à un projet.</span>
        </div>
        <div className="panel-body panel-body-flush table-wrap">
          {visible.length === 0 ? (
            <div className="empty">Aucun compte dans cette catégorie.</div>
          ) : (
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Utilisateur</th>
                  <th>Société</th>
                  <th>Inscrit le</th>
                  <th>Statut</th>
                  <th>Projets et rôles</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.name}</strong>
                      {u.isAdmin ? <span className="badge badge-accent" style={{ marginLeft: 8 }}>Admin</span> : null}
                      <div className="small muted">{u.email}</div>
                      {u.jobRole ? <div className="small muted">{u.jobRole}</div> : null}
                    </td>
                    <td className="small">{u.company}</td>
                    <td className="small mono nowrap">{formatDate(u.createdAt)}</td>
                    <td className="small">{ACCOUNT_STATUS_LABEL[u.status]}</td>
                    <td className="small">
                      {u.memberships.length === 0 ? (
                        <span className="muted">Aucun projet</span>
                      ) : (
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                          {u.memberships.map((m) => (
                            <li key={m.projectId}>
                              <Link href={`/app/projets/${m.projectId}/equipe`} className="link-plain">
                                {m.projectName}
                              </Link>{' '}
                              <span className="muted">— {PROJECT_ROLE_LABEL[m.role]}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="text-right nowrap">
                      {u.status !== 'ACTIVE' ? (
                        <button type="button" className="btn btn-ghost" onClick={() => patch(u.id, { status: 'ACTIVE' })} disabled={busy}>
                          Activer
                        </button>
                      ) : (
                        <button type="button" className="btn btn-ghost" onClick={() => patch(u.id, { status: 'DISABLED' })} disabled={busy}>
                          Désactiver
                        </button>
                      )}
                      <button type="button" className="btn btn-ghost" onClick={() => patch(u.id, { isAdmin: !u.isAdmin })} disabled={busy}>
                        {u.isAdmin ? 'Retirer admin' : 'Passer admin'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
