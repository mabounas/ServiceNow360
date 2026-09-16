'use client';

import { useState } from 'react';

export type MeetingValues = {
  title: string;
  meetingDate: string;
  location: string;
  participants: string;
  agenda: string;
  content: string;
  decisions: string;
  actions: string;
  nextMeeting: string;
};

export type ExistingFile = { id: string; fileName: string; size: number };

type NewFile = { fileName: string; mimeType: string; size: number; data: string };

const FILE_MAX = 4 * 1024 * 1024;
const ACCEPTED = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.png,.jpg,.jpeg';

/** Valeur d'un champ `datetime-local` (heure locale, sans fuseau). */
export function toLocalInput(value: string | Date | null | undefined) {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function emptyMeeting(taskName: string): MeetingValues {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return {
    title: `Réunion de suivi — ${taskName}`,
    meetingDate: toLocalInput(now),
    location: '',
    participants: '',
    agenda: '',
    content: '',
    decisions: '',
    actions: '',
    nextMeeting: '',
  };
}

function readFile(file: File) {
  return new Promise<NewFile>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({ fileName: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, data: String(reader.result) });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Saisie d'un PV. `onSubmit` reçoit les champs, les nouveaux fichiers et les
 * pièces jointes existantes à retirer ; il renvoie un message d'erreur ou rien.
 */
export default function MeetingForm({
  initial,
  existingFiles = [],
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: MeetingValues;
  existingFiles?: ExistingFile[];
  submitLabel: string;
  onSubmit: (payload: MeetingValues & { files: NewFile[]; removeFileIds: string[] }) => Promise<string | void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState(initial);
  const [files, setFiles] = useState<NewFile[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key: keyof MeetingValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  async function onFiles(event: React.ChangeEvent<HTMLInputElement>) {
    setError('');
    const picked: NewFile[] = [];
    for (const file of Array.from(event.target.files ?? [])) {
      if (file.size > FILE_MAX) {
        setError(`« ${file.name} » dépasse 4 Mo et n'a pas été joint.`);
        continue;
      }
      picked.push(await readFile(file));
    }
    setFiles((current) => [...current, ...picked]);
    event.target.value = '';
  }

  async function submit() {
    setError('');
    if (!values.title.trim()) return setError('Le titre est obligatoire.');
    if (!values.meetingDate) return setError('La date de la réunion est obligatoire.');
    if (!values.content.trim()) return setError('Le compte rendu est obligatoire.');
    setBusy(true);
    try {
      const message = await onSubmit({
        ...values,
        // Les champs datetime-local sont en heure locale : on les convertit en ISO.
        meetingDate: new Date(values.meetingDate).toISOString(),
        nextMeeting: values.nextMeeting ? new Date(values.nextMeeting).toISOString() : '',
        files,
        removeFileIds: removed,
      });
      if (message) setError(message);
    } finally {
      setBusy(false);
    }
  }

  const kept = existingFiles.filter((f) => !removed.includes(f.id));

  return (
    <div className="stack">
      <div className="form-grid">
        <div className="field span-2">
          <label htmlFor="pv-title">Titre du PV</label>
          <input className="input" id="pv-title" value={values.title} onChange={set('title')} />
        </div>
        <div className="field">
          <label htmlFor="pv-date">Date et heure de la réunion</label>
          <input className="input" id="pv-date" type="datetime-local" value={values.meetingDate} onChange={set('meetingDate')} />
        </div>
        <div className="field">
          <label htmlFor="pv-location">Lieu ou lien de visioconférence</label>
          <input className="input" id="pv-location" value={values.location} onChange={set('location')} />
        </div>
        <div className="field span-2">
          <label htmlFor="pv-participants">Participants</label>
          <textarea className="input" id="pv-participants" rows={3} value={values.participants} onChange={set('participants')} />
          <div className="field-hint">Un participant par ligne, avec sa société ou sa fonction.</div>
        </div>
        <div className="field span-2">
          <label htmlFor="pv-agenda">Ordre du jour</label>
          <textarea className="input" id="pv-agenda" rows={3} value={values.agenda} onChange={set('agenda')} />
        </div>
        <div className="field span-2">
          <label htmlFor="pv-content">Compte rendu — points abordés</label>
          <textarea className="input" id="pv-content" rows={6} value={values.content} onChange={set('content')} />
        </div>
        <div className="field span-2">
          <label htmlFor="pv-decisions">Décisions prises</label>
          <textarea className="input" id="pv-decisions" rows={3} value={values.decisions} onChange={set('decisions')} />
        </div>
        <div className="field span-2">
          <label htmlFor="pv-actions">Actions à mener</label>
          <textarea className="input" id="pv-actions" rows={3} value={values.actions} onChange={set('actions')} />
          <div className="field-hint">Une action par ligne : quoi, qui, pour quand.</div>
        </div>
        <div className="field">
          <label htmlFor="pv-next">Prochaine réunion (facultatif)</label>
          <input className="input" id="pv-next" type="datetime-local" value={values.nextMeeting} onChange={set('nextMeeting')} />
        </div>
        <div className="field">
          <label htmlFor="pv-files">Pièces jointes</label>
          <input className="input" id="pv-files" type="file" multiple accept={ACCEPTED} onChange={onFiles} />
          <div className="field-hint">PV signé, supports… 4 Mo par fichier, 12 Mo au total.</div>
        </div>
      </div>

      {kept.length || files.length ? (
        <ul className="small" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {kept.map((f) => (
            <li key={f.id} className="row" style={{ gap: 8 }}>
              <span>📎 {f.fileName}</span>
              <span className="muted">({Math.round(f.size / 1024)} Ko)</span>
              <button type="button" className="btn btn-ghost" onClick={() => setRemoved((r) => [...r, f.id])}>
                Retirer
              </button>
            </li>
          ))}
          {files.map((f, i) => (
            <li key={`${f.fileName}-${i}`} className="row" style={{ gap: 8 }}>
              <span>📎 {f.fileName}</span>
              <span className="muted">({Math.round(f.size / 1024)} Ko, à envoyer)</span>
              <button type="button" className="btn btn-ghost" onClick={() => setFiles((c) => c.filter((_, j) => j !== i))}>
                Retirer
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="row">
        <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Enregistrement…' : submitLabel}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
          Annuler
        </button>
      </div>
    </div>
  );
}
