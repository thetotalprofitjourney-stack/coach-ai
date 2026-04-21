import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { jsonError } from '@/lib/api/response';
import {
  loadReportForDownload,
  markReportDownloadedOnce,
} from '@/lib/report/access';
import { renderReportPdf } from '@/lib/report/render-pdf';
import { reportFilename } from '@/lib/report/titles';

// GET /api/session/{token}/report/pdf
// Renderiza el informe (§5.4) a PDF bajo demanda y lo sirve como
// attachment. En la primera descarga marca `downloadedAt` (pivote del
// timer de 10 min, §2.6). Las descargas posteriores repiten el render
// sin mover el reloj.
export const maxDuration = 30;

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const loaded = await loadReportForDownload(token);
  if (loaded instanceof Response) return loaded;

  let buffer: Buffer;
  try {
    buffer = await renderReportPdf({
      report: loaded.report,
      userName: loaded.userName,
      createdAt: loaded.createdAt,
    });
  } catch (err) {
    console.error('report/pdf: render failed', err);
    return jsonError('INTERNAL', 'No se pudo generar el PDF.', 500);
  }

  try {
    await markReportDownloadedOnce(loaded.sessionId, loaded.downloadedAt);
  } catch (err) {
    console.error('report/pdf: markDownloadedOnce failed', err);
  }

  const filename = reportFilename(loaded.userName, loaded.createdAt, 'pdf');
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'private, no-store',
    },
  });
}
