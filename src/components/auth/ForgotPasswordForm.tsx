'use client';

import { useState } from 'react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!EMAIL_RE.test(email.trim())) return setError('Saisissez une adresse e-mail valide.');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error ?? 'Envoi impossible, réessayez plus tard.');
      setDone(data.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <>
        <div className="alert alert-ok" role="status">
          {done}
        </div>
        <p className="small muted mt-16">
          Pensez à vérifier vos courriers indésirables. Le lien est valable 60 minutes. Sans e-mail reçu, contactez votre
          administrateur.
        </p>
        <a href="/#acces" className="btn btn-secondary mt-16" style={{ textDecoration: 'none' }}>
          Retour à la connexion
        </a>
      </>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="field" style={{ marginBottom: 16 }}>
        <label htmlFor="fp-email">Adresse e-mail professionnelle</label>
        <input
          className="input"
          id="fp-email"
          type="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {error ? (
        <div className="alert alert-error mb-16" role="alert">
          {error}
        </div>
      ) : null}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy} style={{ minHeight: 44 }}>
        {busy ? 'Envoi…' : 'Recevoir le lien de réinitialisation'}
      </button>
      <p className="small mt-16">
        <a href="/#acces">← Retour à la connexion</a>
      </p>
    </form>
  );
}
