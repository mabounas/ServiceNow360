'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import MeetingForm, { toLocalInput } from './MeetingForm';
import { formatDate, formatDateTime } from '@/lib/labels';

export type MeetingFull = {
  id: string;
  projectId: string;
  taskId: string | null;
  taskName: string;
  title: string;
  meetingDate: string;
  location: string | null;
  participants: string | null;
  agenda: string | null;
  content: string;
  decisions: string | null;
  actions: string | null;
  nextMeeting: string | null;
  archived: boolean;
  archivedAt: string | null;
  archivedByName: string | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  files: { id: string; fileName: string; size: number }[];
};

function Section({ title, value }: { title: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="mb-24">
      <h4 style={{ fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 8px' }}>{title}</h4>
      <p className="thread-body" style={{ margin: 0 }}>
        {value}
      </p>
    </div>
  );
}

/** Lecture, modification et archivage d'un PV de réunion. */
export default function MeetingDetail({
  meeting,
  projectLabel,
  canWrite,
}: {
  meeting: MeetingFull;
  projectLabel: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function toggleArchive() {
    setError('');
    setBusy(true);
    try {
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
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">
            <Link href={`/app/projets/${meeting.projectId}/reunions`} className="link-plain">
              {projectLabel}
            </Link>{' '}
            — PV de réunion
          </div>
          <h1 className="page-title">{meeting.title}</h1>
          <div className="small muted mt-8">
            Tâche :{' '}
            {meeting.taskId ? (
              <Link href={`/app/projets/${meeting.projectId}/planning`}>{meeting.taskName}</Link>
            ) : (
              <span>
                {meeting.taskName} <em>(tâche retirée du planning)</em>
              </span>
            )}
          </div>
        </div>
        <div className="page-actions no-print">
          {meeting.archived ? <span className="badge badge-neutral">Archivé</span> : null}
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
            Imprimer / PDF
          </button>
          {canWrite && !meeting.archived && !editing ? (
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
              Modifier
            </button>
          ) : null}
          {canWrite ? (
            <button type="button" className="btn btn-primary" onClick={toggleArchive} disabled={busy}>
              {meeting.archived ? 'Restaurer le PV' : 'Archiver le PV'}
            </button>
          ) : null}
        </div>
      </div>

      {meeting.archived ? (
        <div className="alert alert-info mb-24">
          PV archivé le {formatDateTime(meeting.archivedAt)}
          {meeting.archivedByName ? ` par ${meeting.archivedByName}` : ''}. Il reste consultable ; restaurez-le pour le
          modifier.
        </div>
      ) : null}

      {error ? <div className="alert alert-error mb-24">{error}</div> : null}

      {editing ? (
        <div className="panel">
          <div className="panel-head">
            <h3 className="panel-title">Modifier le PV</h3>
          </div>
          <div className="panel-body">
            <MeetingForm
              initial={{
                title: meeting.title,
                meetingDate: toLocalInput(meeting.meetingDate),
                location: meeting.location ?? '',
                participants: meeting.participants ?? '',
                agenda: meeting.agenda ?? '',
                content: meeting.content,
                decisions: meeting.decisions ?? '',
                actions: meeting.actions ?? '',
                nextMeeting: toLocalInput(meeting.nextMeeting),
              }}
              existingFiles={meeting.files}
              submitLabel="Enregistrer les modifications"
              onCancel={() => setEditing(false)}
              onSubmit={async (payload) => {
                const res = await fetch(`/api/meetings/${meeting.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
                });
                const data = await res.json();
                if (!res.ok) return data.error ?? 'Enregistrement impossible.';
                setEditing(false);
                router.refresh();
              }}
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-24" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' }}>
          <div className="panel">
            <div className="panel-body">
              <Section title="Ordre du jour" value={meeting.agenda} />
              <Section title="Compte rendu" value={meeting.content} />
              <Section title="Décisions prises" value={meeting.decisions} />
              <Section title="Actions à mener" value={meeting.actions} />
            </div>
          </div>

          <div className="stack">
            <div className="panel">
              <div className="panel-body panel-body-flush">
                <table className="table table-compact">
                  <tbody>
                    <tr>
                      <th>Réunion</th>
                      <td>{formatDateTime(meeting.meetingDate)}</td>
                    </tr>
                    <tr>
                      <th>Lieu</th>
                      <td>{meeting.location ?? '—'}</td>
                    </tr>
                    <tr>
                      <th>Prochaine</th>
                      <td>{meeting.nextMeeting ? formatDateTime(meeting.nextMeeting) : '—'}</td>
                    </tr>
                    <tr>
                      <th>Rédigé par</th>
                      <td>
                        {meeting.createdByName}
                        <div className="small muted">le {formatDate(meeting.createdAt)}</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {meeting.participants ? (
              <div className="panel">
                <div className="panel-head">
                  <h3 className="panel-title">Participants</h3>
                </div>
                <div className="panel-body">
                  <ul className="gantt-tooltip-notes" style={{ marginTop: 0 }}>
                    {meeting.participants
                      .split('\n')
                      .map((p) => p.trim())
                      .filter(Boolean)
                      .map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                  </ul>
                </div>
              </div>
            ) : null}

            {meeting.files.length ? (
              <div className="panel">
                <div className="panel-head">
                  <h3 className="panel-title">Pièces jointes</h3>
                </div>
                <div className="panel-body">
                  <ul className="small" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {meeting.files.map((f) => (
                      <li key={f.id}>
                        <a href={`/api/meetings/${meeting.id}?file=${f.id}`}>📎 {f.fileName}</a>{' '}
                        <span className="muted">({Math.round(f.size / 1024)} Ko)</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
