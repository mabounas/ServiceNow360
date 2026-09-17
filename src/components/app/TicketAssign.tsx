'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Affectation seule d'un ticket (superviseur), à toute étape non terminée. */
export default function TicketAssign({
  ticketId,
  currentAssigneeId,
  members,
}: {
  ticketId: string;
  currentAssigneeId: string | null;
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [assigneeId, setAssigneeId] = useState(currentAssigneeId ?? '');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Affectation impossible.');
        return;
      }
      const name = members.find((m) => m.id === assigneeId)?.name;
      setMessage(name ? `Ticket affecté à ${name}, qui en est notifié.` : 'Affectation retirée.');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="field">
        <label htmlFor="as-assignee">Affecter à</label>
        <select className="input" id="as-assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
          <option value="">— Personne —</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-ok">{message}</div> : null}
      <button
        type="button"
        className="btn btn-primary"
        onClick={save}
        disabled={busy || assigneeId === (currentAssigneeId ?? '')}
      >
        {busy ? 'Enregistrement…' : 'Enregistrer l’affectation'}
      </button>
    </div>
  );
}
