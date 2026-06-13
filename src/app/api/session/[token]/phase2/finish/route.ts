import type { NextRequest } from 'next/server';

import { jsonError, jsonOk } from '@/lib/api/response';
import { generateReport } from '@/lib/fase2/generate-report';
import { logBusinessEvent } from '@/lib/metrics/events';
import { prisma } from '@/lib/prisma';
import { loadSessionOrResponse, transitionStatus } from '@/lib/session/loader';

// El informe puede tardar hasta 60 s con conversaciones largas.
export const maxDuration = 120;

// POST /api/session/{token}/phase2/finish
// Genera el informe de cierre a partir de toda la conversación y lo persiste
// en FinalReport. Funciona tanto para sesiones completadas naturalmente como
// para sesiones interrumpidas por el usuario (el informe refleja lo que hubo).
export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const loaded = await loadSessionOrResponse(token, ['phase2_in_progress']);
  if (loaded instanceof Response) return loaded;
  const { session } = loaded;

  const allTurns = await prisma.phase2Turn.findMany({
    where: { sessionId: session.id },
    orderBy: [{ turnNumber: 'asc' }, { createdAt: 'asc' }],
    select: { role: true, content: true, turnNumber: true },
  });

  if (allTurns.length === 0) {
    return jsonError(
      'INVALID_STATE',
      'No hay turnos en esta sesión.',
      409,
    );
  }

  const coachTurnsCount = allTurns.filter((t) => t.role === 'coach').length;

  let report;
  try {
    report = await generateReport(
      allTurns.map((t) => ({
        role: t.role as 'coach' | 'user',
        content: t.content,
        turnNumber: t.turnNumber,
      })),
    );
  } catch (err) {
    console.error('phase2/finish generateReport', err);
    return jsonError('INTERNAL', 'No se pudo generar el informe.', 500);
  }

  try {
    const transitioned = await prisma.$transaction(async (tx) => {
      await tx.finalReport.upsert({
        where: { sessionId: session.id },
        create: {
          sessionId: session.id,
          reportContent: report as unknown as object,
        },
        update: { reportContent: report as unknown as object },
      });
      return transitionStatus(
        tx,
        session.id,
        'phase2_in_progress',
        'phase2_completed',
      );
    });
    if (!transitioned) {
      return jsonError(
        'INVALID_STATE',
        'La sesión cambió de estado durante el cierre.',
        409,
      );
    }
  } catch (err) {
    console.error('phase2/finish persistencia', err);
    return jsonError('INTERNAL', 'No se pudo persistir el informe.', 500);
  }

  logBusinessEvent('phase2_completed', {
    durationMs: Date.now() - session.createdAt.getTime(),
    turnsCount: coachTurnsCount,
  });

  return jsonOk({
    ok: true,
    status: 'phase2_completed' as const,
    parseStatus: report.parseStatus,
  });
}
