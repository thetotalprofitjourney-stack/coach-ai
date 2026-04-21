// Cron nocturno de borrado (§6.3). Hard delete. Se invoca desde:
//   - GET /api/cron/cleanup (Vercel Cron, ventana 3:00-5:00 local).
//   - `npm run cron:cleanup` (script manual del operador).
//
// Reglas aplicadas:
//   1. Borrar sesiones con status = 'closed'.
//   2. Borrar sesiones con created_at < now - 24h y status != 'closed'
//      (abandonadas, §6.3).
//   3. Borrar ficheros PDF/DOCX asociados en almacenamiento (hoy no-op:
//      Paso 8 renderiza on-demand, final_reports.pdf_path/docx_path están
//      siempre a NULL). Hook `deleteReportBlobs` listo para cuando se
//      persistan blobs reales.
//   4. Emitir un log estructurado con los contadores (§7.3, sólo
//      agregados, sin PII).
//
// El borrado de la fila en `sessions` arrastra en cascada el resto
// (phase1_responses, phase1_handoff, phase2_turns, phase2_state,
// final_reports) vía onDelete: Cascade declarado en el schema.

import { prisma } from '@/lib/prisma';

const ABANDONED_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface CleanupReport {
  event: 'cron_cleanup';
  timestamp: string;
  durationMs: number;
  dryRun: boolean;
  closedCount: number;
  abandonedCount: number;
  blobsDeletedCount: number;
}

export interface RunCleanupOptions {
  now?: Date;
  dryRun?: boolean;
}

interface ReportBlobRow {
  sessionId: string;
  pdfPath: string | null;
  docxPath: string | null;
}

// Hook reservado para cuando se persistan ficheros en un backend real
// (Vercel Blob, S3…). Hoy todas las filas tienen pdf_path y docx_path a
// NULL, así que el bucle no entra nunca y el contador es 0. Debe
// ejecutarse ANTES de los deleteMany de sesiones: el cascade borra
// final_reports junto con sessions y después ya no tendríamos los paths.
async function deleteReportBlobs(_rows: ReportBlobRow[]): Promise<number> {
  return 0;
}

export async function runCleanup(
  options: RunCleanupOptions = {},
): Promise<CleanupReport> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  const startedAt = Date.now();
  const abandonedThreshold = new Date(now.getTime() - ABANDONED_WINDOW_MS);

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

  const report: CleanupReport = {
    event: 'cron_cleanup',
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    dryRun,
    closedCount: closedIds.length,
    abandonedCount: abandonedIds.length,
    blobsDeletedCount,
  };

  console.log(JSON.stringify(report));
  return report;
}
