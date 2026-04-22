// scripts/metrics-show.ts
//
// Imprime una tabla ASCII con las últimas filas de `daily_stats` y un
// totalizador al final (§7.3, Paso 14). Va directo a la BD con Prisma
// (no al endpoint HTTP) — pensado para el operador con la shell ya en
// el servidor y `DATABASE_URL` apuntando a la Postgres de producción.
//
// Uso:
//   npm run metrics:show                # últimos 30 días
//   npm run metrics:show -- --days 7    # últimos 7 días
//   npm run metrics:show -- --days 90   # últimos 90 días
//
// Útil incluso con la tabla vacía: imprime cabecera y una línea
// "(sin datos)".

import { prisma } from '../src/lib/prisma';

interface Row {
  date: string;
  created: number;
  formSub: number;
  p1c: number;
  p2c: number;
  closed: number;
  abandoned: number;
  downloads: number;
  avgTurns: string;
  avgSecs: string;
  p50Secs: string;
  p95Secs: string;
  // Paso 15 — coste API y latencia Opus (la más relevante: el coach
  // es el gasto dominante).
  costUsd: string;
  costPerSession: string;
  latOpus: string;
}

function parseDaysArg(argv: string[]): number {
  const idx = argv.indexOf('--days');
  if (idx === -1 || idx === argv.length - 1) return 30;
  const raw = argv[idx + 1];
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 30;
  return n;
}

function formatUtcDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatNullable(n: number | null, digits = 0): string {
  if (n === null) return '—';
  return digits > 0 ? n.toFixed(digits) : String(Math.round(n));
}

function formatCost(n: number | null): string {
  if (n === null) return '—';
  // 4 decimales cuando < 1 USD para que el céntimo sea visible; 2 en
  // el resto.
  return n < 1 ? n.toFixed(4) : n.toFixed(2);
}

function padRight(s: string, w: number): string {
  if (s.length >= w) return s;
  return s + ' '.repeat(w - s.length);
}

function padLeft(s: string, w: number): string {
  if (s.length >= w) return s;
  return ' '.repeat(w - s.length) + s;
}

function printTable(rows: Row[]): void {
  const headers = [
    'fecha (UTC)',
    'creadas',
    'form',
    'p1c',
    'p2c',
    'cerr.',
    'aband.',
    'desc.',
    'turnos',
    'avg s',
    'p50 s',
    'p95 s',
    'coste $',
    'p/sesión $',
    'lat Opus ms',
  ];
  const widths = headers.map((h) => h.length);
  const rowCells = (r: Row) => [
    r.date,
    String(r.created),
    String(r.formSub),
    String(r.p1c),
    String(r.p2c),
    String(r.closed),
    String(r.abandoned),
    String(r.downloads),
    r.avgTurns,
    r.avgSecs,
    r.p50Secs,
    r.p95Secs,
    r.costUsd,
    r.costPerSession,
    r.latOpus,
  ];
  for (const r of rows) {
    const cells = rowCells(r);
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].length > widths[i]) widths[i] = cells[i].length;
    }
  }

  const line = (cells: string[]) =>
    cells
      .map((c, i) => (i === 0 ? padRight(c, widths[i]) : padLeft(c, widths[i])))
      .join('  ');

  console.log(line(headers));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const r of rows) {
    console.log(line(rowCells(r)));
  }
}

async function main(): Promise<void> {
  const days = parseDaysArg(process.argv);
  const to = new Date();
  to.setUTCHours(0, 0, 0, 0);
  const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

  const rows = await prisma.dailyStats.findMany({
    where: { date: { gte: from, lte: to } },
    orderBy: { date: 'asc' },
  });

  console.log(
    `daily_stats (${formatUtcDate(from)} .. ${formatUtcDate(to)} UTC, ${days} días)`,
  );
  console.log('');

  if (rows.length === 0) {
    console.log('  (sin datos)');
    console.log('');
    await prisma.$disconnect();
    return;
  }

  const formatted: Row[] = rows.map((r) => ({
    date: formatUtcDate(r.date),
    created: r.sessionsCreated,
    formSub: r.sessionsFormSubmitted,
    p1c: r.sessionsPhase1Completed,
    p2c: r.sessionsPhase2Completed,
    closed: r.sessionsClosed,
    abandoned: r.sessionsAbandoned,
    downloads: r.reportsDownloaded,
    avgTurns: formatNullable(r.avgPhase2Turns, 1),
    avgSecs: formatNullable(r.avgDurationSeconds),
    p50Secs: formatNullable(r.p50DurationSeconds),
    p95Secs: formatNullable(r.p95DurationSeconds),
    costUsd: formatCost(r.totalCostUsd),
    costPerSession: formatCost(r.avgCostUsdPerCompletedSession),
    latOpus: formatNullable(r.avgLatencyMsOpus),
  }));

  printTable(formatted);

  const totals = rows.reduce(
    (acc, r) => ({
      created: acc.created + r.sessionsCreated,
      formSub: acc.formSub + r.sessionsFormSubmitted,
      p1c: acc.p1c + r.sessionsPhase1Completed,
      p2c: acc.p2c + r.sessionsPhase2Completed,
      closed: acc.closed + r.sessionsClosed,
      abandoned: acc.abandoned + r.sessionsAbandoned,
      downloads: acc.downloads + r.reportsDownloaded,
      costUsd: acc.costUsd + (r.totalCostUsd ?? 0),
    }),
    {
      created: 0,
      formSub: 0,
      p1c: 0,
      p2c: 0,
      closed: 0,
      abandoned: 0,
      downloads: 0,
      costUsd: 0,
    },
  );

  const weightedCostPerSession =
    totals.p2c > 0 ? totals.costUsd / totals.p2c : null;

  console.log('');
  console.log(
    `Totales (${rows.length} días con datos): ` +
      `creadas=${totals.created}, form=${totals.formSub}, ` +
      `p1c=${totals.p1c}, p2c=${totals.p2c}, cerradas=${totals.closed}, ` +
      `abandonadas=${totals.abandoned}, descargas=${totals.downloads}, ` +
      `coste=$${formatCost(totals.costUsd)}, ` +
      `p/sesión=$${formatCost(weightedCostPerSession)}`,
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('metrics:show failed:', err);
  process.exit(1);
});
