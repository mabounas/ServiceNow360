'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TicketStatus } from '@prisma/client';
import { TICKET_STATUS_LABEL } from '@/lib/labels';

type Transition = { to: TicketStatus; label: string; requiresNote?: boolean };
type Member = { id: string; name: string };

export default function TicketActions({
  ticketId,
  transitions,
  members,
  needsEstimate,
}: {
  ticketId: string;
  transitions: Transition[];
  members: Member[];
  needsEstimate: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<TicketStatus | ''>('');
  const [note, setNote] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [estimateDays, setEstimateDays] = useState('');
  const [estimateCost, setEstimateCost] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const transition = transitions.find((t) => t.to === selected);

  async function submit() {
    if (!selected) return setError('Sélectionnez une action.');
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selected,
          note,
          assigneeId: assigneeId || undefined,
          estimateDays: estimateDays || undefined,
          estimateCost: estimateCost || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Action impossible.');
        return;
      }
      setSelected('');
      setNote('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (transitions.length === 0) {
    return <div className="small muted">Aucune action disponible à ce stade pour votre rôle.</div>;
  }

  return (
    <div className="stack">
      <div className="field">
        <label htmlFor="tr-action">Action</label>
        <select className="input" id="tr-action" value={selected} onChange={(e) => setSelected(e.target.value as TicketStatus)}>
          <option value="">— Sélectionner —</option>
          {transitions.map((t) => (
            <option key={t.to} value={t.to}>
              {t.label} ({TICKET_STATUS_LABEL[t.to]})
            </option>
          ))}
        </select>
      </div>

      {selected === 'ASSIGNED' ? (
        <div className="field">
          <label htmlFor="tr-assignee">Technicien</label>
          <select className="input" id="tr-assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">— Sélectionner —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {selected === 'ESTIMATED' && needsEstimate ? (
        <div className="row" style={{ gap: 12 }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="tr-days">Charge estimée (jours)</label>
            <input className="input" id="tr-days" type="number" min="0" step="0.5" value={estimateDays} onChange={(e) => setEstimateDays(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="tr-cost">Coût estimé</label>
            <input className="input" id="tr-cost" type="number" min="0" step="100" value={estimateCost} onChange={(e) => setEstimateCost(e.target.value)} />
          </div>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="tr-note">
          Commentaire {transition?.requiresNote ? '(obligatoire)' : '(facultatif)'}
        </label>
        <textarea className="input" id="tr-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
        {busy ? 'Enregistrement…' : 'Appliquer'}
      </button>
    </div>
  );
}
