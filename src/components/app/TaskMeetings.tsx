'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import MeetingForm, { emptyMeeting } from './MeetingForm';
import { formatDate, formatDateTime } from '@/lib/labels';

export type MeetingSummary = {
  id: string;
  title: string;
  meetingDate: string;
  archived: boolean;
  archivedAt: string | null;
  createdBy: { firstName: string; lastName: string };
  files: { id: string }[];
  decisions: string | null;
  actions: string | null;
  nextMeeting: string | null;
};

type View = 'active' | 'archived' | 'all';

/** PV des réunions de suivi d'une tâche, dans le panneau de détail du planning. */
export default function TaskMeetings({
  taskId,
  taskName,
  canWrite,
  onCountChange,
}: {
  taskId: string;
  taskName: string;
  canWrite: boolean;
  /** Nombre de PV actifs, pour l'indicateur de la liste WBS. */
  onCountChange: (taskId: string, count: number) => void;
}) {
  const [view, setView] = useState<View>('active');
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/tasks/${taskId}/meetings?archive=all`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Chargement impossible.');
        return;
      }
      setMeetings(data.meetings);
      onCountChange(taskId, data.meetings.filter((m: MeetingSummary) => !m.archived).length);
    } finally {
      setLoading(false);
    }
  }, [taskId, onCountChange]);

  useEffect(() => {
    setCreating(false);
    setView('active');
    load();
  }, [load]);

  async function toggleArchive(meeting: MeetingSummary) {
    setError('');
    const res = await fetch(`/api/meetings/${meeting.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: !meeting.archived }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Opération impossible.');
      return;
    }
    await load();
  }

  const shown = meetings.filter((m) => (view === 'all' ? true : view === 'archived' ? m.archived : !m.archived));
  const archivedCount = meetings.filter((m) => m.archived).length;

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h4 style={{ fontSize: 15, margin: 0 }}>Réunions de suivi — PV</h4>
        <div className="row" style={{ gap: 6 }}>
          {(['active', 'archived', 'all'] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              className={`btn ${view === v ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setView(v)}
            >
              {v === 'active'
                ? `Actifs (${meetings.length - archivedCount})`
                : v === 'archived'
                  ? `Archivés (${archivedCount})`
                  : 'Tous'}
            </button>
          ))}
          {canWrite && !creating ? (
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              Nouveau PV
            </button>
          ) : null}
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      {creating ? (
        <div className="panel">
          <div className="panel-body">
            <MeetingForm
              initial={emptyMeeting(taskName)}
              submitLabel="Publier le PV"
              onCancel={() => setCreating(false)}
              onSubmit={async (payload) => {
                const res = await fetch(`/api/tasks/${taskId}/meetings`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
                });
                const data = await res.json();
                if (!res.ok) return data.error ?? 'Enregistrement impossible.';
                setCreating(false);
                setView('active');
                await load();
              }}
            />
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="small muted">Chargement…</div>
      ) : shown.length === 0 ? (
        <div className="small muted">
          {view === 'archived' ? 'Aucun PV archivé.' : 'Aucun PV de réunion pour cette tâche.'}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Réunion</th>
                <th>PV</th>
                <th>Rédigé par</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id} style={m.archived ? { opacity: 0.6 } : undefined}>
                  <td className="small mono nowrap">{formatDateTime(m.meetingDate)}</td>
                  <td>
                    <Link href={`/app/reunions/${m.id}`}>{m.title}</Link>
                    <div className="small muted">
                      {m.files.length ? `📎 ${m.files.length} · ` : ''}
                      {m.decisions ? 'décisions · ' : ''}
                      {m.actions ? 'actions · ' : ''}
                      {m.nextMeeting ? `prochaine réunion le ${formatDate(m.nextMeeting)}` : ''}
                    </div>
                    {m.archived ? (
                      <span className="badge badge-neutral mt-8">Archivé le {formatDate(m.archivedAt)}</span>
                    ) : null}
                  </td>
                  <td className="small nowrap">
                    {m.createdBy.firstName} {m.createdBy.lastName}
                  </td>
                  <td className="text-right nowrap">
                    <Link className="btn btn-ghost" href={`/app/reunions/${m.id}`}>
                      Ouvrir
                    </Link>
                    {canWrite ? (
                      <button type="button" className="btn btn-ghost" onClick={() => toggleArchive(m)}>
                        {m.archived ? 'Restaurer' : 'Archiver'}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
