'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDate } from '@/lib/labels';

export type ProjectRow = {
  id: string;
  code: string;
  name: string;
  clientName: string;
  startDate: string | null;
  endDate: string | null;
  members: number;
  tickets: number;
};

export default function AdminProjects({ projects }: { projects: ProjectRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState({ code: '', name: '', clientName: '', description: '', startDate: '', endDate: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function create() {
    setError('');
    if (!draft.code.trim() || !draft.name.trim() || !draft.clientName.trim()) {
      return setError('Code, nom et client sont obligatoires.');
    }
    setBusy(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Création impossible.');
        return;
      }
      setDraft({ code: '', name: '', clientName: '', description: '', startDate: '', endDate: '' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="panel mb-24">
        <div className="panel-head">
          <h3 className="panel-title">Créer un projet</h3>
          <span className="small muted">Chaque projet dispose de son espace tickets et de son planning, totalement cloisonnés.</span>
        </div>
        <div className="panel-body">
          <div className="form-grid">
            <div className="field">
              <label htmlFor="p-code">Code projet</label>
              <input className="input" id="p-code" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} />
            </div>
            <div className="field">
              <label htmlFor="p-client">Client</label>
              <input className="input" id="p-client" value={draft.clientName} onChange={(e) => setDraft({ ...draft, clientName: e.target.value })} />
            </div>
            <div className="field span-2">
              <label htmlFor="p-name">Nom du projet</label>
              <input className="input" id="p-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div className="field span-2">
              <label htmlFor="p-desc">Description</label>
              <textarea className="input" id="p-desc" rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="p-start">Début</label>
              <input className="input" id="p-start" type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="p-end">Fin prévisionnelle</label>
              <input className="input" id="p-end" type="date" value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} />
            </div>
          </div>
          {error ? <div className="alert alert-error mt-16">{error}</div> : null}
          <div className="mt-16">
            <button type="button" className="btn btn-primary" onClick={create} disabled={busy}>
              Créer le projet
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3 className="panel-title">Projets ({projects.length})</h3>
        </div>
        <div className="panel-body panel-body-flush table-wrap">
          {projects.length === 0 ? (
            <div className="empty">Aucun projet.</div>
          ) : (
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Projet</th>
                  <th>Client</th>
                  <th>Période</th>
                  <th className="text-right">Membres</th>
                  <th className="text-right">Tickets</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{p.code}</td>
                    <td>{p.name}</td>
                    <td className="small">{p.clientName}</td>
                    <td className="small nowrap">
                      {formatDate(p.startDate)} → {formatDate(p.endDate)}
                    </td>
                    <td className="text-right mono">{p.members}</td>
                    <td className="text-right mono">{p.tickets}</td>
                    <td className="text-right nowrap">
                      <Link href={`/app/projets/${p.id}`} className="btn btn-ghost">
                        Ouvrir
                      </Link>
                      <Link href={`/app/projets/${p.id}/equipe`} className="btn btn-ghost">
                        Équipe
                      </Link>
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
