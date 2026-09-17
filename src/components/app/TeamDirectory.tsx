'use client';

import { useMemo, useState } from 'react';
import type { ProjectRole } from '@prisma/client';
import { PROJECT_ROLE_LABEL } from '@/lib/labels';

export type DirectoryEntry = {
  id: string;
  name: string;
  jobRole: string | null;
  company: string;
  role: ProjectRole;
  email: string;
  phone: string | null;
  isMe: boolean;
};

// Ordre d'affichage : pilotage d'abord, observateurs en dernier.
const ROLE_ORDER: ProjectRole[] = ['PROJECT_MANAGER', 'SUPERVISOR', 'TECHNICIAN', 'MEMBER', 'VIEWER'];

/** Sans accents ni casse, pour que « helene » trouve « Hélène ». */
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Annuaire de l'équipe projet, consultable par tous les membres. */
export default function TeamDirectory({ entries }: { entries: DirectoryEntry[] }) {
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<'ALL' | ProjectRole>('ALL');

  const presentRoles = ROLE_ORDER.filter((r) => entries.some((e) => e.role === r));

  const visible = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    // « 0661… » doit trouver « +212 6 61… » : on ignore le 0 initial du format national.
    const digits = query.replace(/\D/g, '').replace(/^0+/, '');
    return entries
      .filter((e) => role === 'ALL' || e.role === role)
      .filter((e) => {
        if (words.length === 0) return true;
        const haystack = normalize([e.name, e.company, e.email, e.jobRole ?? '', PROJECT_ROLE_LABEL[e.role]].join(' '));
        // Recherche par numéro de téléphone, quel que soit le format saisi (espaces, +212…).
        if (digits.length >= 3 && (e.phone ?? '').replace(/\D/g, '').includes(digits)) return true;
        return words.every((w) => haystack.includes(w));
      })
      .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name, 'fr'));
  }, [entries, query, role]);

  return (
    <div className="panel mb-24">
      <div className="panel-head">
        <h3 className="panel-title">Annuaire de l’équipe ({visible.length === entries.length ? entries.length : `${visible.length} / ${entries.length}`})</h3>
      </div>
      <div className="panel-body" style={{ paddingBottom: 0 }}>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <input
            className="input"
            type="search"
            placeholder="Rechercher un nom, une société, un e-mail, un téléphone…"
            aria-label="Rechercher une personne"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: '1 1 280px' }}
          />
          <select
            className="input"
            aria-label="Filtrer par rôle"
            value={role}
            onChange={(e) => setRole(e.target.value as 'ALL' | ProjectRole)}
            style={{ flex: '0 1 240px' }}
          >
            <option value="ALL">Tous les rôles</option>
            {presentRoles.map((r) => (
              <option key={r} value={r}>
                {PROJECT_ROLE_LABEL[r]} ({entries.filter((e) => e.role === r).length})
              </option>
            ))}
          </select>
          {query || role !== 'ALL' ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setQuery('');
                setRole('ALL');
              }}
            >
              Effacer
            </button>
          ) : null}
        </div>
      </div>
      <div className="panel-body panel-body-flush table-wrap">
        {visible.length === 0 ? (
          <div className="empty">Aucune personne ne correspond à cette recherche.</div>
        ) : (
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Société</th>
                <th>Rôle sur le projet</th>
                <th>Téléphone</th>
                <th>Adresse e-mail</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => (
                <tr key={e.id}>
                  <td>
                    <strong>{e.name}</strong>
                    {e.isMe ? <span className="small muted"> (vous)</span> : null}
                    {e.jobRole ? <div className="small muted">{e.jobRole}</div> : null}
                  </td>
                  <td className="small">{e.company}</td>
                  <td className="small">{PROJECT_ROLE_LABEL[e.role]}</td>
                  <td className="small nowrap">
                    {e.phone ? (
                      <a href={`tel:${e.phone.replace(/[^\d+]/g, '')}`}>{e.phone}</a>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="small">
                    <a href={`mailto:${e.email}`} style={{ wordBreak: 'break-all' }}>
                      {e.email}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
