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
  const [busy, setBusy] = useState(false);
  // Choix d'affectation en cours, par utilisateur.
  const [draft, setDraft] = useState<Record<string, { projectId: string; role: ProjectRole }>>({});

  const visible = users.filter((u) => filter === 'ALL' || u.status === filter);

  // Retour affiché sur la ligne concernée : la page est longue, un message en haut passe inaperçu.
  const [notice, setNotice] = useState<Record<string, { tone: 'ok' | 'error' | 'info'; text: string }>>({});
  const say = (userId: string, tone: 'ok' | 'error' | 'info', text: string) =>
    setNotice((current) => ({ ...current, [userId]: { tone, text } }));

  const membershipOf = (user: UserRow, projectId: string) => user.memberships.find((m) => m.projectId === projectId);

  /** Par défaut : le seul projet auquel l'utilisateur n'est pas encore affecté, s'il n'y en a qu'un. */
  const defaultDraft = (user: UserRow) => {
    const free = projects.filter((p) => !membershipOf(user, p.id));
    return { projectId: free.length === 1 ? free[0].id : '', role: 'MEMBER' as ProjectRole };
  };
  const draftFor = (user: UserRow) => draft[user.id] ?? defaultDraft(user);
  const setDraftFor = (user: UserRow, patch: Partial<{ projectId: string; role: ProjectRole }>) =>
    setDraft((current) => ({ ...current, [user.id]: { ...(current[user.id] ?? defaultDraft(user)), ...patch } }));

  /** Choisir un projet déjà attribué reprend le rôle actuel, pour ne proposer qu'un vrai changement. */
  const chooseProject = (user: UserRow, projectId: string) => {
    const existing = membershipOf(user, projectId);
    setDraftFor(user, existing ? { projectId, role: existing.role } : { projectId });
    setNotice((current) => {
      const next = { ...current };
      delete next[user.id];
      return next;
    });
  };

  async function patch(userId: string, body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...body }),
      });
      const data = await res.json();
      if (!res.ok) {
        say(userId, 'error', data.error ?? 'Opération impossible.');
        return null;
      }
      setUsers((current) => current.map((u) => (u.id === userId ? { ...u, ...data.user } : u)));
      say(
        userId,
        'ok',
        body.status === 'ACTIVE'
          ? 'Compte activé.'
          : body.status === 'DISABLED'
            ? 'Compte désactivé.'
            : body.isAdmin
              ? 'Droits administrateur accordés.'
              : 'Droits administrateur retirés.',
      );
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
    const { projectId, role } = draftFor(user);
    const project = projects.find((p) => p.id === projectId);
    if (!projectId || !project) {
      say(user.id, 'error', 'Choisissez d’abord un projet dans la liste.');
      return;
    }
    const existing = membershipOf(user, projectId);
    if (existing && existing.role === role && user.status === 'ACTIVE') {
      say(user.id, 'info', `Déjà affecté à « ${project.name} » en tant que ${PROJECT_ROLE_LABEL[role]} : rien à modifier.`);
      return;
    }
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
          say(user.id, 'error', data.error ?? 'Réactivation impossible.');
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
        say(user.id, 'error', data.error ?? 'Affectation impossible.');
        return;
      }

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
      // On ne réinitialise la ligne que si la sélection n'a pas changé entre-temps.
      setDraft((current) =>
        current[user.id]?.projectId === projectId || !current[user.id]
          ? { ...current, [user.id]: { projectId: '', role: 'MEMBER' } }
          : current,
      );
      say(
        user.id,
        'ok',
        existing
          ? `Rôle modifié : ${PROJECT_ROLE_LABEL[role]} sur « ${project.name} ».`
          : `Affecté à « ${project.name} » en tant que ${PROJECT_ROLE_LABEL[role]}.`,
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function unassign(user: UserRow, projectId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/members?userId=${user.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        say(user.id, 'error', data.error ?? 'Retrait impossible.');
        return;
      }
      setUsers((current) =>
        current.map((u) =>
          u.id === user.id ? { ...u, memberships: u.memberships.filter((m) => m.projectId !== projectId) } : u,
        ),
      );
      say(user.id, 'ok', `Retiré du projet « ${projects.find((p) => p.id === projectId)?.name ?? ''} ».`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>

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
                  <th style={{ minWidth: 420 }}>Affecter à un projet</th>
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
                          title={projects.find((p) => p.id === draftFor(u).projectId)?.name ?? 'Choisir un projet'}
                          value={draftFor(u).projectId}
                          onChange={(e) => chooseProject(u, e.target.value)}
                          disabled={projects.length === 0}
                          style={{ minWidth: 180 }}
                        >
                          <option value="">Choisir un projet…</option>
                          {projects.map((p) => {
                            const existing = membershipOf(u, p.id);
                            return (
                              <option key={p.id} value={p.id}>
                                {p.name}
                                {existing ? ` — déjà ${PROJECT_ROLE_LABEL[existing.role]}` : ''}
                              </option>
                            );
                          })}
                        </select>
                        <select
                          className="input"
                          aria-label={`Rôle pour ${u.name}`}
                          value={draftFor(u).role}
                          onChange={(e) => setDraftFor(u, { role: e.target.value as ProjectRole })}
                          style={{ minWidth: 150 }}
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
                          {membershipOf(u, draftFor(u).projectId) ? 'Modifier le rôle' : 'Affecter'}
                        </button>
                      </div>
                      {notice[u.id] ? (
                        <div
                          role="status"
                          className={`alert mt-8 ${
                            notice[u.id].tone === 'ok' ? 'alert-ok' : notice[u.id].tone === 'error' ? 'alert-error' : 'alert-info'
                          }`}
                          style={{ padding: '6px 10px' }}
                        >
                          {notice[u.id].text}
                        </div>
                      ) : null}
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
