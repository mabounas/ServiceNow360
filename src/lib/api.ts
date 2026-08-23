import { NextResponse } from 'next/server';
import { HttpError } from './auth';

export function ok<T>(data: T, init?: number) {
  return NextResponse.json(data as object, { status: init ?? 200 });
}

export function fail(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/** Enveloppe commune : traduit HttpError en réponse et évite les 500 muets. */
export async function handle<T>(fn: () => Promise<T>): Promise<Response> {
  try {
    const result = await fn();
    if (result instanceof Response) return result;
    return NextResponse.json(result as object);
  } catch (error) {
    if (error instanceof HttpError) return fail(error.status, error.message);
    console.error(error);
    const message = error instanceof Error ? error.message : 'Erreur interne.';
    return fail(500, message);
  }
}

export function toCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]) {
  const escape = (value: unknown) => {
    if (value === null || value === undefined) return '';
    const text = String(value).replace(/"/g, '""');
    return /[";\n]/.test(text) ? `"${text}"` : text;
  };
  const header = columns.map((c) => escape(c.label)).join(';');
  const body = rows.map((row) => columns.map((c) => escape(row[c.key])).join(';'));
  // BOM UTF-8 pour qu'Excel ouvre correctement les accents.
  return `﻿${[header, ...body].join('\r\n')}`;
}

export function csvResponse(filename: string, content: string) {
  return new Response(content, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
