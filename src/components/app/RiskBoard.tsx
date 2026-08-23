'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RiskStatus } from '@prisma/client';
import { RISK_STATUS_LABEL, formatDate } from '@/lib/labels';

export type RiskRow = {
  id: string;
  title: string;
  description: string | null;
  probability: number;
  impact: number;
  status: RiskStatus;
  sharedWithClient: boolean;
  createdAt: string;
  ownerName: string | null;
};

const SCALE = [1, 2, 3, 4];

export default function RiskBoard({
  projectId,
  risks: initial,
  editable,
}: {
  projectId: string;
  risks: RiskRow[];
  editable: boolean;
}) {
  const router = useRouter();
  const [risks, setRisks] = useState(initial);
  const [draft, setDraft] = useState({ title: '', description: '', probability: 2, impact: 2, sharedWithClient: true });
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

  async function create() {
    if (!draft.title.trim()) return setError('Le libellé du risque est obligatoire.');
    const data = await call(`/api/projects/${projectId}/risks`, { method: 'POST', body: JSON.stringify(draft) });
    if (!data) return;
    setRisks((current) => [
      { ...data.risk, createdAt: data.risk.createdAt, ownerName: null },
      ...current,
    ]);
    setDraft({ title: '', description: '', probability: 2, impact: 2, sharedWithClient: true });
    router.refresh();
  }

  async function update(id: string, patch: Partial<RiskRow>) {
    const data = await call(`/api/projects/${projectId}/risks`, { method: 'PATCH', body: JSON.stringify({ id, ...patch }) });
    if (!data) return;
    setRisks((current) => current.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function remove(id: string) {
    const data = await call(`/api/projects/${projectId}/risks?riskId=${id}`, { method: 'DELETE' });
    if (!data) return;
    setRisks((current) => current.filter((r) => r.id !== id));
  }

  return (
    <>
      {error ? <div className="alert alert-error mb-16">{error}</div> : null}

      {editable ? (
        <div className="panel mb-24 no-print">
          <div className="panel-head">
            <h3 className="panel-title">Consigner un risque</h3>
          </div>
          <div className="panel-body">
            <div className="form-grid">
              <div className="field span-2">
                <label htmlFor="r-title">Libellé</label>
                <input className="input" id="r-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </div>
              <div className="field span-2">
                <label htmlFor="r-desc">Description et parade envisagée</label>
                <textarea className="input" id="r-desc" rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="r-prob">Probabilité (1 à 4)</label>
                <select className="input" id="r-prob" value={draft.probability} onChange={(e) => setDraft({ ...draft, probability: Number(e.target.value) })}>
                  {SCALE.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="r-impact">Impact (1 à 4)</label>
                <select className="input" id="r-impact" value={draft.impact} onChange={(e) => setDraft({ ...draft, impact: Number(e.target.value) })}>
                  {SCALE.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field span-2">
                <label className="row small" style={{ gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={draft.sharedWithClient}
                    onChange={(e) => setDraft({ ...draft, sharedWithClient: e.target.checked })}
                    style={{ accentColor: 'var(--color-accent)', width: 15, height: 15 }}
                  />
                  <span>Partager ce risque avec le client</span>
                </label>
              </div>
            </div>
            <div className="mt-16">
              <button type="button" className="btn btn-primary" onClick={create} disabled={busy}>
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-head">
          <h3 className="panel-title">Journal des risques</h3>
          <span className="small muted">{risks.length} risque(s)</span>
        </div>
        <div className="panel-body panel-body-flush table-wrap">
          {risks.length === 0 ? (
            <div className="empty">Aucun risque consigné.</div>
          ) : (
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Risque</th>
                  <th>Criticité</th>
                  <th>Statut</th>
                  <th>Ouvert le</th>
                  {editable ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {risks.map((risk) => {
                  const score = risk.probability * risk.impact;
                  const tone = score >= 12 ? 'bad' : score >= 6 ? 'warn' : 'neutral';
                  return (
                    <tr key={risk.id}>
                      <td>
                        <strong>{risk.title}</strong>
                        {risk.description ? <div className="small muted">{risk.description}</div> : null}
                        {!risk.sharedWithClient ? <span className="badge badge-neutral mt-8">Interne</span> : null}
                      </td>
                      <td>
                        <span className={`badge badge-${tone}`}>
                          {score} (P{risk.probability} × I{risk.impact})
                        </span>
                      </td>
                      <td>
                        {editable ? (
                          <select
                            className="input"
                            value={risk.status}
                            onChange={(e) => update(risk.id, { status: e.target.value as RiskStatus })}
                            style={{ minWidth: 130 }}
                          >
                            {(Object.keys(RISK_STATUS_LABEL) as RiskStatus[]).map((key) => (
                              <option key={key} value={key}>
                                {RISK_STATUS_LABEL[key]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          RISK_STATUS_LABEL[risk.status]
                        )}
                      </td>
                      <td className="small mono nowrap">{formatDate(risk.createdAt)}</td>
                      {editable ? (
                        <td className="text-right">
                          <button type="button" className="btn btn-ghost" onClick={() => remove(risk.id)}>
                            Supprimer
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
