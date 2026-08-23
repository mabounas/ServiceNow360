'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Severity, TicketType } from '@prisma/client';
import { ENVIRONMENTS, SEVERITY_LABEL, TICKET_SUBCATEGORIES, TICKET_TYPE_LABEL } from '@/lib/labels';
import { SLA_GRID } from '@/lib/sla';

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
const ACCEPTED = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.log,.csv,.zip,.mp4';

type Attachment = { fileName: string; mimeType: string; size: number; data: string };

function readFile(file: File) {
  return new Promise<Attachment>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({ fileName: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, data: String(reader.result) });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function NewTicketForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [type, setType] = useState<TicketType>('INCIDENT');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    moduleName: '',
    subCategory: '',
    environmentName: 'Production',
    severity: 'MAJOR' as Severity,
    reproSteps: '',
    businessJustification: '',
    expectedBenefit: '',
    businessUrgency: '',
    estimatedBudget: '',
  });

  const isIncident = type === 'INCIDENT';
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  async function onFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(event.target.files ?? []);
    setError('');
    const accepted: Attachment[] = [];
    let total = files.reduce((sum, f) => sum + f.size, 0);
    for (const file of list) {
      if (file.size > MAX_FILE_BYTES) {
        setError(`« ${file.name} » dépasse 4 Mo et n'a pas été joint.`);
        continue;
      }
      if (total + file.size > MAX_TOTAL_BYTES) {
        setError('Le total des pièces jointes est limité à 10 Mo.');
        break;
      }
      total += file.size;
      accepted.push(await readFile(file));
    }
    setFiles((current) => [...current, ...accepted]);
    event.target.value = '';
  }

  async function submit() {
    setError('');
    if (!form.title.trim()) return setError('Le titre est obligatoire.');
    if (!form.description.trim()) return setError('La description est obligatoire.');

    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          title: form.title,
          description: form.description,
          moduleName: form.moduleName,
          subCategory: form.subCategory,
          environmentName: isIncident ? form.environmentName : null,
          severity: isIncident ? form.severity : null,
          reproSteps: isIncident ? form.reproSteps : null,
          businessJustification: isIncident ? null : form.businessJustification,
          expectedBenefit: isIncident ? null : form.expectedBenefit,
          businessUrgency: isIncident ? null : form.businessUrgency,
          estimatedBudget: isIncident ? null : form.estimatedBudget,
          attachments: files,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Création impossible.');
        return;
      }
      router.push(`/app/tickets/${data.ticket.id}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3 className="panel-title">Nouveau ticket</h3>
        <span className="small muted">Le type conditionne le formulaire, le circuit de traitement et le suivi.</span>
      </div>
      <div className="panel-body">
        <div className="field mb-16">
          <label htmlFor="t-type">Type de ticket</label>
          <select className="input" id="t-type" value={type} onChange={(e) => setType(e.target.value as TicketType)}>
            {(Object.keys(TICKET_TYPE_LABEL) as TicketType[]).map((key) => (
              <option key={key} value={key}>
                {TICKET_TYPE_LABEL[key]}
              </option>
            ))}
          </select>
          <div className="field-hint">
            {isIncident
              ? 'Circuit correctif piloté par SLA : qualification, assignation, traitement, validation.'
              : 'Circuit de gouvernance : analyse, chiffrage, arbitrage puis planification au Gantt.'}
          </div>
        </div>

        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="t-title">Titre</label>
            <input className="input" id="t-title" value={form.title} onChange={set('title')} />
          </div>

          <div className="field span-2">
            <label htmlFor="t-desc">Description détaillée</label>
            <textarea className="input" id="t-desc" rows={6} value={form.description} onChange={set('description')} />
          </div>

          <div className="field">
            <label htmlFor="t-module">Module / fonctionnalité concernée</label>
            <input className="input" id="t-module" value={form.moduleName} onChange={set('moduleName')} />
          </div>

          <div className="field">
            <label htmlFor="t-sub">Sous-catégorie</label>
            <select className="input" id="t-sub" value={form.subCategory} onChange={set('subCategory')}>
              <option value="">— Sélectionner —</option>
              {TICKET_SUBCATEGORIES[type].map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {isIncident ? (
            <>
              <div className="field">
                <label htmlFor="t-env">Environnement</label>
                <select className="input" id="t-env" value={form.environmentName} onChange={set('environmentName')}>
                  {ENVIRONMENTS.map((env) => (
                    <option key={env} value={env}>
                      {env}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="t-sev">Sévérité</label>
                <select className="input" id="t-sev" value={form.severity} onChange={set('severity')}>
                  {(Object.keys(SEVERITY_LABEL) as Severity[]).map((key) => (
                    <option key={key} value={key}>
                      {SEVERITY_LABEL[key]}
                    </option>
                  ))}
                </select>
                <div className="field-hint">
                  SLA appliqué : première réponse sous {SLA_GRID[form.severity].firstResponseHours} h, résolution sous{' '}
                  {SLA_GRID[form.severity].resolutionHours} h.
                </div>
              </div>
              <div className="field span-2">
                <label htmlFor="t-repro">Étapes de reproduction</label>
                <textarea className="input" id="t-repro" rows={4} value={form.reproSteps} onChange={set('reproSteps')} />
              </div>
            </>
          ) : (
            <>
              <div className="field span-2">
                <label htmlFor="t-just">Justification métier</label>
                <textarea className="input" id="t-just" rows={3} value={form.businessJustification} onChange={set('businessJustification')} />
              </div>
              <div className="field span-2">
                <label htmlFor="t-benefit">Bénéfice attendu</label>
                <textarea className="input" id="t-benefit" rows={3} value={form.expectedBenefit} onChange={set('expectedBenefit')} />
              </div>
              <div className="field">
                <label htmlFor="t-urgency">Urgence business</label>
                <select className="input" id="t-urgency" value={form.businessUrgency} onChange={set('businessUrgency')}>
                  <option value="">— Sélectionner —</option>
                  <option value="Immédiate">Immédiate</option>
                  <option value="Prochaine version">Prochaine version</option>
                  <option value="Sans urgence">Sans urgence</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="t-budget">Budget envisagé (facultatif)</label>
                <input className="input" id="t-budget" value={form.estimatedBudget} onChange={set('estimatedBudget')} />
              </div>
            </>
          )}

          <div className="field span-2">
            <label htmlFor="t-files">Pièces jointes</label>
            <input className="input" id="t-files" type="file" multiple accept={ACCEPTED} onChange={onFiles} />
            <div className="field-hint">Captures, logs, vidéos ou maquettes — 4 Mo par fichier, 10 Mo au total.</div>
            {files.length > 0 ? (
              <ul className="small mt-8" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {files.map((file, index) => (
                  <li key={`${file.fileName}-${index}`} className="row" style={{ gap: 8 }}>
                    <span>{file.fileName}</span>
                    <span className="muted">({Math.round(file.size / 1024)} Ko)</span>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                    >
                      Retirer
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        {error ? <div className="alert alert-error mt-16">{error}</div> : null}

        <div className="row mt-24">
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Envoi…' : 'Déclarer le ticket'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => router.back()}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
