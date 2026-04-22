// Cron nocturno (§6.3 + §7.3). Se invoca desde:
//   - GET /api/cron/cleanup (entry HTTP, invocado por cron del host).
//   - `npm run cron:cleanup` (script manual del operador).
//
// Dos stages, en este orden:
//   1. collect — `collectDailyStats` agrega las filas aún presentes a
//      `daily_stats` (§7.3, Paso 14). Corre ANTES del borrado porque
//      después los datos ya no existen.
//   2. cleanup — hard delete de:
//        a. Sesiones con status = 'closed'.
//        b. Sesiones con created_at < now - 24h y status != 'closed'
//           (abandonadas, §6.3).
//      El borrado de la fila en `sessions` arrastra en cascada el
//      resto (phase1_responses, phase1_handoff, phase2_turns,
//      phase2_state, final_reports) vía onDelete: Cascade.
//
// Si `collect` falla, el cron aborta antes del borrado: los datos de
// la DB quedan intactos para una re-ejecución. `event=nightly_failed`
// en stdout con el stage para diagnóstico.
//
// `deleteReportBlobs` sigue siendo un hook no-op: el Paso 8 renderiza
// PDF/DOCX on-demand, así que `final_reports.pdf_path` y `docx_path`
// siguen a NULL. Listo para cuando se persistan blobs reales.

import { collectDailyStats, type DailyStatsReport } from '@/lib/metrics/daily';
import { prisma } from '@/lib/prisma';

// TTL de sesiones abandonadas. El enlace de cada sesión es el único
// identificador y el usuario puede perderlo si se cae el WiFi o cierra
// la pestaña. Con 48h el visitante tiene dos días reales para retomar,
// lo que reduce fricción y disputas Stripe. Configurable por env var
// (SESSION_TTL_HOURS) para que el operador pueda endurecerlo o
// extenderlo sin redeploy. Límites duros 12h–168h para evitar valores
// absurdos.
const DEFAULT_ABANDONED_WINDOW_HOURS = 48;
const MIN_ABANDONED_WINDOW_HOURS = 12;
const MAX_ABANDONED_WINDOW_HOURS = 168;

export function abandonedWindowMs(): number {
  const raw = process.env.SESSION_TTL_HOURS;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  let hours: number;
  if (!Number.isFinite(parsed) || parsed < 1) {
    hours = DEFAULT_ABANDONED_WINDOW_HOURS;
  } else {
    hours = Math.min(
      MAX_ABANDONED_WINDOW_HOURS,
      Math.max(MIN_ABANDONED_WINDOW_HOURS, parsed),
    );
  }
  return hours * 60 * 60 * 1000;
}

// Ventana corta para /preview: ni la conversación ni el cupo necesitan
// sobrevivir más de una hora. El cupo diario por IP vive en
// `preview_quotas` y se gestiona aparte (TTL de 1 día UTC).
const PREVIEW_WINDOW_MS = 60 * 60 * 1000;

export interface CleanupReport {
  event: 'cron_cleanup';
  timestamp: string;
  durationMs: number;
  dryRun: boolean;
  closedCount: number;
  abandonedCount: number;
  blobsDeletedCount: number;
  previewSessionsDeletedCount: number;
  previewQuotasDeletedCount: number;
}

export interface NightlyReport {
  stats: DailyStatsReport | null;
  cleanup: CleanupReport;
}

export interface RunNightlyOptions {
  now?: Date;
  dryRun?: boolean;
  // Fecha objetivo del recolector (cualquier Date dentro del día
  // deseado, UTC). Default: ayer-UTC respecto a `now`.
  collectDate?: Date;
  // Si `true`, salta el stage de collect. Útil para dry-runs de
  // desarrollo que sólo quieren validar el contador de cleanup sin
  // pisar `daily_stats`. El cron productivo nunca lo usa.
  skipCollect?: boolean;
}

interface ReportBlobRow {
  sessionId: string;
  pdfPath: string | null;
  docxPath: string | null;
}

async function deleteReportBlobs(_rows: ReportBlobRow[]): Promise<number> {
  return 0;
}

