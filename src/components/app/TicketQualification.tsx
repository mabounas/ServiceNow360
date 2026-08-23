'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Priority, Severity } from '@prisma/client';
import { PRIORITY_LABEL, SEVERITY_LABEL } from '@/lib/labels';

type Option = { id: string; name: string };

/** Qualification réservée à l'équipe : priorité, sévérité, module, assignation, lien planning. */
export default function TicketQualification({
  ticketId,
  isIncident,
  initial,
  members,
  tasks,
}: {
  ticketId: string;
  isIncident: boolean;
  initial: {
    priority: Priority;
    severity: Severity | null;
    moduleName: string | null;
    assigneeId: string | null;
    taskId: string | null;
  };
  members: Option[];
  tasks: Option[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    priority: initial.priority,
    severity: initial.severity ?? '',
    moduleName: initial.moduleName ?? '',
    assigneeId: initial.assigneeId ?? '',
    taskId: initial.taskId ?? '',
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priority: form.priority,
          severity: form.severity || undefined,
          moduleName: form.moduleName,
          assigneeId: form.assigneeId,
          taskId: form.taskId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Enregistrement impossible.');
        return;
      }
      setMessage('Qualification enregistrée.');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="field">
        <label htmlFor="q-priority">Priorité</label>
        <select className="input" id="q-priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
          {(Object.keys(PRIORITY_LABEL) as Priority[]).map((key) => (
            <option key={key} value={key}>
              {PRIORITY_LABEL[key]}
            </option>
          ))}
        </select>
      </div>

      {isIncident ? (
        <div className="field">
          <label htmlFor="q-severity">Sévérité</label>
          <select className="input" id="q-severity" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as Severity })}>
            <option value="">— Non qualifiée —</option>
            {(Object.keys(SEVERITY_LABEL) as Severity[]).map((key) => (
              <option key={key} value={key}>
                {SEVERITY_LABEL[key]}
              </option>
            ))}
          </select>
          <div className="field-hint">Modifier la sévérité recalcule les échéances de SLA.</div>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="q-module">Module concerné</label>
        <input className="input" id="q-module" value={form.moduleName} onChange={(e) => setForm({ ...form, moduleName: e.target.value })} />
      </div>

      <div className="field">
        <label htmlFor="q-assignee">Assigné à</label>
        <select className="input" id="q-assignee" value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
          <option value="">— Non assigné —</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="q-task">Tâche du planning liée</label>
        <select className="input" id="q-task" value={form.taskId} onChange={(e) => setForm({ ...form, taskId: e.target.value })}>
          <option value="">— Aucune —</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <div className="field-hint">Assure la traçabilité entre la demande et sa réalisation planifiée.</div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-ok">{message}</div> : null}

      <button type="button" className="btn btn-secondary" onClick={save} disabled={busy}>
        {busy ? 'Enregistrement…' : 'Enregistrer la qualification'}
      </button>
    </div>
  );
}
