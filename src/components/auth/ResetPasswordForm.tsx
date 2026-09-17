'use client';

import { useState } from 'react';

const PWD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

export default function ResetPasswordForm({ token, email }: { token: string; email: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  const rules = [
    { ok: password.length >= 8, label: '8 caractères minimum' },
    { ok: /[A-Z]/.test(password), label: 'une majuscule' },
    { ok: /[a-z]/.test(password), label: 'une minuscule' },
    { ok: /\d/.test(password), label: 'un chiffre' },
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!PWD_RE.test(password)) return setError('Le mot de passe ne respecte pas les règles ci-dessous.');
    if (password !== confirm) return setError('Les deux mots de passe ne correspondent pas.');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error ?? 'Modification impossible.');
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
        <a href="/#acces" className="btn btn-primary btn-block mt-16" style={{ textDecoration: 'none', minHeight: 44 }}>
          Se connecter
        </a>
      </>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <p className="small" style={{ margin: '0 0 16px' }}>
        Compte : <strong>{email}</strong>
      </p>
      <div className="field" style={{ marginBottom: 16 }}>
        <label htmlFor="rp-pwd">Nouveau mot de passe</label>
        <input
          className="input"
          id="rp-pwd"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <ul className="small" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          {rules.map((r) => (
            <li key={r.label} style={{ color: r.ok ? '#17512c' : undefined }}>
              {r.ok ? '✓ ' : ''}
              {r.label}
            </li>
          ))}
        </ul>
      </div>
      <div className="field" style={{ marginBottom: 12 }}>
        <label htmlFor="rp-confirm">Confirmer le mot de passe</label>
        <input
          className="input"
          id="rp-confirm"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer' }}>
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} style={{ accentColor: 'var(--color-accent)' }} />
        Afficher les mots de passe
      </label>
      {error ? (
        <div className="alert alert-error mb-16" role="alert">
          {error}
        </div>
      ) : null}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy} style={{ minHeight: 44 }}>
        {busy ? 'Enregistrement…' : 'Enregistrer le nouveau mot de passe'}
      </button>
      <p className="small muted mt-16">Toutes vos sessions ouvertes seront fermées.</p>
    </form>
  );
}
