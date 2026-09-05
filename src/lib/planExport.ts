import ExcelJS from 'exceljs';
import { TASK_STATUS_LABEL, formatDate } from './labels';
import type { TaskStatus } from '@prisma/client';

/**
 * Export du planning au format « Gantt par semaines ».
 *
 * Le classeur produit reprend exactement la structure attendue par l'import
 * (`planImport.ts`) : l'aller-retour Excel → portail → Excel est donc possible,
 * ce qui permet de retravailler un planning hors ligne puis de le recharger.
 */

export type ExportTask = {
  id: string;
  parentId: string | null;
  name: string;
  description: string | null;
  ownerName: string | null;
  startDate: Date;
  endDate: Date;
  progress: number;
  status: TaskStatus;
  isMilestone: boolean;
  sortOrder: number;
};

const DAY = 86_400_000;

const ACCENT = 'FFEC3013';
const INK = 'FF201E1D';
const SURFACE = 'FFEAE9E9';
const LIGHT = 'FFF3F2F2';

/** Lundi de la semaine contenant la date. */
function mondayOf(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** Le libellé du responsable est reporté dans la description à l'import ; on sait le relire. */
function ownerLabel(task: ExportTask) {
  if (task.ownerName) return task.ownerName;
  const match = task.description?.match(/Responsable au planning source\s*:\s*(.+)/i);
  return match ? match[1].trim() : '';
}

export async function buildPlanWorkbook(
  project: { code: string; name: string; clientName: string },
  tasks: ExportTask[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ServiceDesk360';
  wb.created = new Date();

  const ws = wb.addWorksheet('Planning Gantt', {
    views: [{ state: 'frozen', xSplit: 5, ySplit: 2 }],
  });

  const roots = tasks.filter((t) => !t.parentId).sort((a, b) => a.sortOrder - b.sortOrder);
  const childrenOf = (id: string) => tasks.filter((t) => t.parentId === id).sort((a, b) => a.sortOrder - b.sortOrder);

  // Échelle de temps : de la première à la dernière date du planning.
  const allDates = tasks.flatMap((t) => [t.startDate, t.endDate]);
  const origin = allDates.length ? mondayOf(new Date(Math.min(...allDates.map((d) => d.getTime())))) : mondayOf(new Date());
  const last = allDates.length ? new Date(Math.max(...allDates.map((d) => d.getTime()))) : new Date();
  const weekCount = Math.max(1, Math.ceil((last.getTime() - origin.getTime()) / (7 * DAY)) + 1);
  const weekOf = (date: Date) => Math.floor((mondayOf(date).getTime() - origin.getTime()) / (7 * DAY)) + 1;

  const FIXED = ['#', 'PHASE', 'TÂCHE / LIVRABLE', 'RESPONSABLE', 'TYPE', 'DÉBUT', 'FIN', 'AVANCEMENT', 'STATUT'];
  const weekStart = FIXED.length + 1;

  // ── Ligne 1 : titre + repères de semaine ──────────────────────────────────
  const title = ws.getRow(1);
  title.getCell(1).value = `${project.code} — ${project.name} (${project.clientName})`;
  ws.mergeCells(1, 1, 1, FIXED.length);
  title.getCell(1).font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  title.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
  title.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  for (let w = 1; w <= weekCount; w += 1) {
    const cell = title.getCell(weekStart + w - 1);
    cell.value = `S${w}`;
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    cell.alignment = { horizontal: 'center' };
  }
  title.height = 24;

  // ── Ligne 2 : en-têtes lus par l'import ───────────────────────────────────
  const header = ws.getRow(2);
  FIXED.forEach((label, i) => {
    const cell = header.getCell(i + 1);
    cell.value = label;
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  for (let w = 1; w <= weekCount; w += 1) {
    const monday = new Date(origin.getTime() + (w - 1) * 7 * DAY);
    const cell = header.getCell(weekStart + w - 1);
    cell.value = `Sem ${w}`;
    cell.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } };
    cell.alignment = { horizontal: 'center' };
    cell.note = `Semaine du ${formatDate(monday)}`;
  }
  header.height = 20;

  // ── Lignes de données ─────────────────────────────────────────────────────
  let rowIndex = 3;
  let counter = 0;

  const writeRow = (task: ExportTask, phaseName: string | null, isPhase: boolean) => {
    const row = ws.getRow(rowIndex);
    if (!isPhase && !task.isMilestone) counter += 1;

    row.getCell(1).value = isPhase || task.isMilestone ? '' : counter;
    row.getCell(2).value = phaseName ?? '';
    row.getCell(3).value = task.name;
    row.getCell(4).value = ownerLabel(task);
    row.getCell(5).value = task.isMilestone ? 'Jalon' : 'Tâche';
    row.getCell(6).value = formatDate(task.startDate);
    row.getCell(7).value = formatDate(task.endDate);
    row.getCell(8).value = task.progress / 100;
    row.getCell(8).numFmt = '0 %';
    row.getCell(9).value = TASK_STATUS_LABEL[task.status];

    for (let c = 1; c <= FIXED.length; c += 1) {
      const cell = row.getCell(c);
      cell.font = { name: 'Arial', size: 9, bold: isPhase };
      cell.alignment = { vertical: 'middle', horizontal: c >= 6 ? 'center' : 'left', wrapText: false };
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFBAB6B6' } } };
      if (isPhase) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SURFACE } };
    }

    // Barre de Gantt : un marqueur par semaine couverte, relu tel quel à l'import.
    const from = weekOf(task.startDate);
    const to = task.isMilestone ? from : weekOf(task.endDate);
    for (let w = 1; w <= weekCount; w += 1) {
      const cell = row.getCell(weekStart + w - 1);
      const inside = w >= from && w <= to;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.font = { name: 'Arial', size: 8, color: { argb: 'FFFFFFFF' } };
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFBAB6B6' } } };
      if (inside) {
        cell.value = task.isMilestone ? '◆' : '■';
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: task.isMilestone ? INK : isPhase ? INK : ACCENT },
        };
      } else {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
      }
    }

    row.height = 17;
    rowIndex += 1;
  };

  for (const phase of roots) {
    const children = childrenOf(phase.id);
    if (children.length === 0) {
      // Tâche isolée à la racine : elle devient sa propre phase.
      writeRow(phase, phase.name, true);
      continue;
    }
    children.forEach((child, i) => writeRow(child, i === 0 ? phase.name : '', false));
  }

  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 28;
  ws.getColumn(3).width = 46;
  ws.getColumn(4).width = 26;
  ws.getColumn(5).width = 10;
  ws.getColumn(6).width = 12;
  ws.getColumn(7).width = 12;
  ws.getColumn(8).width = 12;
  ws.getColumn(9).width = 16;
  for (let w = 1; w <= weekCount; w += 1) ws.getColumn(weekStart + w - 1).width = 5;

  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: Math.max(2, rowIndex - 1), column: FIXED.length } };

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
