import ExcelJS from 'exceljs';

/**
 * Lecture d'un planning projet au format « Gantt par semaines » :
 * une ligne par tâche, une colonne par semaine, la phase portée par la
 * première ligne de son groupe (colonne fusionnée dans Excel).
 *
 * Le fichier reste la source : rien n'est deviné en dehors de ce qu'il contient,
 * et tout écart est remonté en avertissement plutôt que corrigé en silence.
 */

export type ImportedTask = {
  name: string;
  ownerLabel: string | null;
  isMilestone: boolean;
  startWeek: number;
  endWeek: number;
  startDate: string;
  endDate: string;
};

export type ImportedPhase = {
  name: string;
  startWeek: number;
  endWeek: number;
  startDate: string;
  endDate: string;
  tasks: ImportedTask[];
};

export type ParsedPlan = {
  sheetName: string;
  weekCount: number;
  phases: ImportedPhase[];
  taskCount: number;
  milestoneCount: number;
  warnings: string[];
};

const DAY = 86_400_000;

const norm = (value: unknown) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Lecture sûre d'une cellule : ExcelJS lève une exception sur `.text` quand une
 * cellule fusionnée pointe vers une origine vide, ce qui est fréquent dans les
 * plannings où la colonne PHASE est fusionnée sur tout un groupe de lignes.
 */
function cellText(cell: ExcelJS.Cell): string {
  try {
    return norm(cell.text);
  } catch {
    const v = cell.value as unknown;
    if (v == null) return '';
    if (typeof v === 'object' && 'result' in (v as Record<string, unknown>)) {
      return norm((v as { result?: unknown }).result);
    }
    if (typeof v === 'object' && 'richText' in (v as Record<string, unknown>)) {
      return norm(((v as { richText?: { text?: string }[] }).richText ?? []).map((t) => t.text ?? '').join(''));
    }
    return norm(v as string);
  }
}

/** Enlève les accents pour comparer des en-têtes saisis librement. */
const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function hasFill(cell: ExcelJS.Cell) {
  const fill = cell.fill as ExcelJS.FillPattern | undefined;
  return Boolean(fill && fill.type === 'pattern' && fill.pattern !== 'none' && fill.fgColor);
}

/**
 * Semaines couvertes par une ligne.
 *
 * Le repère normal est le contenu de la cellule (▶, ◀, ◆, X…). Le remplissage
 * n'est retenu qu'à défaut, et seulement s'il ne couvre pas toute la ligne :
 * un fond uniforme est une mise en forme de tableau, pas une barre de Gantt.
 */
function markedWeeks(row: ExcelJS.Row, weekCols: number[]): number[] {
  const byText = weekCols
    .map((col, index) => (cellText(row.getCell(col)) ? index + 1 : 0))
    .filter((w) => w > 0);
  if (byText.length) return byText;

  const byFill = weekCols
    .map((col, index) => (hasFill(row.getCell(col)) ? index + 1 : 0))
    .filter((w) => w > 0);
  return byFill.length === weekCols.length ? [] : byFill;
}

