import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { jsonError, jsonOk } from '@/lib/api/response';
import { isEmailConfigured } from '@/lib/email/client';
import { sendReportEmail } from '@/lib/email/send-report';
import { logBusinessEvent } from '@/lib/metrics/events';
import { loadReportForDownload } from '@/lib/report/access';
import { renderReportDocx } from '@/lib/report/render-docx';
import { renderReportPdf } from '@/lib/report/render-pdf';
import { reportFilename } from '@/lib/report/titles';
import { prisma } from '@/lib/prisma';

// POST /api/session/{token}/report/email
// Reenvío opt-in del informe final por email (§2.4). El usuario introduce
// la dirección en la pantalla del informe; el endpoint genera PDF+DOCX en
// memoria, los adjunta, llama al SMTP y marca `emailedAt` (sin guardar la
// dirección). Un solo envío por sesión: un segundo POST con emailedAt ya
// fijado devuelve 409. La descarga sigue disponible dentro del timer de
// 10 min; este endpoint NO arranca el timer ni cierra la sesión.
export const maxDuration = 60;

const bodySchema = z.object({
  // Permitimos max 254 que es el tope del RFC 5321; la validación
  // principal la hace Zod con el formato email.
  email: z.string().trim().toLowerCase().email().max(254),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  if (!isEmailConfigured()) {
    return jsonError(
      'INTERNAL',
      'El envío por email no está disponible en este despliegue.',
      503,
    );
  }

  const { token } = await context.params;
  const loaded = await loadReportForDownload(token);
  if (loaded instanceof Response) return loaded;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    return jsonError('INVALID_INPUT', 'JSON inválido en el cuerpo.', 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      'INVALID_INPUT',
      'Dirección de email inválida.',
      400,
      parsed.error.flatten(),
    );
  }

  // Re-lee `emailedAt` porque loadReportForDownload no lo selecciona.
  // Una sesión puede tener downloads múltiples pero un solo envío.
  const existing = await prisma.finalReport.findUnique({
    where: { sessionId: loaded.sessionId },
    select: { emailedAt: true },
  });
  if (existing?.emailedAt) {
    return jsonError(
      'INVALID_STATE',
      'Ya se ha enviado una copia por email de esta sesión.',
      409,
    );
  }

  let pdfBuffer: Buffer;
  let docxBuffer: Buffer;
  try {
    [pdfBuffer, docxBuffer] = await Promise.all([
      renderReportPdf({
        report: loaded.report,
        userName: loaded.userName,
        createdAt: loaded.createdAt,
      }),
      renderReportDocx({
        report: loaded.report,
        userName: loaded.userName,
        createdAt: loaded.createdAt,
      }),
    ]);
  } catch (err) {
    console.error('report/email: render failed', err);
    return jsonError('INTERNAL', 'No se pudo preparar el informe.', 500);
  }

  try {
    await sendReportEmail({
      to: parsed.data.email,
      userName: loaded.userName,
      createdAt: loaded.createdAt,
      pdfBuffer,
      pdfFilename: reportFilename(loaded.userName, loaded.createdAt, 'pdf'),
      docxBuffer,
      docxFilename: reportFilename(loaded.userName, loaded.createdAt, 'docx'),
    });
  } catch (err) {
    // No exponemos detalles del SMTP al cliente: un 502 genérico evita
    // filtrar infraestructura, pero sí dejamos rastro en logs server-side
    // para que el operador diagnostique.
    console.error('report/email: send failed', err);
    return jsonError(
      'INTERNAL',
      'No se pudo enviar el email. Inténtalo de nuevo o descarga manualmente.',
      502,
    );
  }

  // Marca el envío sin guardar la dirección. La bandera es suficiente
  // para impedir reenvíos y para métricas agregadas (`reports_emailed`).
  const emailedAt = new Date();
  try {
    await prisma.finalReport.update({
      where: { sessionId: loaded.sessionId },
      data: { emailedAt },
    });
  } catch (err) {
    // El email ya salió; si esto falla no podemos "deshacerlo". Lo
    // logueamos para que el operador reconcilie si hace falta, pero
    // respondemos éxito al cliente — es la expectativa del usuario.
    console.error('report/email: markEmailed failed', err);
  }

  logBusinessEvent('report_emailed', {});

  return jsonOk({ emailedAt: emailedAt.toISOString() });
}
