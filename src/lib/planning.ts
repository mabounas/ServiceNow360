import type { DependencyType, TaskStatus } from '@prisma/client';

export type PlanTask = {
  id: string;
  parentId: string | null;
  name: string;
  startDate: string;
  endDate: string;
  progress: number;
  status: TaskStatus;
  isMilestone: boolean;
  sortOrder: number;
  ownerName?: string | null;
  ownerId?: string | null;
  description?: string | null;
};

export type PlanDependency = {
  id: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagDays: number;
};

export const DAY_MS = 86_400_000;

export function dayDiff(a: string | Date, b: string | Date) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY_MS);
}

/** Durée en jours, jalon compris (un jalon dure 0 jour). */
export function durationDays(task: PlanTask) {
  return task.isMilestone ? 0 : Math.max(1, dayDiff(task.startDate, task.endDate) + 1);
}

/** Arbre WBS ordonné (phases > lots > tâches > sous-tâches). */
export function buildTree(tasks: PlanTask[]) {
  const byParent = new Map<string | null, PlanTask[]>();
  for (const task of tasks) {
    const key = task.parentId ?? null;
    const list = byParent.get(key) ?? [];
    list.push(task);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.startDate.localeCompare(b.startDate));
  }

  const flat: { task: PlanTask; depth: number; hasChildren: boolean }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const task of byParent.get(parentId) ?? []) {
      const children = byParent.get(task.id) ?? [];
      flat.push({ task, depth, hasChildren: children.length > 0 });
      walk(task.id, depth + 1);
    }
  };
  walk(null, 0);
  return flat;
}

/** Avancement consolidé d'un ensemble de tâches, pondéré par la durée. */
export function rollupProgress(tasks: PlanTask[]) {
  const leaves = tasks.filter((t) => !tasks.some((other) => other.parentId === t.id));
  const total = leaves.reduce((sum, t) => sum + Math.max(durationDays(t), 1), 0);
  if (total === 0) return 0;
  const done = leaves.reduce((sum, t) => sum + Math.max(durationDays(t), 1) * (t.progress / 100), 0);
  return Math.round((done / total) * 100);
}

/**
 * Chemin critique — méthode des potentiels sur les tâches feuilles.
 * Les dépendances non traitées explicitement (SS/FF/SF) sont ramenées au cas
 * fin → début, suffisant pour la mise en évidence visuelle demandée au §4.2.1.
 */
export function criticalPath(tasks: PlanTask[], deps: PlanDependency[]): Set<string> {
  const leaves = tasks.filter((t) => !tasks.some((o) => o.parentId === t.id));
  const ids = new Set(leaves.map((t) => t.id));
  const byId = new Map(leaves.map((t) => [t.id, t]));
  const edges = deps.filter((d) => ids.has(d.predecessorId) && ids.has(d.successorId));

  const successors = new Map<string, PlanDependency[]>();
  const predecessors = new Map<string, PlanDependency[]>();
  for (const dep of edges) {
    successors.set(dep.predecessorId, [...(successors.get(dep.predecessorId) ?? []), dep]);
    predecessors.set(dep.successorId, [...(predecessors.get(dep.successorId) ?? []), dep]);
  }

  // Tri topologique (Kahn) — en cas de cycle, on retombe sur un ensemble vide.
  const indegree = new Map<string, number>();
  for (const id of ids) indegree.set(id, (predecessors.get(id) ?? []).length);
  const queue = [...ids].filter((id) => (indegree.get(id) ?? 0) === 0);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const dep of successors.get(id) ?? []) {
      const next = (indegree.get(dep.successorId) ?? 0) - 1;
      indegree.set(dep.successorId, next);
      if (next === 0) queue.push(dep.successorId);
    }
  }
  if (order.length !== ids.size) return new Set();

  // Dates au plus tôt / au plus tard, exprimées en jours depuis l'origine du projet.
  const origin = Math.min(...leaves.map((t) => new Date(t.startDate).getTime()));
  const early = new Map<string, { start: number; finish: number }>();
  for (const id of order) {
    const task = byId.get(id)!;
    const own = Math.round((new Date(task.startDate).getTime() - origin) / DAY_MS);
    const fromDeps = (predecessors.get(id) ?? []).map(
      (dep) => (early.get(dep.predecessorId)?.finish ?? 0) + dep.lagDays,
    );
    const start = Math.max(own, ...fromDeps, 0);
    early.set(id, { start, finish: start + durationDays(task) });
  }

  const projectFinish = Math.max(...[...early.values()].map((e) => e.finish));
  const late = new Map<string, { start: number; finish: number }>();
  for (const id of [...order].reverse()) {
    const task = byId.get(id)!;
    const outgoing = successors.get(id) ?? [];
    const finish = outgoing.length
      ? Math.min(...outgoing.map((dep) => (late.get(dep.successorId)?.start ?? projectFinish) - dep.lagDays))
      : projectFinish;
    late.set(id, { finish, start: finish - durationDays(task) });
  }

  const critical = new Set<string>();
  for (const id of ids) {
    const slack = (late.get(id)?.start ?? 0) - (early.get(id)?.start ?? 0);
    if (slack <= 0) critical.add(id);
  }

  // Un parent est critique dès qu'une de ses feuilles l'est.
  const parentOf = new Map(tasks.map((t) => [t.id, t.parentId]));
  for (const id of [...critical]) {
    let parent = parentOf.get(id) ?? null;
    while (parent) {
      critical.add(parent);
      parent = parentOf.get(parent) ?? null;
    }
  }
  return critical;
}

/** Tâches en retard : échéance dépassée sans être terminées. */
export function lateTasks(tasks: PlanTask[], now = new Date()) {
  return tasks.filter(
    (t) => t.progress < 100 && t.status !== 'DONE' && new Date(t.endDate).getTime() < now.getTime(),
  );
}
