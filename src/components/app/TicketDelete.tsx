'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Suppression définitive d'un ticket — affichée aux seuls administrateurs, hors tickets clôturés. */
export default function TicketDelete({
  ticketId,
  reference,
  projectId,
}: {
  ticketId: string;
  reference: string;
  projectId: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function remove() {
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Suppression impossible.');
        return;
      }
      router.push(`/app/projets/${projectId}/tickets`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>
          Supprime définitivement le ticket, son fil de discussion, son historique et ses pièces jointes.
        </p>
        <div>
          <button type="button" className="btn btn-secondary" onClick={() => setConfirming(true)}>
            Supprimer ce ticket
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="alert alert-error">
        Cette action est <strong>irréversible</strong>. Pour confirmer, saisissez la référence{' '}
        <strong className="mono">{reference}</strong>.
      </div>
      <div className="field">
        <label htmlFor="del-ref">Référence du ticket</label>
        <input className="input" id="del-ref" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      </div>
      {error ? <div className="alert alert-error">{error}</div> : null}
      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          onClick={remove}
          disabled={busy || typed.trim().toUpperCase() !== reference.toUpperCase()}
        >
          {busy ? 'Suppression…' : 'Supprimer définitivement'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setConfirming(false);
            setTyped('');
          }}
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