export async function runNightly(
  options: RunNightlyOptions = {},
): Promise<NightlyReport> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  const skipCollect = options.skipCollect ?? false;
  const collectDate =
    options.collectDate ?? new Date(now.getTime() - 24 * 60 * 60 * 1000);

  let stats: DailyStatsReport | null = null;
  if (!skipCollect && !dryRun) {
    try {
      stats = await collectDailyStats({ date: collectDate, now });
    } catch (err) {
      console.log(
        JSON.stringify({
          event: 'nightly_failed',
          stage: 'collect',
          timestamp: new Date().toISOString(),
          message: err instanceof Error ? err.message : String(err),
        }),
      );
      throw err;
    }
  }

  let cleanup: CleanupReport;
  try {
    cleanup = await runCleanupStage({ now, dryRun });
  } catch (err) {
    console.log(
      JSON.stringify({
        event: 'nightly_failed',
        stage: 'cleanup',
        timestamp: new Date().toISOString(),
        message: err instanceof Error ? err.message : String(err),
      }),
    );
    throw err;
  }

  return { stats, cleanup };
}

async function runCleanupStage({
  now,
  dryRun,
}: {
  now: Date;
  dryRun: boolean;
}): Promise<CleanupReport> {
  const startedAt = Date.now();
  const windowMs = abandonedWindowMs();
  const abandonedThreshold = new Date(now.getTime() - windowMs);

  const [closedRows, abandonedRows] = await Promise.all([
    prisma.session.findMany({
      where: { status: 'closed' },
      select: { id: true },
    }),
    prisma.session.findMany({
      where: {
        createdAt: { lt: abandonedThreshold },
        status: { not: 'closed' },
      },
      select: { id: true },
    }),
  ]);

  const closedIds = closedRows.map((r) => r.id);
  const abandonedIds = abandonedRows.map((r) => r.id);
  const allIds = [...closedIds, ...abandonedIds];

  const blobRows: ReportBlobRow[] =
    allIds.length > 0
      ? await prisma.finalReport.findMany({
          where: {
            sessionId: { in: allIds },
            OR: [{ pdfPath: { not: null } }, { docxPath: { not: null } }],
          },
          select: { sessionId: true, pdfPath: true, docxPath: true },
        })
      : [];

  let blobsDeletedCount = 0;
  if (blobRows.length > 0) {
    if (dryRun) {
      blobsDeletedCount = blobRows.reduce(
        (n, r) => n + (r.pdfPath ? 1 : 0) + (r.docxPath ? 1 : 0),
        0,
      );
    } else {
      blobsDeletedCount = await deleteReportBlobs(blobRows);
    }
  }

  if (!dryRun && allIds.length > 0) {
    await prisma.$transaction([
      prisma.session.deleteMany({ where: { id: { in: closedIds } } }),
      prisma.session.deleteMany({ where: { id: { in: abandonedIds } } }),
    ]);
  }

  // Purga las demos expiradas (> 1 h) y los cupos diarios ya reseteados.
  // Las dos tablas están desacopladas de `sessions`, así que las tocamos
  // aquí mismo. No afecta al anonimato: `preview_sessions.turns` sólo
  // contiene el texto libre del visitante y las respuestas del coach.
  // El cupo diario vive 24h independientemente de SESSION_TTL_HOURS: un
  // día UTC es un día UTC sin importar el TTL del producto.
  const PREVIEW_QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;
  const previewExpiredThreshold = new Date(now.getTime() - PREVIEW_WINDOW_MS);
  const quotaExpiredThreshold = new Date(now.getTime() - PREVIEW_QUOTA_WINDOW_MS);

  let previewSessionsDeletedCount = 0;
  let previewQuotasDeletedCount = 0;
  if (dryRun) {
    const [psCount, pqCount] = await Promise.all([
      prisma.previewSession.count({
        where: { createdAt: { lt: previewExpiredThreshold } },
      }),
      prisma.previewQuota.count({
        where: { lastPreviewAt: { lt: quotaExpiredThreshold } },
      }),
    ]);
    previewSessionsDeletedCount = psCount;
    previewQuotasDeletedCount = pqCount;
  } else {
    const [psResult, pqResult] = await Promise.all([
      prisma.previewSession.deleteMany({
        where: { createdAt: { lt: previewExpiredThreshold } },
      }),
      prisma.previewQuota.deleteMany({
        where: { lastPreviewAt: { lt: quotaExpiredThreshold } },
      }),
    ]);
    previewSessionsDeletedCount = psResult.count;
    previewQuotasDeletedCount = pqResult.count;
  }

  const report: CleanupReport = {
    event: 'cron_cleanup',
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    dryRun,
    closedCount: closedIds.length,
    abandonedCount: abandonedIds.length,
    blobsDeletedCount,
    previewSessionsDeletedCount,
    previewQuotasDeletedCount,
  };

  console.log(JSON.stringify(report));
  return report;
}
