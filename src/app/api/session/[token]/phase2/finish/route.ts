import type { NextRequest } from 'next/server';

import { jsonError, jsonOk } from '@/lib/api/response';
import { parseFinalReport } from '@/lib/fase2/parse-report';
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

  const lastCoachTurn = await prisma.phase2Turn.findFirst({
    where: { sessionId: session.id, role: 'coach' },
    orderBy: { turnNumber: 'desc' },
  });
  if (!lastCoachTurn) {
    return jsonError(
      'INVALID_STATE',
      'No hay turnos del coach en esta sesión.',
      409,
    );
  }

  const report = parseFinalReport(lastCoachTurn.content);

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

  return jsonOk({
    ok: true,
    status: 'phase2_completed' as const,
    parseStatus: report.parseStatus,
  });
}
