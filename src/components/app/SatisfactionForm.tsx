'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** §3.3.4 — enquête de satisfaction courte proposée à la clôture. */
export default function SatisfactionForm({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!rating) return setError('Choisissez une note de 1 à 5.');
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/satisfaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Envoi impossible.');
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="row" style={{ gap: 6 }}>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            className={`btn ${rating === value ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setRating(value)}
            style={{ minWidth: 44, justifyContent: 'center' }}
          >
            {value}
          </button>
        ))}
      </div>
      <div className="field">
        <label htmlFor="s-comment">Commentaire (facultatif)</label>
        <textarea className="input" id="s-comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>
      {error ? <div className="alert alert-error">{error}</div> : null}
      <div>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Envoi…' : 'Envoyer mon évaluation'}
        </button>
      </div>
    </div>
  );
}
