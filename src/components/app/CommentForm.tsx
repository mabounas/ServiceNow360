'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CommentForm({ ticketId, canPostInternal }: { ticketId: string; canPostInternal: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!body.trim()) return setError('Le commentaire est vide.');
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, internal }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Envoi impossible.');
        return;
      }
      setBody('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack mt-16">
      <div className="field">
        <label htmlFor="c-body">Ajouter un commentaire</label>
        <textarea className="input" id="c-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      {canPostInternal ? (
        <label className="row small" style={{ gap: 8 }}>
          <input
            type="checkbox"
            checked={internal}
            onChange={(e) => setInternal(e.target.checked)}
            style={{ accentColor: 'var(--color-accent)', width: 15, height: 15 }}
          />
          <span>Note interne — non visible par le client</span>
        </label>
      ) : null}
      {error ? <div className="alert alert-error">{error}</div> : null}
      <div>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Envoi…' : 'Publier'}
        </button>
      </div>
    </div>
  );
}
