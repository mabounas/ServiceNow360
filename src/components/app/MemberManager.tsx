'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProjectRole } from '@prisma/client';
import { ACCOUNT_STATUS_LABEL, PROJECT_ROLE_LABEL } from '@/lib/labels';

export type MemberRow = {
  userId: string;
  name: string;
  email: string;
  company: string;
  role: ProjectRole;
  status: 'PENDING' | 'ACTIVE' | 'DISABLED';
};

export default function MemberManager({
  projectId,
  members: initial,
  candidates,
}: {
  projectId: string;
  members: MemberRow[];
  candidates: { id: string; name: string; email: string; company: string; status: string }[];
}) {
  const router = useRouter();
  const [members, setMembers] = useState(initial);
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<ProjectRole>('USER');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function call(url: string, init: RequestInit) {
    setError('');
    setBusy(true);
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Opération impossible.');
        return null;
      }
      return data;
    } finally {
      setBusy(false);
    }
  }

  async function assign() {
    if (!userId) return setError('Sélectionnez un utilisateur.');
    const data = await call(`/api/projects/${projectId}/members`, { method: 'POST', body: JSON.stringify({ userId, role }) });
    if (!data) return;
    setUserId('');
    router.refresh();
  }

  async function changeRole(targetId: string, nextRole: ProjectRole) {
    const data = await call(`/api/projects/${projectId}/members`, { method: 'POST', body: JSON.stringify({ userId: targetId, role: nextRole }) });
    if (!data) return;
    setMembers((current) => current.map((m) => (m.userId === targetId ? { ...m, role: nextRole } : m)));
  }

  async function remove(targetId: string) {
    const data = await call(`/api/projects/${projectId}/members?userId=${targetId}`, { method: 'DELETE' });
    if (!data) return;
    setMembers((current) => current.filter((m) => m.userId !== targetId));
    router.refresh();
  }

  return (
    <>
      {error ? <div className="alert alert-error mb-16">{error}</div> : null}

      <div className="panel mb-24">
        <div className="panel-head">
          <h3 className="panel-title">Affecter un utilisateur au projet</h3>
          <span className="small muted">L’affectation active automatiquement un compte en attente.</span>
        </div>
        <div className="panel-body">
          <div className="form-grid">
            <div className="field">
              <label htmlFor="m-user">Utilisateur</label>
              <select className="input" id="m-user" value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">— Sélectionner —</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.company} ({ACCOUNT_STATUS_LABEL[c.status as keyof typeof ACCOUNT_STATUS_LABEL]})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="m-role">Rôle sur ce projet</label>
              <select className="input" id="m-role" value={role} onChange={(e) => setRole(e.target.value as ProjectRole)}>
                {(Object.keys(PROJECT_ROLE_LABEL) as ProjectRole[]).map((key) => (
                  <option key={key} value={key}>
                    {PROJECT_ROLE_LABEL[key]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="button" className="btn btn-primary" onClick={assign} disabled={busy}>
                Affecter
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3 className="panel-title">Équipe du projet</h3>
          <span className="small muted">{members.length} membre(s)</span>
        </div>
        <div className="panel-body panel-body-flush table-wrap">
          {members.length === 0 ? (
            <div className="empty">Aucun utilisateur affecté à ce projet.</div>
          ) : (
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Utilisateur</th>
                  <th>Société</th>
                  <th>Compte</th>
                  <th>Rôle</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.userId}>
                    <td>
                      <strong>{m.name}</strong>
                      <div className="small muted">{m.email}</div>
                    </td>
                    <td className="small">{m.company}</td>
                    <td className="small">{ACCOUNT_STATUS_LABEL[m.status]}</td>
                    <td>
                      <select
                        className="input"
                        value={m.role}
                        onChange={(e) => changeRole(m.userId, e.target.value as ProjectRole)}
                        style={{ minWidth: 180 }}
                      >
                        {(Object.keys(PROJECT_ROLE_LABEL) as ProjectRole[]).map((key) => (
                          <option key={key} value={key}>
                            {PROJECT_ROLE_LABEL[key]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="text-right">
                      <button type="button" className="btn btn-ghost" onClick={() => remove(m.userId)}>
                        Retirer
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
