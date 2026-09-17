'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TaskStatus } from '@prisma/client';
import GanttChart, { progressColor, type Zoom } from './GanttChart';
import TaskMeetings from './TaskMeetings';
import {
  buildTree,
  computeProgress,
  criticalPath,
  derivedStatus,
  lateTasks,
  ownerInitials,
  ownerLabelOf,
  rollupProgress,
  type PlanDependency,
  type PlanTask,
  type TaskNote,
} from '@/lib/planning';
import { DEPENDENCY_TYPE_LABEL, TASK_STATUS_LABEL, formatDate, formatDateTime } from '@/lib/labels';

type Member = { id: string; name: string };
type Baseline = { id: string; label: string; snapshot: { taskId: string; startDate: string; endDate: string }[] };

const EMPTY_TASK = {
  name: '',
  description: '',
  parentId: '',
  ownerLabel: '',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10),
  progress: 0,
  status: 'TODO' as TaskStatus,
  isMilestone: false,
};

export default function PlanningBoard({
  projectId,
  tasks: initialTasks,
  dependencies: initialDeps,
  members,
  baselines,
  editable,
  canWriteMeetings = false,
  canComment = true,
}: {
  projectId: string;
  tasks: PlanTask[];
  dependencies: PlanDependency[];
  members: Member[];
  baselines: Baseline[];
  editable: boolean;
  canWriteMeetings?: boolean;
  canComment?: boolean;
}) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [tasks, setTasks] = useState(initialTasks);
  const [dependencies, setDependencies] = useState(initialDeps);
  const [zoom, setZoom] = useState<Zoom>('week');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [baselineId, setBaselineId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState(EMPTY_TASK);
  const [depDraft, setDepDraft] = useState({ predecessorId: '', successorId: '', lagDays: '0' });
  const [comment, setComment] = useState('');
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [sliderValue, setSliderValue] = useState(0);
  const [drawerTab, setDrawerTab] = useState<'details' | 'comments' | 'meetings'>('details');

  const rows = useMemo(() => buildTree(tasks), [tasks]);
  const critical = useMemo(() => criticalPath(tasks, dependencies), [tasks, dependencies]);
  const selected = tasks.find((t) => t.id === selectedId) ?? null;
  const progressOf = useMemo(() => computeProgress(tasks), [tasks]);
  const parentIds = useMemo(() => new Set(tasks.map((t) => t.parentId).filter(Boolean) as string[]), [tasks]);
  const selectedIsParent = selected ? parentIds.has(selected.id) : false;
  const selectedProgress = selected ? progressOf.get(selected.id) ?? 0 : 0;
  // Position de la tâche sélectionnée parmi les éléments de même niveau (ordre affiché).
  const siblingPos = useMemo(() => {
    const count = new Map<string | null, number>();
    const pos = new Map<string, { index: number; parentId: string | null }>();
    for (const r of rows) {
      const key = r.task.parentId ?? null;
      const index = count.get(key) ?? 0;
      pos.set(r.task.id, { index, parentId: key });
      count.set(key, index + 1);
    }
    return { pos, count };
  }, [rows]);
  const selectedSiblings = selected ? rows.filter((r) => (r.task.parentId ?? null) === (selected.parentId ?? null)) : [];
  const selectedIndex = selected ? selectedSiblings.findIndex((r) => r.task.id === selected.id) : -1;
  // Phases possibles : tout élément non jalon qui n'est ni la tâche ni l'une de ses sous-tâches.
  const phaseOptions = useMemo(() => {
    if (!selected) return [];
    const descendants = new Set<string>([selected.id]);
    for (const r of rows) if (r.task.parentId && descendants.has(r.task.parentId)) descendants.add(r.task.id);
    return rows.filter((r) => !r.task.isMilestone && !descendants.has(r.task.id));
  }, [rows, selected]);
  const hovered = hover ? tasks.find((t) => t.id === hover.id) ?? null : null;
  // Suggestions de saisie : responsables déjà utilisés sur le projet, puis membres de l'équipe.
  const ownerSuggestions = useMemo(
    () =>
      [...new Set([...tasks.map((t) => ownerLabelOf(t)).filter(Boolean), ...members.map((m) => m.name)] as string[])].sort(
        (a, b) => a.localeCompare(b, 'fr'),
      ),
    [tasks, members],
  );
  const progress = rollupProgress(tasks);

  const setMeetingCount = useCallback((taskId: string, count: number) => {
    setTasks((current) =>
      current.some((t) => t.id === taskId && (t.meetingCount ?? 0) !== count)
        ? current.map((t) => (t.id === taskId ? { ...t, meetingCount: count } : t))
        : current,
    );
  }, []);

  function closeDrawer() {
    setSelectedId(null);
    setError('');
  }

  // Échap ferme le panneau de la tâche.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  function select(id: string) {
    setError('');
    setSelectedId(id);
    setSliderValue(tasks.find((t) => t.id === id)?.progress ?? 0);
  }
  const late = lateTasks(tasks);

  const baseline = useMemo(() => {
    const found = baselines.find((b) => b.id === baselineId);
    if (!found) return undefined;
    return Object.fromEntries(found.snapshot.map((s) => [s.taskId, { startDate: s.startDate, endDate: s.endDate }]));
  }, [baselineId, baselines]);

  async function call(url: string, init: RequestInit) {
    setError('');
    setBusy(true);
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Opération impossible.');
        return null;
      }
      return data;
    } finally {
      setBusy(false);
    }
  }

  async function moveTask(id: string, startDate: string, endDate: string) {
    // Mise à jour optimiste : la barre suit le geste, la base est alignée ensuite.
    setTasks((current) => current.map((t) => (t.id === id ? { ...t, startDate, endDate } : t)));
    const data = await call(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ startDate, endDate }) });
    if (!data) router.refresh();
  }

  async function saveSelected(patch: Partial<PlanTask>) {
    if (!selected) return;
    const data = await call(`/api/tasks/${selected.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    if (!data) return;
    setTasks((current) =>
      current.map((t) =>
        t.id === selected.id
          ? {
              ...t,
              ...patch,
              startDate: data.task.startDate ?? t.startDate,
              endDate: data.task.endDate ?? t.endDate,
              status: data.task.status ?? t.status,
            }
          : t,
      ),
    );
    router.refresh();
  }

  async function reorder(body: { direction?: 'up' | 'down'; parentId?: string | null }, taskId = selected?.id) {
    if (!taskId) return;
    const data = await call(`/api/tasks/${taskId}/move`, { method: 'POST', body: JSON.stringify(body) });
    if (!data) return;
    const next = new Map<string, { parentId: string | null; sortOrder: number }>(
      data.tasks.map((u: { id: string; parentId: string | null; sortOrder: number }) => [u.id, u]),
    );
    setTasks((current) =>
      current.map((t) => {
        const u = next.get(t.id);
        if (!u) return t;
        return t.id === taskId ? { ...t, parentId: u.parentId, sortOrder: u.sortOrder } : { ...t, sortOrder: u.sortOrder };
      }),
    );
    router.refresh();
  }

  async function setOwner(value: string) {
    if (!selected) return;
    const ownerLabel = value.trim();
    if (ownerLabel === (selected.ownerLabel ?? '')) return;
    const data = await call(`/api/tasks/${selected.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ownerLabel }),
    });
    if (!data) return;
    setTasks((current) =>
      current.map((t) => (t.id === selected.id ? { ...t, ownerLabel: ownerLabel || null } : t)),
    );
  }

  async function createTask() {
    if (!draft.name.trim()) return setError('Le nom de la tâche est obligatoire.');
    const data = await call(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      body: JSON.stringify({
        ...draft,
        parentId: draft.parentId || null,
        ownerLabel: draft.ownerLabel.trim(),
        endDate: draft.isMilestone ? draft.startDate : draft.endDate,
      }),
    });
    if (!data) return;
    setTasks((current) => [
      ...current,
      {
        id: data.task.id,
        parentId: data.task.parentId,
        name: data.task.name,
        startDate: data.task.startDate,
        endDate: data.task.endDate,
        progress: data.task.progress,
        status: data.task.status,
        isMilestone: data.task.isMilestone,
        sortOrder: data.task.sortOrder,
        ownerLabel: data.task.ownerLabel,
      },
    ]);
    setDraft(EMPTY_TASK);
    setShowCreate(false);
    router.refresh();
  }

  async function deleteTask() {
    if (!selected) return;
    const descendants = tasks.filter((t) => t.parentId === selected.id).length;
    const question = descendants
      ? `Supprimer « ${selected.name} » et ses ${descendants} sous-élément(s) ? Cette action est définitive.`
      : `Supprimer « ${selected.name} » ? Cette action est définitive.`;
    if (!window.confirm(question)) return;
    const data = await call(`/api/tasks/${selected.id}`, { method: 'DELETE' });
    if (!data) return;
    setTasks((current) => current.filter((t) => t.id !== selected.id && t.parentId !== selected.id));
    setSelectedId(null);
    router.refresh();
  }

  async function addDependency() {
    if (!depDraft.predecessorId || !depDraft.successorId) return setError('Sélectionnez les deux tâches.');
    const data = await call(`/api/projects/${projectId}/dependencies`, {
      method: 'POST',
      body: JSON.stringify({ ...depDraft, lagDays: Number(depDraft.lagDays) }),
    });
    if (!data) return;
    setDependencies((current) => [...current.filter((d) => d.id !== data.dependency.id), data.dependency]);
    setDepDraft({ predecessorId: '', successorId: '', lagDays: '0' });
  }

  async function removeDependency(id: string) {
    const data = await call(`/api/projects/${projectId}/dependencies?dependencyId=${id}`, { method: 'DELETE' });
    if (!data) return;
    setDependencies((current) => current.filter((d) => d.id !== id));
  }

  async function saveBaseline() {
    const label = window.prompt('Nom de la version du planning :', `Version du ${new Date().toLocaleDateString('fr-FR')}`);
    if (!label) return;
    const data = await call(`/api/projects/${projectId}/baselines`, { method: 'POST', body: JSON.stringify({ label }) });
    if (data) router.refresh();
  }

  async function postComment() {
    if (!selected || !comment.trim()) return;
    const data = await call(`/api/tasks/${selected.id}/comments`, { method: 'POST', body: JSON.stringify({ body: comment }) });
    if (!data) return;
    const note: TaskNote = {
      id: data.comment.id,
      body: data.comment.body,
      authorName: data.comment.authorName,
      createdAt: data.comment.createdAt,
    };
    // L'info-bulle se met à jour sans recharger la page.
    setTasks((current) =>
      current.map((t) => (t.id === selected.id ? { ...t, comments: [...(t.comments ?? []), note] } : t)),
    );
    setComment('');
  }

  /** Export image : le SVG est sérialisé puis rasterisé côté navigateur. */
  function exportPng() {
    const svg = svgRef.current;
    if (!svg) return;
    const source = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = svg.width.baseVal.value * 2;
      canvas.height = svg.height.baseVal.value * 2;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.scale(2, 2);
      context.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);
      const link = document.createElement('a');
      link.download = `gantt-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    image.src = url;
  }

  return (
    <>
      <div className="row mb-16 no-print" style={{ justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 8 }}>
          <span className="small muted">Zoom :</span>
          {(['day', 'week', 'month'] as Zoom[]).map((z) => (
            <button key={z} type="button" className={`btn ${zoom === z ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setZoom(z)}>
              {z === 'day' ? 'Jour' : z === 'week' ? 'Semaine' : 'Mois'}
            </button>
          ))}
          {baselines.length > 0 ? (
            <select className="input" style={{ width: 220 }} value={baselineId} onChange={(e) => setBaselineId(e.target.value)}>
              <option value="">Comparer à une version…</option>
              {baselines.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={exportPng}>
            Exporter le Gantt (PNG)
          </button>
          <a className="btn btn-secondary" href={`/api/projects/${projectId}/export?dataset=tasks&format=xlsx`}>
            Exporter (Excel)
          </a>
          <a className="btn btn-secondary" href={`/api/projects/${projectId}/export?dataset=tasks`}>
            Exporter (CSV)
          </a>
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
            Imprimer / PDF
          </button>
          {editable ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={saveBaseline} disabled={busy}>
                Figer une version
              </button>
              <a className="btn btn-secondary" href={`/app/projets/${projectId}/planning/import`}>
                Importer un planning
              </a>
              <button type="button" className="btn btn-primary" onClick={() => setShowCreate((v) => !v)}>
                {showCreate ? 'Fermer' : 'Ajouter une tâche'}
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="stat-grid mb-24">
        <div className="stat">
          <div className="stat-value">{progress} %</div>
          <div className="stat-label">avancement global</div>
        </div>
        <div className="stat">
          <div className="stat-value">{tasks.filter((t) => !t.isMilestone).length}</div>
          <div className="stat-label">tâches planifiées</div>
        </div>
        <div className="stat">
          <div className="stat-value">{tasks.filter((t) => t.isMilestone).length}</div>
          <div className="stat-label">jalons</div>
        </div>
        <div className="stat">
          <div className="stat-value">{late.length}</div>
          <div className="stat-label">tâches en retard</div>
        </div>
      </div>

      {error ? <div className="alert alert-error mb-16">{error}</div> : null}

      {showCreate && editable ? (
        <div className="panel mb-24 no-print">
          <div className="panel-head">
            <h3 className="panel-title">Nouvelle tâche / jalon</h3>
          </div>
          <div className="panel-body">
            <div className="form-grid">
              <div className="field span-2">
                <label htmlFor="n-name">Nom</label>
                <input className="input" id="n-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="n-parent">Rattachée à</label>
                <select className="input" id="n-parent" value={draft.parentId} onChange={(e) => setDraft({ ...draft, parentId: e.target.value })}>
                  <option value="">— Racine (phase) —</option>
                  {rows.map(({ task, depth }) => (
                    <option key={task.id} value={task.id}>
                      {'— '.repeat(depth)}
                      {task.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="n-owner">Responsable</label>
                <input
                  className="input"
                  id="n-owner"
                  list="owner-suggestions"
                  maxLength={120}
                  placeholder="Nom, équipe ou société"
                  value={draft.ownerLabel}
                  onChange={(e) => setDraft({ ...draft, ownerLabel: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="n-start">{draft.isMilestone ? 'Date du jalon' : 'Début'}</label>
                <input className="input" id="n-start" type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />
              </div>
              {draft.isMilestone ? (
                <div className="field" />
              ) : (
                <div className="field">
                  <label htmlFor="n-end">Fin</label>
                  <input
                    className="input"
                    id="n-end"
                    type="date"
                    value={draft.endDate}
                    onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
                  />
                </div>
              )}
              <div className="field span-2">
                <label className="row small" style={{ gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={draft.isMilestone}
                    onChange={(e) => setDraft({ ...draft, isMilestone: e.target.checked })}
                    style={{ accentColor: 'var(--color-accent)', width: 15, height: 15 }}
                  />
                  <span>Il s’agit d’un jalon (date unique, mis en évidence sur le planning)</span>
                </label>
              </div>
            </div>
            <div className="row mt-16">
              <button type="button" className="btn btn-primary" onClick={createTask} disabled={busy}>
                Créer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="gantt">
        <div className="gantt-list">
          <div className="gantt-list-head">Structure du projet (WBS)</div>
          {rows.map(({ task, depth, hasChildren }) => {
            const value = progressOf.get(task.id) ?? 0;
            const notes = task.comments?.length ?? 0;
            return (
              <div
                key={task.id}
                className={`gantt-row ${hasChildren ? 'is-parent' : ''} ${selectedId === task.id ? 'is-selected' : ''} ${critical.has(task.id) && !hasChildren ? 'is-critical' : ''}`}
                style={{ paddingLeft: 12 + depth * 16, cursor: 'pointer' }}
                onClick={() => select(task.id)}
                onMouseEnter={(e) => setHover({ id: task.id, x: e.clientX, y: e.clientY })}
                onMouseMove={(e) => setHover({ id: task.id, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHover(null)}
              >
                {task.isMilestone ? <span style={{ color: progressColor(value) }}>◆</span> : null}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{task.name}</span>
                {(() => {
                  const owner = ownerLabelOf(task);
                  if (!owner) return null;
                  return (
                    <span className="owner-chip" title={`Responsable : ${owner}`}>
                      {ownerInitials(owner)}
                    </span>
                  );
                })()}
                {task.meetingCount ? (
                  <span className="small muted gantt-row-meta" title={`${task.meetingCount} PV de réunion`}>
                    📋 {task.meetingCount}
                  </span>
                ) : null}
                {notes ? (
                  <span className="small muted gantt-row-meta" title={`${notes} commentaire(s)`}>
                    💬 {notes}
                  </span>
                ) : null}
                {critical.has(task.id) && !hasChildren ? <span className="badge badge-bad">critique</span> : null}
                {editable
                  ? (() => {
                      const p = siblingPos.pos.get(task.id);
                      const total = siblingPos.count.get(p?.parentId ?? null) ?? 0;
                      if (!p || total < 2) return null;
                      return (
                        <span className="row-move no-print" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            aria-label={`Monter « ${task.name} »`}
                            title="Monter"
                            disabled={busy || p.index === 0}
                            onClick={() => reorder({ direction: 'up' }, task.id)}
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            aria-label={`Descendre « ${task.name} »`}
                            title="Descendre"
                            disabled={busy || p.index === total - 1}
                            onClick={() => reorder({ direction: 'down' }, task.id)}
                          >
                            ▼
                          </button>
                        </span>
                      );
                    })()
                  : null}
                <span className="small mono" style={{ color: progressColor(value), fontWeight: 800, minWidth: 38, textAlign: 'right' }}>
                  {value}%
                </span>
              </div>
            );
          })}
          {rows.length === 0 ? <div className="empty">Aucune tâche planifiée.</div> : null}
        </div>

        <div className="gantt-scroll">
          <GanttChart
            tasks={tasks}
            dependencies={dependencies}
            baseline={baseline}
            zoom={zoom}
            selectedId={selectedId}
            editable={editable}
            onSelect={select}
            onMove={moveTask}
            onHover={setHover}
            svgRef={svgRef}
          />
        </div>
      </div>

      {hovered && hover ? (
        <div
          className="gantt-tooltip no-print"
          style={{
            left: Math.min(hover.x + 16, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 360),
            top: hover.y + 16,
          }}
          role="tooltip"
        >
          <div className="gantt-tooltip-title">{hovered.name}</div>
          <div className="small muted">
            {formatDate(hovered.startDate)} → {formatDate(hovered.endDate)} · avancement{' '}
            <strong style={{ color: progressColor(progressOf.get(hovered.id) ?? 0) }}>{progressOf.get(hovered.id) ?? 0} %</strong>
          </div>
          {(() => {
            const owner = ownerLabelOf(hovered);
            return (
              <div className="small mt-8">
                Responsable : <strong>{owner ?? 'non renseigné'}</strong>
              </div>
            );
          })()}
          {hovered.meetingCount ? (
            <div className="small mt-8">📋 {hovered.meetingCount} PV de réunion — détail dans le panneau de la tâche</div>
          ) : null}
          {hovered.comments?.length ? (
            <ul className="gantt-tooltip-notes">
              {hovered.comments.map((note) => (
                <li key={note.id}>
                  <span>{note.body}</span>
                  <span className="muted"> — {note.authorName}, {formatDateTime(note.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="small muted mt-8">Aucun commentaire.</div>
          )}
        </div>
      ) : null}

      <datalist id="owner-suggestions">
        {ownerSuggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <div className="gantt-legend">
        <span>
          <span className="swatch" style={{ background: '#1f9d55' }} />
          Terminé (100 %)
        </span>
        <span>
          <span className="swatch" style={{ background: 'linear-gradient(90deg, #f28c28 50%, #fde2c6 50%)' }} />
          En cours ou à faire (&lt; 100 %)
        </span>
        <span>
          <span className="swatch" style={{ border: '2px solid #ae1800', background: 'transparent' }} />
          Chemin critique
        </span>
        <span>
          <span className="swatch" style={{ background: '#bab6b6', height: 4, marginTop: 4 }} />
          Version de référence
        </span>
        <span>◆ Jalon</span>
        <span>💬 Commentaires au survol</span>
        <span>📋 PV de réunion</span>
      </div>

      {selected ? (
        <aside className="task-drawer no-print" role="dialog" aria-label={`Tâche ${selected.name}`}>
          <header className="task-drawer-head">
            <div style={{ minWidth: 0 }}>
              <div className="page-kicker" style={{ marginBottom: 4 }}>
                {selected.isMilestone ? 'Jalon' : selectedIsParent ? 'Phase' : 'Tâche'}
              </div>
              <h3 style={{ fontSize: 20, margin: 0, overflowWrap: 'anywhere' }}>{selected.name}</h3>
              <div className="small muted mt-8">
                {formatDate(selected.startDate)} → {formatDate(selected.endDate)} ·{' '}
                <strong style={{ color: progressColor(selectedProgress) }}>{selectedProgress} %</strong>
                {ownerLabelOf(selected) ? ` · ${ownerLabelOf(selected)}` : ''}
              </div>
            </div>
            <button type="button" className="btn btn-secondary btn-icon" onClick={closeDrawer} aria-label="Fermer le panneau" title="Fermer (Échap)">
              ✕
            </button>
          </header>

          <nav className="task-drawer-tabs" role="tablist">
            {(
              [
                ['details', 'Détails'],
                ['comments', `Commentaires (${selected.comments?.length ?? 0})`],
                ['meetings', `Réunions (${selected.meetingCount ?? 0})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={drawerTab === key}
                className={drawerTab === key ? 'is-active' : ''}
                onClick={() => setDrawerTab(key)}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="task-drawer-body">
            {error ? <div className="alert alert-error mb-16">{error}</div> : null}

            {drawerTab === 'details' ? (
              editable ? (
                <div className="form-grid">
                  <div className="field span-2">
                    <label htmlFor="e-name">Nom</label>
                    <input
                      className="input"
                      id="e-name"
                      defaultValue={selected.name}
                      key={`name-${selected.id}`}
                      onBlur={(e) => e.target.value.trim() && e.target.value !== selected.name && saveSelected({ name: e.target.value })}
                    />
                  </div>
                  <div className="field span-2">
                    <label htmlFor="e-owner">Responsable</label>
                    <input
                      className="input"
                      id="e-owner"
                      list="owner-suggestions"
                      maxLength={120}
                      placeholder="Nom, équipe ou société — interne ou externe au projet"
                      key={`o-${selected.id}-${selected.ownerLabel ?? ''}`}
                      defaultValue={selected.ownerLabel ?? ''}
                      onBlur={(e) => setOwner(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      }}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="e-start">{selected.isMilestone ? 'Date du jalon' : 'Début'}</label>
                    <input
                      className="input"
                      id="e-start"
                      type="date"
                      key={`start-${selected.id}-${selected.startDate}`}
                      defaultValue={selected.startDate.slice(0, 10)}
                      onChange={(e) => e.target.value && saveSelected({ startDate: new Date(e.target.value).toISOString() })}
                    />
                    {selected.isMilestone ? (
                      <div className="field-hint">Un jalon est ponctuel : cette date sert de début et de fin.</div>
                    ) : null}
                  </div>
                  {selected.isMilestone ? null : (
                    <div className="field">
                      <label htmlFor="e-end">Fin</label>
                      <input
                        className="input"
                        id="e-end"
                        type="date"
                        key={`end-${selected.id}-${selected.endDate}`}
                        defaultValue={selected.endDate.slice(0, 10)}
                        onChange={(e) => e.target.value && saveSelected({ endDate: new Date(e.target.value).toISOString() })}
                      />
                    </div>
                  )}
                  {selectedIsParent ? (
                    <div className="field">
                      <label>Avancement</label>
                      <div style={{ fontWeight: 800, color: progressColor(selectedProgress) }}>{selectedProgress} %</div>
                      <div className="field-hint">Calculé automatiquement : moyenne de ses sous-éléments.</div>
                    </div>
                  ) : (
                    <div className="field">
                      <label htmlFor="e-progress">
                        Avancement : <span style={{ color: progressColor(sliderValue) }}>{sliderValue} %</span>
                      </label>
                      <input
                        className="input"
                        id="e-progress"
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        key={`p-${selected.id}`}
                        value={sliderValue}
                        onChange={(e) => setSliderValue(Number(e.target.value))}
                        onMouseUp={() => saveSelected({ progress: sliderValue })}
                        onTouchEnd={() => saveSelected({ progress: sliderValue })}
                        onKeyUp={() => saveSelected({ progress: sliderValue })}
                      />
                    </div>
                  )}
                  <div className="field">
                    <label htmlFor="e-status">Statut</label>
                    {selectedIsParent ? (
                      <div>{TASK_STATUS_LABEL[derivedStatus(selected, selectedProgress, true)]}</div>
                    ) : (
                      <select
                        className="input"
                        id="e-status"
                        key={`s-${selected.id}-${selected.status}`}
                        defaultValue={selected.status}
                        onChange={(e) => saveSelected({ status: e.target.value as TaskStatus })}
                      >
                        {(Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map((key) => (
                          <option key={key} value={key}>
                            {TASK_STATUS_LABEL[key]}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="field span-2">
                    <label htmlFor="e-description">Description</label>
                    <textarea
                      className="input"
                      id="e-description"
                      rows={4}
                      key={`d-${selected.id}`}
                      defaultValue={selected.description ?? ''}
                      onBlur={(e) =>
                        e.target.value !== (selected.description ?? '') && saveSelected({ description: e.target.value })
                      }
                    />
                    <div className="field-hint">Les champs texte s’enregistrent en quittant le champ.</div>
                  </div>
                  <div className="field span-2">
                    <label htmlFor="e-parent">Position dans le planning</label>
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => reorder({ direction: 'up' })}
                        disabled={busy || selectedIndex <= 0}
                        title="Placer avant l’élément précédent du même niveau"
                      >
                        ↑ Monter
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => reorder({ direction: 'down' })}
                        disabled={busy || selectedIndex < 0 || selectedIndex >= selectedSiblings.length - 1}
                        title="Placer après l’élément suivant du même niveau"
                      >
                        ↓ Descendre
                      </button>
                      <span className="small muted">
                        {selectedIndex + 1} / {selectedSiblings.length} dans {selected.parentId ? 'sa phase' : 'le planning'}
                      </span>
                    </div>
                    <select
                      className="input mt-16"
                      id="e-parent"
                      value={selected.parentId ?? ''}
                      disabled={busy}
                      onChange={(e) => reorder({ parentId: e.target.value || null })}
                    >
                      <option value="">— Aucune phase (premier niveau) —</option>
                      {phaseOptions.map((r) => (
                        <option key={r.task.id} value={r.task.id}>
                          {'   '.repeat(r.depth)}
                          {r.task.name}
                        </option>
                      ))}
                    </select>
                    <div className="field-hint">Changer de phase place la tâche en dernière position de la phase choisie.</div>
                  </div>
                  <div className="field span-2">
                    <hr className="hr" />
                    <button type="button" className="btn btn-secondary" onClick={deleteTask} disabled={busy}>
                      {selectedIsParent ? 'Supprimer la phase et ses sous-tâches' : 'Supprimer la tâche'}
                    </button>
                  </div>
                </div>
              ) : (
                <table className="table table-compact">
                  <tbody>
                    <tr>
                      <th>Responsable</th>
                      <td>{ownerLabelOf(selected) ?? 'non renseigné'}</td>
                    </tr>
                    <tr>
                      <th>Période</th>
                      <td>
                        {formatDate(selected.startDate)} → {formatDate(selected.endDate)}
                      </td>
                    </tr>
                    <tr>
                      <th>Avancement</th>
                      <td style={{ color: progressColor(selectedProgress), fontWeight: 800 }}>{selectedProgress} %</td>
                    </tr>
                    <tr>
                      <th>Statut</th>
                      <td>{TASK_STATUS_LABEL[derivedStatus(selected, selectedProgress, selectedIsParent)]}</td>
                    </tr>
                    {selected.description ? (
                      <tr>
                        <th>Description</th>
                        <td style={{ whiteSpace: 'pre-wrap' }}>{selected.description}</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              )
            ) : null}

            {drawerTab === 'comments' ? (
              <div className="stack">
                {selected.comments?.length ? (
                  <ul className="gantt-tooltip-notes" style={{ marginTop: 0 }}>
                    {selected.comments.map((note) => (
                      <li key={note.id}>
                        <span>{note.body}</span>
                        <span className="muted small"> — {note.authorName}, {formatDateTime(note.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="small muted">Aucun commentaire sur cette tâche.</div>
                )}
                {canComment ? (
                  <>
                  <div className="field">
                    <label htmlFor="e-comment">Ajouter un commentaire</label>
                    <textarea className="input" id="e-comment" rows={4} value={comment} onChange={(e) => setComment(e.target.value)} />
                  </div>
                  <div>
                    <button type="button" className="btn btn-primary" onClick={postComment} disabled={busy || !comment.trim()}>
                      Publier le commentaire
                    </button>
                  </div>
                  </>
                ) : (
                  <div className="small muted">Profil en lecture seule : vous ne pouvez pas commenter.</div>
                )}
              </div>
            ) : null}

            {drawerTab === 'meetings' ? (
              <TaskMeetings
                key={selected.id}
                taskId={selected.id}
                taskName={selected.name}
                canWrite={canWriteMeetings}
                onCountChange={setMeetingCount}
              />
            ) : null}
          </div>
        </aside>
      ) : null}

      {editable ? (
        <div className="panel mt-24 no-print">
          <div className="panel-head">
            <h3 className="panel-title">Dépendances entre tâches</h3>
            <span className="small muted">{dependencies.length} lien(s)</span>
          </div>
          <div className="panel-body">
            <div className="form-grid">
              <div className="field">
                <label htmlFor="d-pred">Prédécesseur</label>
                <select className="input" id="d-pred" value={depDraft.predecessorId} onChange={(e) => setDepDraft({ ...depDraft, predecessorId: e.target.value })}>
                  <option value="">— Sélectionner —</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="d-succ">Successeur</label>
                <select className="input" id="d-succ" value={depDraft.successorId} onChange={(e) => setDepDraft({ ...depDraft, successorId: e.target.value })}>
                  <option value="">— Sélectionner —</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="d-lag">Décalage (jours)</label>
                <input className="input" id="d-lag" type="number" value={depDraft.lagDays} onChange={(e) => setDepDraft({ ...depDraft, lagDays: e.target.value })} />
              </div>
              <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button type="button" className="btn btn-primary" onClick={addDependency} disabled={busy}>
                  Ajouter le lien
                </button>
              </div>
            </div>

            {dependencies.length > 0 ? (
              <div className="table-wrap mt-16">
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th>Prédécesseur</th>
                      <th>Successeur</th>
                      <th>Type</th>
                      <th>Décalage</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {dependencies.map((dep) => (
                      <tr key={dep.id}>
                        <td>{tasks.find((t) => t.id === dep.predecessorId)?.name ?? '—'}</td>
                        <td>{tasks.find((t) => t.id === dep.successorId)?.name ?? '—'}</td>
                        <td className="small">{DEPENDENCY_TYPE_LABEL[dep.type]}</td>
                        <td className="small mono">{dep.lagDays} j</td>
                        <td className="text-right">
                          <button type="button" className="btn btn-ghost" onClick={() => removeDependency(dep.id)}>
                            Retirer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
