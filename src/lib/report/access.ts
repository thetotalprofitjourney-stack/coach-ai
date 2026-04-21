// Helpers compartidos por los endpoints de descarga PDF/DOCX.
// Valida token, estado (`phase2_completed` sólo) y carga el FinalReport.
// Propaga los errores como NextResponse ya formado.

import type { NextResponse } from 'next/server';

import { jsonError, type ApiErrorBody } from '@/lib/api/response';
import { sessionTokenSchema } from '@/lib/api/schemas';
import type { FinalReportContent } from '@/lib/fase2/parse-report';
import { prisma } from '@/lib/prisma';

export interface LoadedReport {
  sessionId: string;
  userName: string | null;
  createdAt: Date;
  downloadedAt: Date | null;
  report: FinalReportContent;
}

export async function loadReportForDownload(
  token: string,
): Promise<LoadedReport | NextResponse<ApiErrorBody>> {
  const tokenParse = sessionTokenSchema.safeParse(token);
  if (!tokenParse.success) {
    return jsonError('INVALID_INPUT', 'Token de sesión inválido.', 400);
  }

  const session = await prisma.session.findUnique({
    where: { id: tokenParse.data },
    select: {
      id: true,
      status: true,
      userName: true,
      createdAt: true,
      finalReport: {
        select: { reportContent: true, downloadedAt: true },
      },
    },
  });
  if (!session) {
    return jsonError('SESSION_NOT_FOUND', 'La sesión no existe.', 404);
  }
  if (session.status === 'closed') {
    // La sesión se ha cerrado (explícitamente o por el timer de 10 min).
    // Los datos pueden seguir en DB hasta el cron nocturno (§6.3), pero
    // la descarga ya no está permitida (§2.6).
    return jsonError(
      'SESSION_CLOSED',
      'La sesión ya ha sido cerrada.',
      410,
    );
  }
  if (session.status !== 'phase2_completed') {
    return jsonError(
      'INVALID_STATE',
      `La sesión no admite la descarga en el estado "${session.status}".`,
      409,
    );
  }
  if (!session.finalReport) {
    console.error('report/access: finalReport missing for phase2_completed', {
      sessionId: session.id,
    });
    return jsonError(
      'REPORT_NOT_FOUND',
      'No se encontró el informe final para esta sesión.',
      404,
    );
  }

  return {
    sessionId: session.id,
    userName: session.userName,
    createdAt: session.createdAt,
    downloadedAt: session.finalReport.downloadedAt,
    report: session.finalReport.reportContent as unknown as FinalReportContent,
  };
}

// Marca la primera descarga (timestamp arranca el timer de 10 min del
// usuario, §2.6). Idempotente vía updateMany con guardia `downloadedAt IS
// NULL`: dos descargas concurrentes no pisan el valor. Devuelve el
// timestamp efectivo (nuevo o el ya existente).
export async function markReportDownloadedOnce(
  sessionId: string,
  previous: Date | null,
): Promise<Date> {
  if (previous) return previous;
  const now = new Date();
  const res = await prisma.finalReport.updateMany({
    where: { sessionId, downloadedAt: null },
    data: { downloadedAt: now },
  });
  if (res.count === 1) return now;
  const row = await prisma.finalReport.findUnique({
    where: { sessionId },
    select: { downloadedAt: true },
  });
  return row?.downloadedAt ?? now;
}
