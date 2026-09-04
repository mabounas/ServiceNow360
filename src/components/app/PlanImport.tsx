'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDate } from '@/lib/labels';

type ImportedTask = {
  name: string;
  ownerLabel: string | null;
  isMilestone: boolean;
  startWeek: number;
  endWeek: number;
  startDate: string;
  endDate: string;
};

type Preview = {
  sheetName: string;
  weekCount: number;
  taskCount: number;
  milestoneCount: number;
  warnings: string[];
  phases: { name: string; startWeek: number; endWeek: number; startDate: string; endDate: string; tasks: ImportedTask[] }[];
};

/** Lundi de la semaine en cours, proposé par défaut comme semaine 1. */
function currentMonday() {
  const d = new Date();
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return d.toISOString().slice(0, 10);
}

export default function PlanImport({ projectId, existingTasks }: { projectId: string; existingTasks: number }) {
  const router = useRouter();
  const [fileName, setFileName] = useState('');
  const [fileData, setFileData] = useState('');
  const [startDate, setStartDate] = useState(currentMonday());
  const [replace, setReplace] = useState(existingTasks > 0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [openPhase, setOpenPhase] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreview(null);
    setDone('');
    setError('');
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setFileData(String(reader.result));
      setFileName(file.name);
    };
    reader.onerror = () => setError('Lecture du fichier impossible.');
    reader.readAsDataURL(file);
  }

  async function send(dryRun: boolean) {
    if (!fileData) return setError('Sélectionnez le fichier du planning.');
    setError('');
    setDone('');
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/plan-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: fileData, startDate, dryRun, replace }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Import impossible.');
        return;
      }
      if (dryRun) {
        setPreview(data.plan);
        setOpenPhase(data.plan.phases[0]?.name ?? null);
      } else {
        setPreview(null);
        setDone(`${data.imported.phases} phase(s) et ${data.imported.tasks} ligne(s) importées.`);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="panel mb-24">
        <div className="panel-head">
          <h3 className="panel-title">Fichier source</h3>
          <span className="small muted">Classeur Excel (.xlsx) au format « une ligne par tâche, une colonne par semaine ».</span>
        </div>
        <div className="panel-body">
          <div className="form-grid">
            <div className="field">
              <label htmlFor="pi-file">Planning à importer</label>
              <input className="input" id="pi-file" type="file" accept=".xlsx,.xlsm" onChange={onFile} />
              {fileName ? <div className="field-hint">{fileName}</div> : null}
            </div>
            <div className="field">
              <label htmlFor="pi-start">Lundi de la semaine 1</label>
              <input className="input" id="pi-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <div className="field-hint">
                Le fichier raisonne en semaines relatives ; cette date les convertit en dates réelles.
              </div>
            </div>
          </div>

          {existingTasks > 0 ? (
            <label className="row small mt-16" style={{ gap: 8 }}>
              <input
                type="checkbox"
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
                style={{ accentColor: 'var(--color-accent)', width: 15, height: 15 }}
              />
              <span>
                Remplacer le planning actuel ({existingTasks} tâche(s) seront supprimées ; les tickets rattachés sont
                conservés, simplement détachés de leur tâche)
              </span>
            </label>
          ) : null}

          {error ? <div className="alert alert-error mt-16">{error}</div> : null}
          {done ? (
            <div className="alert alert-ok mt-16">
              {done} <Link href={`/app/projets/${projectId}/planning`}>Ouvrir le planning</Link>
            </div>
          ) : null}

          <div className="row mt-24">
            <button type="button" className="btn btn-secondary" onClick={() => send(true)} disabled={busy || !fileData}>
              {busy ? 'Lecture…' : 'Analyser le fichier'}
            </button>
            {preview ? (
              <button type="button" className="btn btn-primary" onClick={() => send(false)} disabled={busy}>
                Importer {preview.phases.length} phases et {preview.taskCount + preview.milestoneCount} lignes
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {preview ? (
        <>
          <div className="stat-grid mb-24">
            <div className="stat">
              <div className="stat-value">{preview.phases.length}</div>
              <div className="stat-label">phases détectées</div>
            </div>
            <div className="stat">
              <div className="stat-value">{preview.taskCount}</div>
              <div className="stat-label">tâches</div>
            </div>
            <div className="stat">
              <div className="stat-value">{preview.milestoneCount}</div>
              <div className="stat-label">jalons</div>
            </div>
            <div className="stat">
              <div className="stat-value">{preview.weekCount}</div>
              <div className="stat-label">semaines couvertes</div>
            </div>
          </div>

          {preview.warnings.length > 0 ? (
            <div className="alert alert-error mb-24">
              <strong>{preview.warnings.length} point(s) à vérifier</strong>
              <ul className="small" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {preview.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="panel">
            <div className="panel-head">
              <h3 className="panel-title">Aperçu — feuille « {preview.sheetName} »</h3>
              <span className="small muted">Rien n’est encore enregistré.</span>
            </div>
            <div className="panel-body panel-body-flush">
              {preview.phases.map((phase) => (
                <div key={phase.name} style={{ borderBottom: '1px solid var(--color-divider)' }}>
                  <button
                    type="button"
                    onClick={() => setOpenPhase(openPhase === phase.name ? null : phase.name)}
                    className="gantt-row is-parent"
                    style={{ width: '100%', background: 'transparent', border: 0, cursor: 'pointer', height: 44, justifyContent: 'space-between' }}
                  >
                    <span>
                      {phase.name}{' '}
                      <span className="muted small" style={{ fontWeight: 400 }}>
                        — S{phase.startWeek} à S{phase.endWeek} ({formatDate(phase.startDate)} → {formatDate(phase.endDate)})
                      </span>
                    </span>
                    <span className="small muted">
                      {phase.tasks.length} ligne(s) {openPhase === phase.name ? '–' : '+'}
                    </span>
                  </button>

                  {openPhase === phase.name ? (
                    <div className="table-wrap">
                      <table className="table table-compact">
                        <thead>
                          <tr>
                            <th>Tâche / livrable</th>
                            <th>Type</th>
                            <th>Responsable au fichier</th>
                            <th>Semaines</th>
                            <th>Dates</th>
                          </tr>
                        </thead>
                        <tbody>
                          {phase.tasks.map((task) => (
                            <tr key={task.name}>
                              <td>{task.name}</td>
                              <td className="small nowrap">{task.isMilestone ? 'Jalon' : 'Tâche'}</td>
                              <td className="small">{task.ownerLabel ?? '—'}</td>
                              <td className="small mono nowrap">
                                S{task.startWeek}
                                {task.endWeek !== task.startWeek ? `–S${task.endWeek}` : ''}
                              </td>
                              <td className="small mono nowrap">
                                {formatDate(task.startDate)} → {formatDate(task.endDate)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
