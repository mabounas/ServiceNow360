import type { Prisma } from '@prisma/client';
import { HttpError } from './auth';
import type { EffectiveRole } from './workflow';

/**
 * Procès-verbaux des réunions de suivi d'une tâche.
 *
 * Lecture : tout membre du projet. Rédaction, modification et archivage :
 * chef de projet et administrateur, comme pour le planning (§4.2.4).
 * Un PV ne se supprime pas : il s'archive, et peut être restauré.
 */

export const MEETING_FILE_MAX = 4 * 1024 * 1024;
export const MEETING_FILES_TOTAL_MAX = 12 * 1024 * 1024;

export function canWriteMeetings(role: EffectiveRole) {
  return role === 'ADMIN' || role === 'PROJECT_MANAGER';
}

export const MEETING_INCLUDE = {
  createdBy: { select: { firstName: true, lastName: true } },
  archivedBy: { select: { firstName: true, lastName: true } },
  files: { select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true } },
  task: { select: { id: true, name: true } },
} satisfies Prisma.MeetingMinuteInclude;

type IncomingFile = { fileName: string; mimeType: string; size: number; data: string };

const text = (value: unknown, max = 20_000) => {
  const v = String(value ?? '').trim();
  if (v.length > max) throw new HttpError(400, 'Un des champs dépasse la longueur autorisée.');
  return v || null;
};

const date = (value: unknown, label: string, required: boolean) => {
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpError(400, `${label} est obligatoire.`);
    return null;
  }
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `${label} est invalide.`);
  return d;
};

/** Champs éditables d'un PV ; `partial` pour une modification. */
export function readMeetingFields(body: Record<string, unknown>, partial: boolean) {
  const out: Record<string, unknown> = {};
  const has = (key: string) => !partial || key in body;

  if (has('title')) {
    const title = text(body.title, 200);
    if (!title) throw new HttpError(400, 'Le titre du PV est obligatoire.');
    out.title = title;
  }
  if (has('meetingDate')) out.meetingDate = date(body.meetingDate, 'La date de la réunion', true);
  if (has('content')) {
    const content = text(body.content);
    if (!content) throw new HttpError(400, 'Le compte rendu est obligatoire.');
    out.content = content;
  }
  for (const key of ['location', 'participants', 'agenda', 'decisions', 'actions'] as const) {
    if (has(key)) out[key] = text(body[key], key === 'location' ? 300 : 20_000);
  }
  if (has('nextMeeting')) out.nextMeeting = date(body.nextMeeting, 'La date de la prochaine réunion', false);
  return out;
}

/** Contrôle des pièces jointes transmises en data URL. */
export function readMeetingFiles(value: unknown): IncomingFile[] {
  if (!Array.isArray(value) || value.length === 0) return [];
  let total = 0;
  const files = value.map((raw) => {
    const f = raw as Partial<IncomingFile>;
    const fileName = String(f.fileName ?? '').trim().slice(0, 200);
    const data = String(f.data ?? '');
    const size = Number(f.size ?? 0);
    if (!fileName || !data.startsWith('data:')) throw new HttpError(400, 'Pièce jointe illisible.');
    if (size > MEETING_FILE_MAX) throw new HttpError(400, `« ${fileName} » dépasse 4 Mo.`);
    total += size;
    return { fileName, mimeType: String(f.mimeType || 'application/octet-stream').slice(0, 120), size, data };
  });
  if (total > MEETING_FILES_TOTAL_MAX) throw new HttpError(400, 'Les pièces jointes dépassent 12 Mo au total.');
  return files;
}

/** Filtre d'archivage : `active` (défaut), `archived` ou `all`. */
export function archiveFilter(value: string | null): Prisma.MeetingMinuteWhereInput {
  if (value === 'all') return {};
  if (value === 'archived') return { archived: true };
  return { archived: false };
}
