import type { NextRequest } from 'next/server';

import { requireSessionCreateSecret } from '@/lib/api/auth';
import { jsonError, jsonOk } from '@/lib/api/response';
import { prisma } from '@/lib/prisma';

// GET /api/dev/stats
// Endpoint interno del operador (§7.3, Paso 14). Expone las filas de
// `daily_stats` ya agregadas por el cron nocturno. No calcula nada:
// sólo lee y devuelve. Todo lo que sale por aquí está ya libre de PII
// por construcción.
//
// Query params:
//   - `from=YYYY-MM-DD` (opcional) inclusivo, UTC.
//   - `to=YYYY-MM-DD`   (opcional) inclusivo, UTC.
//   Por defecto: últimos 30 días (to = hoy-UTC, from = to-29d).
//
// Auth: mismo header `X-Session-Create-Secret` que los otros
// endpoints `/api/dev/*`. Sin frontend público.

interface DailyStatsRow {
  date: string;
  sessionsCreated: number;
  sessionsFormSubmitted: number;
  sessionsPhase1Completed: number;
  sessionsPhase2Completed: number;
  sessionsClosed: number;
  sessionsAbandoned: number;
  reportsDownloaded: number;
  avgPhase2Turns: number | null;
  avgDurationSeconds: number | null;
  p50DurationSeconds: number | null;
  p95DurationSeconds: number | null;
}

interface Totals {
  days: number;
  sessionsCreated: number;
  sessionsFormSubmitted: number;
  sessionsPhase1Completed: number;
  sessionsPhase2Completed: number;
  sessionsClosed: number;
  sessionsAbandoned: number;
  reportsDownloaded: number;
}

interface StatsResponse {
  from: string;
  to: string;
  rows: DailyStatsRow[];
  totals: Totals;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDateParam(raw: string | null): Date | null {
  if (raw === null) return null;
  if (!DATE_RE.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function formatUtcDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function GET(req: NextRequest) {
  const unauthorized = requireSessionCreateSecret(req);
  if (unauthorized) return unauthorized;

  const fromRaw = req.nextUrl.searchParams.get('from');
  const toRaw = req.nextUrl.searchParams.get('to');

  if (fromRaw !== null && !DATE_RE.test(fromRaw)) {
    return jsonError('INVALID_INPUT', 'Param `from` inválido (YYYY-MM-DD).', 400);
  }
  if (toRaw !== null && !DATE_RE.test(toRaw)) {
    return jsonError('INVALID_INPUT', 'Param `to` inválido (YYYY-MM-DD).', 400);
  }

  const to = parseDateParam(toRaw) ?? todayUtc();
  const defaultFrom = new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
  const from = parseDateParam(fromRaw) ?? defaultFrom;

  if (from > to) {
    return jsonError('INVALID_INPUT', '`from` es posterior a `to`.', 400);
  }

  const rows = await prisma.dailyStats.findMany({
    where: { date: { gte: from, lte: to } },
    orderBy: { date: 'asc' },
  });

  const formatted: DailyStatsRow[] = rows.map((r) => ({
    date: formatUtcDate(r.date),
    sessionsCreated: r.sessionsCreated,
    sessionsFormSubmitted: r.sessionsFormSubmitted,
    sessionsPhase1Completed: r.sessionsPhase1Completed,
    sessionsPhase2Completed: r.sessionsPhase2Completed,
    sessionsClosed: r.sessionsClosed,
    sessionsAbandoned: r.sessionsAbandoned,
    reportsDownloaded: r.reportsDownloaded,
    avgPhase2Turns: r.avgPhase2Turns,
    avgDurationSeconds: r.avgDurationSeconds,
    p50DurationSeconds: r.p50DurationSeconds,
    p95DurationSeconds: r.p95DurationSeconds,
  }));

  const totals: Totals = {
    days: formatted.length,
    sessionsCreated: sum(formatted, 'sessionsCreated'),
    sessionsFormSubmitted: sum(formatted, 'sessionsFormSubmitted'),
    sessionsPhase1Completed: sum(formatted, 'sessionsPhase1Completed'),
    sessionsPhase2Completed: sum(formatted, 'sessionsPhase2Completed'),
    sessionsClosed: sum(formatted, 'sessionsClosed'),
    sessionsAbandoned: sum(formatted, 'sessionsAbandoned'),
    reportsDownloaded: sum(formatted, 'reportsDownloaded'),
  };

  const response: StatsResponse = {
    from: formatUtcDate(from),
    to: formatUtcDate(to),
    rows: formatted,
    totals,
  };
  return jsonOk(response);
}

type Countable =
  | 'sessionsCreated'
  | 'sessionsFormSubmitted'
  | 'sessionsPhase1Completed'
  | 'sessionsPhase2Completed'
  | 'sessionsClosed'
  | 'sessionsAbandoned'
  | 'reportsDownloaded';

function sum(rows: DailyStatsRow[], key: Countable): number {
  let n = 0;
  for (const row of rows) n += row[key];
  return n;
}
