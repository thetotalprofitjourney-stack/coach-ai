// Recolector de métricas diarias agregadas (§7.3, Paso 14).
//
// Corre desde el cron nocturno, ANTES del borrado (§6.3), mientras las
// filas de sesiones, turnos e informes todavía existen. Escribe una fila
// en `daily_stats` indexada por fecha UTC. Idempotente vía upsert: si
// la misma fecha se recolecta dos veces, la segunda pisa la primera con
// los mismos números.
//
// Particiona por DATE(created_at) en UTC para el bucket "sesiones de
// ese día". `sessions_closed` y `reports_downloaded` se cuentan por
// DATE(closed_at)/DATE(downloaded_at) — son eventos, no atributos de
// la sesión. Coherente con §7.3 "sesiones completadas" y "tasa de
// descarga de informe" como métricas del día en que ocurrieron.
//
// No persiste PII. Todas las queries agregan con count/avg/percentile;
// ningún campo textual ni identificador de sesión sale de este módulo.

import { prisma } from '@/lib/prisma';

const ABANDONED_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface DailyStatsReport {
  event: 'daily_stats_collected';
  timestamp: string;
  durationMs: number;
  date: string; // YYYY-MM-DD (UTC)
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

export interface CollectDailyStatsOptions {
  date: Date;
  now?: Date;
}

// Trunca a medianoche UTC. El argumento puede ser cualquier Date dentro
// del día objetivo (típicamente `new Date()` menos 24h por el cron).
export function startOfUtcDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function formatUtcDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface DurationStatsRow {
  avg_seconds: number | null;
  p50_seconds: number | null;
  p95_seconds: number | null;
}

interface Phase2TurnsRow {
  avg_turns: number | null;
}

export async function collectDailyStats(
  options: CollectDailyStatsOptions,
): Promise<DailyStatsReport> {
  const startedAt = Date.now();
  const dayStart = startOfUtcDay(options.date);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const now = options.now ?? new Date();
  const abandonedThreshold = new Date(now.getTime() - ABANDONED_WINDOW_MS);

  // Contadores simples con groupBy por status sobre las sesiones
  // creadas en el día objetivo. Un solo round-trip a la DB.
  const createdInDay = await prisma.session.groupBy({
    by: ['status'],
    where: { createdAt: { gte: dayStart, lt: dayEnd } },
    _count: { _all: true },
  });

  let sessionsCreated = 0;
  let sessionsFormSubmitted = 0;
  let sessionsPhase1Completed = 0;
  let sessionsPhase2Completed = 0;
  for (const row of createdInDay) {
    const count = row._count._all;
    sessionsCreated += count;
    if (row.status !== 'created') sessionsFormSubmitted += count;
    if (
      row.status === 'phase1_completed' ||
      row.status === 'phase2_in_progress' ||
      row.status === 'phase2_completed' ||
      row.status === 'closed'
    ) {
      sessionsPhase1Completed += count;
    }
    if (row.status === 'phase2_completed' || row.status === 'closed') {
      sessionsPhase2Completed += count;
    }
  }

  // Abandonadas: creadas en el día, status != closed y con ≥24h desde
  // creación. Misma definición que el cleanup (§6.3). Cuando el cron
  // recolecta ayer-UTC a las 02:00 UTC, el umbral de abandono cae
  // dentro del día objetivo: sólo las sesiones de [dayStart,
  // abandonedThreshold) han tenido 24h para cerrarse.
  const abandonedUpperBound =
    abandonedThreshold < dayEnd ? abandonedThreshold : dayEnd;
  const sessionsAbandoned =
    abandonedUpperBound > dayStart
      ? await prisma.session.count({
          where: {
            createdAt: { gte: dayStart, lt: abandonedUpperBound },
            status: { not: 'closed' },
          },
        })
      : 0;

  // Cerradas: particionadas por DATE(closed_at), no por created_at.
  // Una sesión creada el 20 y cerrada a las 00:10 UTC del 21 cuenta
  // como cierre del 21.
  const sessionsClosed = await prisma.session.count({
    where: { closedAt: { gte: dayStart, lt: dayEnd } },
  });

  // Descargas del informe: primera descarga por sesión (downloadedAt
  // es idempotente por diseño).
  const reportsDownloaded = await prisma.finalReport.count({
    where: { downloadedAt: { gte: dayStart, lt: dayEnd } },
  });

  // Media de turnos del coach por sesión creada en el día. Sólo cuenta
  // sesiones con al menos 1 turno de coach; las que nunca llegaron a
  // Fase 2 no diluyen la media.
  const turnsRows = await prisma.$queryRaw<Phase2TurnsRow[]>`
    WITH turns_per_session AS (
      SELECT t.session_id, COUNT(*)::int AS n
      FROM phase2_turns t
      JOIN sessions s ON s.id = t.session_id
      WHERE s.created_at >= ${dayStart} AND s.created_at < ${dayEnd}
        AND t.role = 'coach'
      GROUP BY t.session_id
    )
    SELECT AVG(n)::float AS avg_turns FROM turns_per_session
  `;
  const avgPhase2Turns = turnsRows[0]?.avg_turns ?? null;

  // Duración: closed_at - created_at sobre sesiones con closed_at en
  // el día. Percentiles con percentile_cont (interpolado). Si no hay
  // sesiones cerradas ese día, todos los campos quedan null.
  const durationRows = await prisma.$queryRaw<DurationStatsRow[]>`
    SELECT
      AVG(EXTRACT(EPOCH FROM (closed_at - created_at)))::float AS avg_seconds,
      PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (closed_at - created_at))
      )::int AS p50_seconds,
      PERCENTILE_CONT(0.95) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (closed_at - created_at))
      )::int AS p95_seconds
    FROM sessions
    WHERE closed_at IS NOT NULL
      AND closed_at >= ${dayStart}
      AND closed_at < ${dayEnd}
  `;
  const duration = durationRows[0] ?? {
    avg_seconds: null,
    p50_seconds: null,
    p95_seconds: null,
  };

  await prisma.dailyStats.upsert({
    where: { date: dayStart },
    create: {
      date: dayStart,
      sessionsCreated,
      sessionsFormSubmitted,
      sessionsPhase1Completed,
      sessionsPhase2Completed,
      sessionsClosed,
      sessionsAbandoned,
      reportsDownloaded,
      avgPhase2Turns,
      avgDurationSeconds: duration.avg_seconds,
      p50DurationSeconds: duration.p50_seconds,
      p95DurationSeconds: duration.p95_seconds,
    },
    update: {
      sessionsCreated,
      sessionsFormSubmitted,
      sessionsPhase1Completed,
      sessionsPhase2Completed,
      sessionsClosed,
      sessionsAbandoned,
      reportsDownloaded,
      avgPhase2Turns,
      avgDurationSeconds: duration.avg_seconds,
      p50DurationSeconds: duration.p50_seconds,
      p95DurationSeconds: duration.p95_seconds,
    },
  });

  const report: DailyStatsReport = {
    event: 'daily_stats_collected',
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    date: formatUtcDate(dayStart),
    sessionsCreated,
    sessionsFormSubmitted,
    sessionsPhase1Completed,
    sessionsPhase2Completed,
    sessionsClosed,
    sessionsAbandoned,
    reportsDownloaded,
    avgPhase2Turns,
    avgDurationSeconds: duration.avg_seconds,
    p50DurationSeconds: duration.p50_seconds,
    p95DurationSeconds: duration.p95_seconds,
  };

  console.log(JSON.stringify(report));
  return report;
}
