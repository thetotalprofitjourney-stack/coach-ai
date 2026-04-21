import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { jsonError } from '@/lib/api/response';
import {
  loadReportForDownload,
  markReportDownloadedOnce,
} from '@/lib/report/access';
import { renderReportDocx } from '@/lib/report/render-docx';
import { reportFilename } from '@/lib/report/titles';

// GET /api/session/{token}/report/docx
// Gemelo del endpoint PDF. Render bajo demanda y attachment. La primera
// descarga (sea PDF o DOCX) marca `downloadedAt` y arranca el timer de
// 10 min (§2.6).
export const maxDuration = 30;

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const loaded = await loadReportForDownload(token);
  if (loaded instanceof Response) return loaded;

  let buffer: Buffer;
  try {
    buffer = await renderReportDocx({
      report: loaded.report,
      userName: loaded.userName,
      createdAt: loaded.createdAt,
    });
  } catch (err) {
    console.error('report/docx: render failed', err);
    return jsonError('INTERNAL', 'No se pudo generar el DOCX.', 500);
  }

  try {
    await markReportDownloadedOnce(loaded.sessionId, loaded.downloadedAt);
  } catch (err) {
    console.error('report/docx: markDownloadedOnce failed', err);
  }

  const filename = reportFilename(loaded.userName, loaded.createdAt, 'docx');
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': DOCX_MIME,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'private, no-store',
    },
  });
}
