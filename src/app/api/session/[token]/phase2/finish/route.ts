import type { NextRequest } from 'next/server';

import { jsonError, jsonOk } from '@/lib/api/response';
import { parseFinalReport } from '@/lib/fase2/parse-report';
import { logBusinessEvent } from '@/lib/metrics/events';
import { prisma } from '@/lib/prisma';
import { loadSessionOrResponse, transitionStatus } from '@/lib/session/loader';

// POST /api/session/{token}/phase2/finish
// Cierre explícito de Fase 2. Toma el último turno del coach, lo parsea a
// los 11 bloques del informe (§5.4) y lo persiste en FinalReport. Si el
// parseo falla, guarda el texto bruto con parseStatus='raw' para que el
// Paso 8 pueda materializarlo a PDF manualmente.
export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const loaded = await loadSessionOrResponse(token, ['phase2_in_progress']);
  if (loaded instanceof Response) return loaded;
  const { session } = loaded;

  const [coachTurns, coachTurnsCount] = await Promise.all([
    prisma.phase2Turn.findMany({
      where: { sessionId: session.id, role: 'coach' },
      orderBy: { turnNumber: 'desc' },
      select: { content: true },
    }),
    prisma.phase2Turn.count({
      where: { sessionId: session.id, role: 'coach' },
    }),
  ]);
  if (coachTurns.length === 0) {
    return jsonError(
      'INVALID_STATE',
      'No hay turnos del coach en esta sesión.',
      409,
    );
  }

  // Busca el turno más reciente que se parsee con los 11 bloques. Si el
  // usuario continuó conversando después del informe, el último turno puede
  // ser una respuesta conversacional sin estructura; al escanear hacia atrás
  // recuperamos el turno que contiene el informe real.
  let report = parseFinalReport(coachTurns[0].content);
  for (const turn of coachTurns) {
    const candidate = parseFinalReport(turn.content);
    if (candidate.parseStatus === 'parsed') {
      report = candidate;
      break;
    }
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
