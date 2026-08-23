'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AccountStatus, ProjectRole } from '@prisma/client';
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
  memberships: { projectId: string; projectName: string; role: ProjectRole }[];
};

export type ProjectOption = { id: string; name: string; code: string };

export default function AdminUsers({
  users: initial,
  projects,
}: {
  users: UserRow[];
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initial);
  const [filter, setFilter] = useState<'ALL' | AccountStatus>('ALL');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  // Choix d'affectation en cours, par utilisateur.
  const [draft, setDraft] = useState<Record<string, { projectId: string; role: ProjectRole }>>({});

  const visible = users.filter((u) => filter === 'ALL' || u.status === filter);

  const draftFor = (userId: string) => draft[userId] ?? { projectId: '', role: 'USER' as ProjectRole };
  const setDraftFor = (userId: string, patch: Partial<{ projectId: string; role: ProjectRole }>) =>
    setDraft((current) => ({ ...current, [userId]: { ...draftFor(userId), ...patch } }));

  async function patch(userId: string, body: Record<string, unknown>) {
    setError('');
    setMessage('');
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
        return null;
      }
      setUsers((current) => current.map((u) => (u.id === userId ? { ...u, ...data.user } : u)));
      router.refresh();
      return data;
    } finally {
      setBusy(false);
    }
  }

  /**
   * Affectation depuis la fiche utilisateur : un compte en attente — ou désactivé —
   * est réactivé au passage, l'administrateur exprimant justement le droit d'accès.
   */
  async function assign(user: UserRow) {
    const { projectId, role } = draftFor(user.id);
    if (!projectId) {
      setError('Sélectionnez le projet auquel affecter cet utilisateur.');
      return;
    }
    setError('');
    setMessage('');
    setBusy(true);
    try {
      if (user.status === 'DISABLED') {
        const res = await fetch('/api/admin/users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, status: 'ACTIVE' }),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error ?? 'Réactivation impossible.');
          return;
        }
      }

      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Affectation impossible.');
        return;
      }

      const project = projects.find((p) => p.id === projectId);
      setUsers((current) =>
        current.map((u) =>
          u.id === user.id
            ? {
                ...u,
                status: 'ACTIVE',
                memberships: [
                  ...u.memberships.filter((m) => m.projectId !== projectId),
                  { projectId, projectName: project?.name ?? '', role },
                ],
              }
            : u,
        ),
      );
      setDraftFor(user.id, { projectId: '' });
      setMessage(`${user.name} est affecté à « ${project?.name ?? ''} » en tant que ${PROJECT_ROLE_LABEL[role]}.`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function unassign(user: UserRow, projectId: string) {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/members?userId=${user.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Retrait impossible.');
        return;
      }
      setUsers((current) =>
        current.map((u) =>
          u.id === user.id ? { ...u, memberships: u.memberships.filter((m) => m.projectId !== projectId) } : u,
        ),
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error ? <div className="alert alert-error mb-16">{error}</div> : null}
      {message ? <div className="alert alert-ok mb-16">{message}</div> : null}

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

      {projects.length === 0 ? (
        <div className="alert alert-info mb-16">
          Aucun projet n’existe encore. <Link href="/app/admin/projets">Créez un projet</Link> avant d’affecter des
          utilisateurs.
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-head">
          <h3 className="panel-title">Comptes ({visible.length})</h3>
          <span className="small muted">Affecter un utilisateur à un projet active son compte.</span>
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
                  <th style={{ minWidth: 260 }}>Projets et rôles</th>
                  <th style={{ minWidth: 300 }}>Affecter à un projet</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.name}</strong>
                      {u.isAdmin ? (
                        <span className="badge badge-accent" style={{ marginLeft: 8 }}>
                          Admin
                        </span>
                      ) : null}
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
                            <li key={m.projectId} className="row" style={{ gap: 6 }}>
                              <Link href={`/app/projets/${m.projectId}/equipe`} className="link-plain">
                                {m.projectName}
                              </Link>
                              <span className="muted">— {PROJECT_ROLE_LABEL[m.role]}</span>
                              <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => unassign(u, m.projectId)}
                                disabled={busy}
                              >
                                Retirer
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                        <select
                          className="input"
                          aria-label={`Projet pour ${u.name}`}
                          value={draftFor(u.id).projectId}
                          onChange={(e) => setDraftFor(u.id, { projectId: e.target.value })}
                          disabled={projects.length === 0}
                        >
                          <option value="">— Projet —</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.code} — {p.name}
                            </option>
                          ))}
                        </select>
                        <select
                          className="input"
                          aria-label={`Rôle pour ${u.name}`}
                          value={draftFor(u.id).role}
                          onChange={(e) => setDraftFor(u.id, { role: e.target.value as ProjectRole })}
                        >
                          {(Object.keys(PROJECT_ROLE_LABEL) as ProjectRole[]).map((key) => (
                            <option key={key} value={key}>
                              {PROJECT_ROLE_LABEL[key]}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn btn-primary nowrap"
                          onClick={() => assign(u)}
                          disabled={busy || projects.length === 0}
                        >
                          Affecter
                        </button>
                      </div>
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