function isoDay(monday: Date, offsetDays: number) {
  const d = new Date(monday.getTime() + offsetDays * DAY);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

/**
 * @param weekOneMonday lundi de la semaine 1 ; toutes les dates en découlent
 */
export async function parsePlanWorkbook(buffer: ArrayBuffer, weekOneMonday: Date): Promise<ParsedPlan> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  // On retient la feuille qui contient un en-tête « PHASE » + « TÂCHE ».
  let sheet: ExcelJS.Worksheet | undefined;
  let headerRow = 0;
  let cols = { phase: 0, task: 0, owner: 0, type: 0 };
  let weekCols: number[] = [];

  for (const ws of wb.worksheets) {
    for (let r = 1; r <= Math.min(ws.rowCount, 12); r += 1) {
      const row = ws.getRow(r);
      const found = { phase: 0, task: 0, owner: 0, type: 0 };
      const weeks: number[] = [];

      row.eachCell({ includeEmpty: false }, (cell, col) => {
        const text = fold(cellText(cell));
        if (!text) return;
        if (text === 'phase') found.phase = col;
        else if (text.startsWith('tache')) found.task = col;
        else if (text.startsWith('responsable')) found.owner = col;
        else if (text === 'type') found.type = col;
        else if (/^(s|sem|semaine)\s*\.?\s*\d+$/.test(text)) weeks.push(col);
      });

      if (found.phase && found.task && weeks.length >= 2) {
        sheet = ws;
        headerRow = r;
        cols = found;
        weekCols = weeks.sort((a, b) => a - b);
        break;
      }
    }
    if (sheet) break;
  }

  if (!sheet) {
    throw new Error(
      "Aucune feuille exploitable : il faut un en-tête contenant les colonnes « PHASE », « TÂCHE / LIVRABLE » et des colonnes de semaines (S1, S2… ou Sem 1, Sem 2…).",
    );
  }

  const warnings: string[] = [];
  const phases: ImportedPhase[] = [];
  let current: ImportedPhase | null = null;

  for (let r = headerRow + 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const phaseName = cellText(row.getCell(cols.phase));
    const taskName = cellText(row.getCell(cols.task));

    if (phaseName) {
      current = {
        name: phaseName,
        startWeek: 0,
        endWeek: 0,
        startDate: '',
        endDate: '',
        tasks: [],
      };
      phases.push(current);
    }

    if (!taskName) continue;
    if (!current) {
      warnings.push(`Ligne ${r} : « ${taskName} » ignorée, aucune phase ne la précède.`);
      continue;
    }

    const marked = markedWeeks(row, weekCols);

    let startWeek = marked[0];
    let endWeek = marked[marked.length - 1];
    if (!marked.length) {
      // Sans semaine cochée, la tâche est rattachée au début de sa phase et signalée.
      startWeek = current.tasks[0]?.startWeek ?? 1;
      endWeek = startWeek;
      warnings.push(
        `« ${taskName} » n'a aucune semaine cochée : placée en semaine ${startWeek}, à ajuster après import.`,
      );
    }

    const typeText = fold(cellText(row.getCell(cols.type)));
    const isMilestone = typeText.includes('jalon') || typeText.includes('milestone');
    const ownerLabel = cols.owner ? cellText(row.getCell(cols.owner)) || null : null;

    // Semaine N = jours (N-1)*7 à (N-1)*7+4 : du lundi au vendredi ouvré.
    const startDate = isoDay(weekOneMonday, (startWeek - 1) * 7);
    const endDate = isMilestone ? startDate : isoDay(weekOneMonday, (endWeek - 1) * 7 + 4);

    current.tasks.push({ name: taskName, ownerLabel, isMilestone, startWeek, endWeek, startDate, endDate });
  }

  // Une phase couvre l'amplitude de ses tâches.
  for (const phase of phases) {
    if (!phase.tasks.length) {
      warnings.push(`La phase « ${phase.name} » ne contient aucune tâche.`);
      phase.startWeek = 1;
      phase.endWeek = 1;
    } else {
      phase.startWeek = Math.min(...phase.tasks.map((t) => t.startWeek));
      phase.endWeek = Math.max(...phase.tasks.map((t) => t.endWeek));
    }
    phase.startDate = isoDay(weekOneMonday, (phase.startWeek - 1) * 7);
    phase.endDate = isoDay(weekOneMonday, (phase.endWeek - 1) * 7 + 4);
  }

  const taskCount = phases.reduce((n, p) => n + p.tasks.filter((t) => !t.isMilestone).length, 0);
  const milestoneCount = phases.reduce((n, p) => n + p.tasks.filter((t) => t.isMilestone).length, 0);

  if (!phases.length) throw new Error('Aucune phase trouvée dans la feuille.');

  return {
    sheetName: sheet.name,
    weekCount: weekCols.length,
    phases,
    taskCount,
    milestoneCount,
    warnings,
  };
}
