import type { NextRequest } from 'next/server';

import { handleAnthropicError } from '@/lib/api/anthropic-errors';
import { jsonError, jsonOk } from '@/lib/api/response';
import { callSintesis } from '@/lib/fase1/call-sintesis';
import { logBusinessEvent } from '@/lib/metrics/events';
import { prisma } from '@/lib/prisma';
import { loadSessionOrResponse, transitionStatus } from '@/lib/session/loader';
import { reconstructFase1RunState } from '@/lib/session/reconstruct';

// Síntesis con Sonnet 4.6 + extended thinking 5k puede tardar 60-120s.
// 300s es consistente con el endpoint dev homólogo y con Vercel Pro.
export const maxDuration = 300;

// POST /api/session/{token}/phase1/finish
// Idempotente si se invoca tras una síntesis ya completada: devuelve 409.
// Espera exactamente 16 Phase1Response. La síntesis corre sincrónicamente
// dentro del request; el frontend muestra una pantalla de carga mientras
// tanto (§2.4).
export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const loaded = await loadSessionOrResponse(token, ['phase1_in_progress']);
  if (loaded instanceof Response) return loaded;
  const { session } = loaded;

  const responses = await prisma.phase1Response.findMany({
    where: { sessionId: session.id },
  });
  if (responses.length < 16) {
    return jsonError(
      'INVALID_STATE',
      `Faltan respuestas (${responses.length}/16). No se puede sintetizar aún.`,
      409,
    );
  }

  const state = reconstructFase1RunState(session, responses);

  let handoffPayload;
  try {
    const sintesis = await callSintesis({
      formulario: state.formulario,
      answers: state.answers,
    });
    handoffPayload = sintesis.handoff;
  } catch (err) {
    return handleAnthropicError(err, 'phase1/finish síntesis');
  }

  // Upsert hand-off + transición atómica. Si la transición no afecta
  // filas, alguien más cerró la fase entre la carga y ahora — devolvemos
  // 409 para que el cliente recargue.
  try {
    const transitioned = await prisma.$transaction(async (tx) => {
      await tx.phase1Handoff.upsert({
        where: { sessionId: session.id },
        create: {
          sessionId: session.id,
          handoffContent: handoffPayload as unknown as object,
        },
        update: { handoffContent: handoffPayload as unknown as object },
      });
      return transitionStatus(
        tx,
        session.id,
        'phase1_in_progress',
        'phase1_completed',
      );
    });
    if (!transitioned) {
      return jsonError(
        'INVALID_STATE',
        'La sesión cambió de estado durante la síntesis.',
        409,
      );
    }
  } catch (err) {
    console.error('phase1/finish persistencia', err);
    return jsonError('INTERNAL', 'No se pudo guardar el hand-off.', 500);
  }

  logBusinessEvent('phase1_completed', {
    durationMs: Date.now() - session.createdAt.getTime(),
    turnsCount: 16,
  });

  return jsonOk({ ok: true, status: 'phase1_completed' as const });
}
