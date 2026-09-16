'use client';

import { useMemo, useRef, useState } from 'react';
import {
  DAY_MS,
  buildTree,
  computeProgress,
  criticalPath,
  durationDays,
  ownerLabelOf,
  type PlanDependency,
  type PlanTask,
} from '@/lib/planning';

export type Zoom = 'day' | 'week' | 'month';

/**
 * Palette littérale (et non des variables CSS) : le SVG doit rester lisible
 * une fois sérialisé pour l'export PNG, où les variables ne sont plus résolues.
 */
const COLORS = {
  bg: '#f3f2f2',
  surface: '#eae9e9',
  text: '#201e1d',
  grid: '#cfcbcb',
  gridStrong: '#9b9797',
  accent: '#ec3013',
  accentDark: '#ae1800',
  today: '#ec3013',
  baseline: '#bab6b6',
  // Avancement : vert une fois terminé, orange tant qu'il reste du travail.
  done: '#1f9d55',
  todo: '#f28c28',
  todoTrack: '#fde2c6',
};

/** Couleur d'un élément selon son avancement (100 % → vert, sinon orange). */
export function progressColor(progress: number) {
  return progress >= 100 ? COLORS.done : COLORS.todo;
}

const PX_PER_DAY: Record<Zoom, number> = { day: 34, week: 11, month: 3.6 };
const ROW_H = 34;
const HEAD_H = 56;

