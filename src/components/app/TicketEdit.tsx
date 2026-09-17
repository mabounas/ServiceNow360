'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TicketType } from '@prisma/client';
import { ENVIRONMENTS, TICKET_SUBCATEGORIES } from '@/lib/labels';

export type TicketContent = {
  title: string;
  description: string;
  moduleName: string | null;
  subCategory: string | null;
  environmentName: string | null;
  reproSteps: string | null;
  businessJustification: string | null;
  expectedBenefit: string | null;
  businessUrgency: string | null;
  estimatedBudget: string | null;
};

/** Modification du contenu déclaré d'un ticket non clôturé. */
export default function TicketEdit({
  ticketId,
  type,
  initial,
}: {
  ticketId: string;
  type: TicketType;
  initial: TicketContent;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => {
    const out = {} as Record<keyof TicketContent, string>;
    for (const [k, v] of Object.entries(initial)) out[k as keyof TicketContent] = v ?? '';
    return out;
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isIncident = type === 'INCIDENT';
  const set = (key: keyof TicketContent) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save() {
    setError('');
    if (!form.title.trim()) return setError('Le titre est obligatoire.');
    if (!form.description.trim()) return setError('La description est obligatoire.');
    const keys: (keyof TicketContent)[] = isIncident
      ? ['title', 'description', 'moduleName', 'subCategory', 'environmentName', 'reproSteps']
      : ['title', 'description', 'moduleName', 'subCategory', 'businessJustification', 'expectedBenefit', 'businessUrgency', 'estimatedBudget'];
    const payload = Object.fromEntries(keys.map((k) => [k, form[k]]));
    setBusy(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Enregistrement impossible.');
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
        Modifier le ticket
      </button>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3 className="panel-title">Modifier le ticket</h3>
        <span className="small muted">Chaque modification est tracée dans l’historique.</span>
      </div>
      <div className="panel-body">
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="te-title">Titre</label>
            <input className="input" id="te-title" maxLength={200} value={form.title} onChange={set('title')} />
          </div>
          <div className="field span-2">
            <label htmlFor="te-desc">Description détaillée</label>
            <textarea className="input" id="te-desc" rows={6} value={form.description} onChange={set('description')} />
          </div>
          <div className="field">
            <label htmlFor="te-module">Module / fonctionnalité concernée</label>
            <input className="input" id="te-module" value={form.moduleName} onChange={set('moduleName')} />
          </div>
          <div className="field">
            <label htmlFor="te-sub">Sous-catégorie</label>
            <select className="input" id="te-sub" value={form.subCategory} onChange={set('subCategory')}>
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
                <label htmlFor="te-env">Environnement</label>
                <select className="input" id="te-env" value={form.environmentName} onChange={set('environmentName')}>
                  <option value="">— Sélectionner —</option>
                  {ENVIRONMENTS.map((env) => (
                    <option key={env} value={env}>
                      {env}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field span-2">
                <label htmlFor="te-repro">Étapes de reproduction</label>
                <textarea className="input" id="te-repro" rows={4} value={form.reproSteps} onChange={set('reproSteps')} />
              </div>
            </>
          ) : (
            <>
              <div className="field span-2">
                <label htmlFor="te-just">Justification métier</label>
                <textarea className="input" id="te-just" rows={3} value={form.businessJustification} onChange={set('businessJustification')} />
              </div>
              <div className="field span-2">
                <label htmlFor="te-benefit">Bénéfice attendu</label>
                <textarea className="input" id="te-benefit" rows={3} value={form.expectedBenefit} onChange={set('expectedBenefit')} />
              </div>
              <div className="field">
                <label htmlFor="te-urgency">Urgence business</label>
                <select className="input" id="te-urgency" value={form.businessUrgency} onChange={set('businessUrgency')}>
                  <option value="">— Sélectionner —</option>
                  <option value="Immédiate">Immédiate</option>
                  <option value="Prochaine version">Prochaine version</option>
                  <option value="Sans urgence">Sans urgence</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="te-budget">Budget envisagé</label>
                <input className="input" id="te-budget" value={form.estimatedBudget} onChange={set('estimatedBudget')} />
              </div>
            </>
          )}
        </div>

        {error ? <div className="alert alert-error mt-16">{error}</div> : null}

        <div className="row mt-16">
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)} disabled={busy}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
