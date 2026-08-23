'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ContactStatus } from '@prisma/client';
import { formatDateTime } from '@/lib/labels';

export const CONTACT_STATUS_LABEL: Record<ContactStatus, string> = {
  NEW: 'Nouveau',
  READ: 'Lu',
  HANDLED: 'Traité',
  ARCHIVED: 'Archivé',
};

const STATUS_TONE: Record<ContactStatus, string> = {
  NEW: 'badge-accent',
  READ: 'badge-warn',
  HANDLED: 'badge-ok',
  ARCHIVED: 'badge-neutral',
};

export type ContactRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  phone: string | null;
  subject: string;
  message: string;
  status: ContactStatus;
  internalNote: string | null;
  handledByName: string | null;
  handledAt: string | null;
  createdAt: string;
};

export default function AdminContacts({ contacts: initial }: { contacts: ContactRow[] }) {
  const router = useRouter();
  const [contacts, setContacts] = useState(initial);
  const [filter, setFilter] = useState<'ALL' | ContactStatus>('ALL');
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const visible = contacts.filter((c) => filter === 'ALL' || c.status === filter);

  async function patch(id: string, body: Record<string, unknown>) {
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/admin/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Opération impossible.');
        return;
      }
      setContacts((current) =>
        current.map((c) =>
          c.id === id
            ? {
                ...c,
                status: data.contact.status,
                internalNote: data.contact.internalNote,
                handledAt: data.contact.handledAt,
                handledByName: data.contact.handledBy
                  ? `${data.contact.handledBy.firstName} ${data.contact.handledBy.lastName}`
                  : c.handledByName,
              }
            : c,
        ),
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/contacts?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Suppression impossible.');
        return;
      }
      setContacts((current) => current.filter((c) => c.id !== id));
      if (openId === id) setOpenId(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  /** Ouvrir un message le marque comme lu s'il était encore nouveau. */
  function open(row: ContactRow) {
    const next = openId === row.id ? null : row.id;
    setOpenId(next);
    setNote(row.internalNote ?? '');
    if (next && row.status === 'NEW') patch(row.id, { status: 'READ' });
  }

  return (
    <>
      {error ? <div className="alert alert-error mb-16">{error}</div> : null}

      <div className="row mb-16" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          {(['ALL', 'NEW', 'READ', 'HANDLED', 'ARCHIVED'] as const).map((key) => (
            <button
              key={key}
              type="button"
              className={`btn ${filter === key ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter(key)}
            >
              {key === 'ALL' ? 'Tous' : CONTACT_STATUS_LABEL[key]} (
              {key === 'ALL' ? contacts.length : contacts.filter((c) => c.status === key).length})
            </button>
          ))}
        </div>
        <a className="btn btn-secondary" href="/api/admin/contacts?format=csv">
          Exporter (CSV)
        </a>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3 className="panel-title">{visible.length} message(s)</h3>
          <span className="small muted">Messages reçus via le formulaire de contact public.</span>
        </div>
        <div className="panel-body panel-body-flush table-wrap">
          {visible.length === 0 ? (
            <div className="empty">Aucun message dans cette catégorie.</div>
          ) : (
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Reçu le</th>
                  <th>Expéditeur</th>
                  <th>Objet</th>
                  <th>Statut</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <Fragment key={c.id}>
                    <tr>
                      <td className="small mono nowrap">{formatDateTime(c.createdAt)}</td>
                      <td>
                        <strong>
                          {c.firstName} {c.lastName}
                        </strong>
                        <div className="small muted">
                          <a href={`mailto:${c.email}`}>{c.email}</a>
                        </div>
                        {c.company ? <div className="small muted">{c.company}</div> : null}
                        {c.phone ? <div className="small muted">{c.phone}</div> : null}
                      </td>
                      <td>
                        {c.subject}
                        <div className="small muted" style={{ maxWidth: '48ch' }}>
                          {c.message.length > 110 ? `${c.message.slice(0, 110)}…` : c.message}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${STATUS_TONE[c.status]}`}>{CONTACT_STATUS_LABEL[c.status]}</span>
                        {c.handledByName ? <div className="small muted mt-8">par {c.handledByName}</div> : null}
                      </td>
                      <td className="text-right nowrap">
                        <button type="button" className="btn btn-ghost" onClick={() => open(c)}>
                          {openId === c.id ? 'Fermer' : 'Ouvrir'}
                        </button>
                      </td>
                    </tr>

                    {openId === c.id ? (
                      <tr>
                        <td colSpan={5} style={{ background: 'var(--color-surface)' }}>
                          <p className="thread-body" style={{ margin: '8px 0 16px' }}>
                            {c.message}
                          </p>

                          <div className="field" style={{ maxWidth: 620 }}>
                            <label htmlFor={`note-${c.id}`}>Note interne</label>
                            <textarea
                              className="input"
                              id={`note-${c.id}`}
                              rows={2}
                              value={note}
                              onChange={(e) => setNote(e.target.value)}
                            />
                          </div>

                          <div className="row mt-16">
                            <a className="btn btn-primary" href={`mailto:${c.email}?subject=Re: ${encodeURIComponent(c.subject)}`}>
                              Répondre par e-mail
                            </a>
                            <button type="button" className="btn btn-secondary" onClick={() => patch(c.id, { internalNote: note })} disabled={busy}>
                              Enregistrer la note
                            </button>
                            <button type="button" className="btn btn-secondary" onClick={() => patch(c.id, { status: 'HANDLED', internalNote: note })} disabled={busy}>
                              Marquer traité
                            </button>
                            <button type="button" className="btn btn-secondary" onClick={() => patch(c.id, { status: 'ARCHIVED' })} disabled={busy}>
                              Archiver
                            </button>
                            <button type="button" className="btn btn-ghost" onClick={() => remove(c.id)} disabled={busy}>
                              Supprimer
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