function startOfDay(value: string | Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export type GanttHandle = { exportPng: () => void };

export default function GanttChart({
  tasks,
  dependencies,
  baseline,
  zoom,
  selectedId,
  editable,
  onSelect,
  onMove,
  onHover,
  svgRef,
}: {
  tasks: PlanTask[];
  dependencies: PlanDependency[];
  baseline?: Record<string, { startDate: string; endDate: string }>;
  zoom: Zoom;
  selectedId: string | null;
  editable: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, startDate: string, endDate: string) => void;
  /** Survol d'une barre : coordonnées écran pour positionner l'info-bulle, `null` à la sortie. */
  onHover?: (hover: { id: string; x: number; y: number } | null) => void;
  svgRef?: React.RefObject<SVGSVGElement | null>;
}) {
  const rows = useMemo(() => buildTree(tasks), [tasks]);
  const critical = useMemo(() => criticalPath(tasks, dependencies), [tasks, dependencies]);
  const progressOf = useMemo(() => computeProgress(tasks), [tasks]);
  const [drag, setDrag] = useState<{ id: string; mode: 'move' | 'resize'; startX: number; deltaDays: number } | null>(null);
  const localRef = useRef<SVGSVGElement | null>(null);
  const ref = svgRef ?? localRef;

  const pxPerDay = PX_PER_DAY[zoom];

  const { origin, totalDays } = useMemo(() => {
    if (tasks.length === 0) {
      const today = startOfDay(new Date());
      return { origin: addDays(today, -7), totalDays: 60 };
    }
    const min = Math.min(...tasks.map((t) => startOfDay(t.startDate).getTime()));
    const max = Math.max(...tasks.map((t) => startOfDay(t.endDate).getTime()));
    const start = addDays(new Date(min), -3);
    const days = Math.max(30, Math.round((max - min) / DAY_MS) + 10);
    return { origin: start, totalDays: days };
  }, [tasks]);

  const width = Math.max(720, totalDays * pxPerDay);
  const height = HEAD_H + rows.length * ROW_H + 8;

  const xOf = (value: string | Date) => (startOfDay(value).getTime() - origin.getTime()) / DAY_MS * pxPerDay;
  const rowIndex = new Map(rows.map((r, index) => [r.task.id, index]));
  const yOf = (id: string) => HEAD_H + (rowIndex.get(id) ?? 0) * ROW_H;

  // Graduations de l'échelle de temps.
  const ticks: { x: number; label: string; strong: boolean }[] = [];
  for (let day = 0; day <= totalDays; day += 1) {
    const date = addDays(origin, day);
    const x = day * pxPerDay;
    if (zoom === 'day') {
      ticks.push({ x, label: String(date.getDate()), strong: date.getDay() === 1 });
    } else if (zoom === 'week') {
      if (date.getDay() === 1) ticks.push({ x, label: `${date.getDate()}/${date.getMonth() + 1}`, strong: date.getDate() <= 7 });
    } else if (date.getDate() === 1) {
      ticks.push({ x, label: `${MONTHS[date.getMonth()]} ${String(date.getFullYear()).slice(2)}`, strong: true });
    }
  }

  const monthBands: { x: number; label: string }[] = [];
  for (let day = 0; day <= totalDays; day += 1) {
    const date = addDays(origin, day);
    if (date.getDate() === 1 || day === 0) {
      monthBands.push({ x: day * pxPerDay, label: `${MONTHS[date.getMonth()]} ${date.getFullYear()}` });
    }
  }

  const todayX = xOf(new Date());

  function onPointerDown(event: React.PointerEvent, task: PlanTask, mode: 'move' | 'resize') {
    if (!editable) return;
    event.stopPropagation();
    (event.target as Element).setPointerCapture(event.pointerId);
    setDrag({ id: task.id, mode, startX: event.clientX, deltaDays: 0 });
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!drag) return;
    const deltaDays = Math.round((event.clientX - drag.startX) / pxPerDay);
    if (deltaDays !== drag.deltaDays) setDrag({ ...drag, deltaDays });
  }

  function onPointerUp() {
    if (!drag) return;
    const task = tasks.find((t) => t.id === drag.id);
    if (task && drag.deltaDays !== 0) {
      const start = startOfDay(task.startDate);
      const end = startOfDay(task.endDate);
      if (drag.mode === 'move') {
        onMove(task.id, addDays(start, drag.deltaDays).toISOString(), addDays(end, drag.deltaDays).toISOString());
      } else {
        const newEnd = addDays(end, drag.deltaDays);
        if (newEnd >= start) onMove(task.id, start.toISOString(), newEnd.toISOString());
      }
    }
    setDrag(null);
  }

  const dragOffset = (id: string, edge: 'start' | 'end') => {
    if (!drag || drag.id !== id) return 0;
    if (drag.mode === 'move') return drag.deltaDays * pxPerDay;
    return edge === 'end' ? drag.deltaDays * pxPerDay : 0;
  };

  return (
    <svg
      ref={ref}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', background: COLORS.bg, touchAction: 'none' }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <rect x={0} y={0} width={width} height={height} fill={COLORS.bg} />

      {/* bandeau des mois */}
      <rect x={0} y={0} width={width} height={HEAD_H} fill={COLORS.surface} />
      {monthBands.map((band, index) => (
        <g key={`m-${index}`}>
          <line x1={band.x} y1={0} x2={band.x} y2={height} stroke={COLORS.gridStrong} strokeWidth={1} />
          <text x={band.x + 6} y={20} fontSize={11} fontFamily="Archivo, system-ui, sans-serif" fontWeight={800} fill={COLORS.text}>
            {band.label}
          </text>
        </g>
      ))}

      {/* graduations */}
      {ticks.map((tick, index) => (
        <g key={`t-${index}`}>
          <line
            x1={tick.x}
            y1={HEAD_H - 18}
            x2={tick.x}
            y2={height}
            stroke={tick.strong ? COLORS.gridStrong : COLORS.grid}
            strokeWidth={1}
          />
          {zoom !== 'month' ? (
            <text x={tick.x + 3} y={HEAD_H - 6} fontSize={9} fontFamily="Archivo, system-ui, sans-serif" fill={COLORS.text} opacity={0.7}>
              {tick.label}
            </text>
          ) : null}
        </g>
      ))}

      <line x1={0} y1={HEAD_H} x2={width} y2={HEAD_H} stroke={COLORS.text} strokeWidth={2} />

      {/* lignes de séparation des tâches */}
      {rows.map((row, index) => (
        <line
          key={`r-${row.task.id}`}
          x1={0}
          y1={HEAD_H + (index + 1) * ROW_H}
          x2={width}
          y2={HEAD_H + (index + 1) * ROW_H}
          stroke={COLORS.grid}
          strokeWidth={1}
        />
      ))}

      {/* aujourd'hui */}
      {todayX >= 0 && todayX <= width ? (
        <g>
          <line x1={todayX} y1={HEAD_H - 18} x2={todayX} y2={height} stroke={COLORS.today} strokeWidth={2} />
          <text x={todayX + 4} y={HEAD_H - 22} fontSize={9} fontFamily="Archivo, system-ui, sans-serif" fontWeight={800} fill={COLORS.today}>
            AUJOURD&apos;HUI
          </text>
        </g>
      ) : null}

      {/* dépendances */}
      {dependencies.map((dep) => {
        const from = tasks.find((t) => t.id === dep.predecessorId);
        const to = tasks.find((t) => t.id === dep.successorId);
        if (!from || !to || !rowIndex.has(from.id) || !rowIndex.has(to.id)) return null;
        const x1 = xOf(from.endDate) + (from.isMilestone ? 0 : pxPerDay) + dragOffset(from.id, 'end');
        const y1 = yOf(from.id) + ROW_H / 2;
        const x2 = xOf(to.startDate) + dragOffset(to.id, 'start');
        const y2 = yOf(to.id) + ROW_H / 2;
        const mid = Math.max(x1 + 8, x2 - 12);
        return (
          <g key={dep.id} stroke={COLORS.accentDark} strokeWidth={1.2} fill="none">
            <path d={`M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`} />
            <path d={`M ${x2} ${y2} l -5 -3.5 v 7 z`} fill={COLORS.accentDark} stroke="none" />
          </g>
        );
      })}

      {/* barres */}
      {rows.map(({ task, hasChildren }) => {
        const y = yOf(task.id);
        const isCritical = critical.has(task.id);
        const offsetStart = dragOffset(task.id, 'start');
        const offsetEnd = dragOffset(task.id, 'end');
        const x = xOf(task.startDate) + offsetStart;
        const barWidth = Math.max(pxPerDay * 0.6, durationDays(task) * pxPerDay + offsetEnd - offsetStart);
        const base = baseline?.[task.id];
        const progress = progressOf.get(task.id) ?? 0;
        const done = progress >= 100;
        const notes = task.comments?.length ?? 0;
        const owner = ownerLabelOf(task);
        const ownerText = owner ? ` · ${owner.label}` : '';
        const hover = {
          onPointerEnter: (e: React.PointerEvent) => onHover?.({ id: task.id, x: e.clientX, y: e.clientY }),
          onPointerMove: (e: React.PointerEvent) => onHover?.({ id: task.id, x: e.clientX, y: e.clientY }),
          onPointerLeave: () => onHover?.(null),
        };

        if (task.isMilestone) {
          const cx = x;
          const cy = y + ROW_H / 2;
          const size = 8;
          return (
            <g
              key={task.id}
              {...hover}
              onPointerDown={(e) => onPointerDown(e, task, 'move')}
              onClick={() => onSelect(task.id)}
              style={{ cursor: editable ? 'grab' : 'pointer' }}
            >
              <polygon
                points={`${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`}
                fill={progressColor(progress)}
                stroke={selectedId === task.id ? COLORS.accentDark : 'none'}
                strokeWidth={2}
              />
              <text x={cx + size + 6} y={cy + 4} fontSize={11} fontFamily="Archivo, system-ui, sans-serif" fill={COLORS.text}>
                {task.name}
                {ownerText}
                {notes ? ` · ${notes} commentaire${notes > 1 ? 's' : ''}` : ''}
              </text>
            </g>
          );
        }

        const barY = y + (hasChildren ? 11 : 8);
        const barH = hasChildren ? 12 : 16;

        return (
          <g key={task.id} {...hover} onClick={() => onSelect(task.id)}>
            {base ? (
              <rect
                x={xOf(base.startDate)}
                y={y + ROW_H - 9}
                width={Math.max(2, ((startOfDay(base.endDate).getTime() - startOfDay(base.startDate).getTime()) / DAY_MS + 1) * pxPerDay)}
                height={4}
                fill={COLORS.baseline}
              />
            ) : null}

            {/* Piste : verte si terminé, orange pâle sinon, remplie en orange au prorata. */}
            <rect
              x={x}
              y={barY}
              width={barWidth}
              height={barH}
              fill={done ? COLORS.done : COLORS.todoTrack}
              stroke={isCritical ? COLORS.accentDark : selectedId === task.id ? COLORS.text : 'none'}
              strokeWidth={2}
              onPointerDown={hasChildren ? undefined : (e) => onPointerDown(e, task, 'move')}
              style={{ cursor: editable && !hasChildren ? 'grab' : 'pointer' }}
            />
            {!done && progress > 0 ? (
              <rect
                x={x}
                y={barY}
                width={(barWidth * progress) / 100}
                height={barH}
                fill={COLORS.todo}
                pointerEvents="none"
              />
            ) : null}

            {editable && !hasChildren ? (
              <rect
                x={x + barWidth - 5}
                y={y + 8}
                width={6}
                height={16}
                fill="transparent"
                onPointerDown={(e) => onPointerDown(e, task, 'resize')}
                style={{ cursor: 'ew-resize' }}
              />
            ) : null}

            <text
              x={x + barWidth + 6}
              y={y + 21}
              fontSize={11}
              fontFamily="Archivo, system-ui, sans-serif"
              fontWeight={hasChildren ? 800 : 400}
              fill={done ? COLORS.done : COLORS.text}
            >
              {progress}%
              {owner ? (
                <tspan fill={COLORS.text} fontWeight={600} fontStyle={owner.fromSource ? 'italic' : 'normal'}>
                  {ownerText}
                </tspan>
              ) : null}
              {notes ? ` · ${notes} commentaire${notes > 1 ? 's' : ''}` : ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
