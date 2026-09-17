'use client';

import Link from 'next/link';
import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AccountStatus, ProjectRole } from '@prisma/client';
import { ACCOUNT_STATUS_LABEL, PROJECT_ROLE_LABEL, formatDate } from '@/lib/labels';

export type UserRow = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  jobRole: string | null;
  phone: string | null;
  country: string | null;
  status: AccountStatus;
  isAdmin: boolean;
  createdAt: string;
  memberships: { projectId: string; projectName: string; role: ProjectRole }[];
};

type Profile = { firstName: string; lastName: string; email: string; company: string; jobRole: string; phone: string; country: string };

const PROFILE_INPUTS: { key: keyof Profile; label: string; type?: string; required?: boolean }[] = [
  { key: 'firstName', label: 'Prénom', required: true },
  { key: 'lastName', label: 'Nom', required: true },
  { key: 'email', label: 'Adresse e-mail (identifiant de connexion)', type: 'email', required: true },
  { key: 'company', label: 'Société', required: true },
  { key: 'jobRole', label: 'Fonction' },
  { key: 'phone', label: 'Téléphone', type: 'tel' },
  { key: 'country', label: 'Pays' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

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

  // Fiche en cours de modification (une seule à la fois) et lien de réinitialisation à transmettre.
  const [editing, setEditing] = useState<{ userId: string; form: Profile } | null>(null);
  const [editError, setEditError] = useState('');
  const [resetLink, setResetLink] = useState<Record<string, string>>({});

  const startEdit = (u: UserRow) => {
    setEditError('');
    setEditing({
      userId: u.id,
      form: {
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        company: u.company,
        jobRole: u.jobRole ?? '',
        phone: u.phone ?? '',
        country: u.country ?? '',
      },
    });
  };

  async function saveProfile(u: UserRow) {
    if (!editing) return;
    const { form } = editing;
    setEditError('');
    if (!form.firstName.trim() || !form.lastName.trim() || !form.company.trim()) {
      setEditError('Prénom, nom et société sont obligatoires.');
      return;
    }
    if (!EMAIL_RE.test(form.email.trim())) {
      setEditError('Adresse e-mail invalide.');
      return;
    }
    const emailChanged = form.email.trim().toLowerCase() !== u.email;
    if (
      emailChanged &&
      !window.confirm(
        `Changer l’adresse de connexion de ${u.name} en « ${form.email.trim()} » ?\nL’utilisateur devra désormais se connecter avec cette adresse.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id, ...form }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error ?? 'Enregistrement impossible.');
        return;
      }
      setUsers((current) =>
        current.map((x) => (x.id === u.id ? { ...x, ...data.user, name: `${data.user.firstName} ${data.user.lastName}` } : x)),
      );
      setEditing(null);
      say(u.id, 'ok', emailChanged ? `Profil enregistré. Nouvelle adresse de connexion : ${data.user.email}.` : 'Profil enregistré.');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function sendResetLink(u: UserRow) {
    if (!window.confirm(`Envoyer à ${u.name} un lien pour choisir un nouveau mot de passe ?`)) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/users/reset-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        say(u.id, 'error', data.error ?? 'Envoi impossible.');
        return;
      }
      if (data.sent) {
        setResetLink((current) => {
          const next = { ...current };
          delete next[u.id];
          return next;
        });
        say(u.id, 'ok', `Lien de réinitialisation envoyé à ${data.email} (valable 60 minutes).`);
      } else {
        setResetLink((current) => ({ ...current, [u.id]: data.link }));
        say(u.id, 'info', 'E-mail non configuré sur le serveur : transmettez ce lien à l’utilisateur (valable 60 minutes, usage unique).');
      }
    } finally {
      setBusy(false);
    }
  }

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
            <table className="table table-compact table-cards">
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
                  <Fragment key={u.id}>
                  <tr>
                    <td className="card-head">
                      <strong>{u.name}</strong>
                      {u.isAdmin ? (
                        <span className="badge badge-accent" style={{ marginLeft: 8 }}>
                          Admin
                        </span>
                      ) : null}
                      <div className="small muted">{u.email}</div>
                      {u.jobRole ? <div className="small muted">{u.jobRole}</div> : null}
                    </td>
                    <td className="small" data-label="Société">{u.company}</td>
                    <td className="small mono nowrap" data-label="Inscrit le">{formatDate(u.createdAt)}</td>
                    <td className="small" data-label="Statut">{ACCOUNT_STATUS_LABEL[u.status]}</td>
                    <td className="small card-block" data-label="Projets et rôles">
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
                    <td className="card-block" data-label="Affecter à un projet">
                      <div className="row assign-row" style={{ gap: 6, flexWrap: 'nowrap' }}>
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
                          {resetLink[u.id] && notice[u.id].tone === 'info' ? (
                            <div className="row mt-8" style={{ gap: 6, flexWrap: 'nowrap' }}>
                              <input
                                className="input mono small"
                                readOnly
                                value={resetLink[u.id]}
                                onFocus={(e) => e.target.select()}
                                aria-label="Lien de réinitialisation"
                              />
                              <button
                                type="button"
                                className="btn btn-secondary nowrap"
                                onClick={() =>
                                  navigator.clipboard
                                    ?.writeText(resetLink[u.id])
                                    .then(() => say(u.id, 'ok', 'Lien copié : transmettez-le à l’utilisateur.'))
                                }
                              >
                                Copier
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                    <td className="text-right nowrap card-actions">
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
                      <br />
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => (editing?.userId === u.id ? setEditing(null) : startEdit(u))}
                        disabled={busy}
                        aria-expanded={editing?.userId === u.id}
                      >
                        {editing?.userId === u.id ? 'Fermer' : 'Modifier'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => sendResetLink(u)}
                        disabled={busy || u.status === 'DISABLED'}
                        title={u.status === 'DISABLED' ? 'Réactivez le compte d’abord' : 'Envoyer un lien pour choisir un nouveau mot de passe'}
                      >
                        Réinitialiser le mot de passe
                      </button>
                    </td>
                  </tr>
                  {editing?.userId === u.id ? (
                    <tr>
                      <td colSpan={7} className="card-block" style={{ background: 'var(--color-bg)' }}>
                        <div className="small muted" style={{ marginBottom: 12 }}>
                          Modifier le profil de <strong>{u.name}</strong>
                        </div>
                        <div className="form-grid">
                          {PROFILE_INPUTS.map((f) => (
                            <div className="field" key={f.key}>
                              <label htmlFor={`pf-${u.id}-${f.key}`}>
                                {f.label}
                                {f.required ? ' *' : ''}
                              </label>
                              <input
                                className="input"
                                id={`pf-${u.id}-${f.key}`}
                                type={f.type ?? 'text'}
                                autoComplete="off"
                                value={editing.form[f.key]}
                                onChange={(e) => setEditing({ userId: u.id, form: { ...editing.form, [f.key]: e.target.value } })}
                                onKeyDown={(e) => e.key === 'Enter' && saveProfile(u)}
                              />
                            </div>
                          ))}
                        </div>
                        {editError ? <div className="alert alert-error mt-16">{editError}</div> : null}
                        <div className="row mt-16">
                          <button type="button" className="btn btn-primary" onClick={() => saveProfile(u)} disabled={busy}>
                            {busy ? 'Enregistrement…' : 'Enregistrer'}
                          </button>
                          <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)} disabled={busy}>
                            Annuler
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
