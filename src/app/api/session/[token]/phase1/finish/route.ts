import type { NextRequest } from 'next/server';

import { jsonError } from '@/lib/api/response';
import { ndjsonStreamResponse } from '@/lib/api/ndjson-stream';
import { callSintesis } from '@/lib/fase1/call-sintesis';
import { logBusinessEvent } from '@/lib/metrics/events';
import { recordLlmCall } from '@/lib/metrics/llm-calls';
import { prisma } from '@/lib/prisma';
import { getTotalItems } from '@/lib/fase1/banco';
import { loadSessionOrResponse, transitionStatus } from '@/lib/session/loader';
import { reconstructFase1RunState } from '@/lib/session/reconstruct';

// Síntesis con Sonnet 4.6 + adaptive thinking puede tardar 60-120s.
// El endpoint responde en NDJSON y emite pings cada 5s para que el proxy
// no corte la conexión antes de que termine (§ nginx proxy_read_timeout).
export const maxDuration = 300;

// POST /api/session/{token}/phase1/finish
// Idempotente si se invoca tras una síntesis ya completada: devuelve 409.
// Espera exactamente 16 Phase1Response. La síntesis corre dentro del stream;
// el frontend lee los eventos hasta recibir {type:"done"} o {type:"error"}.
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
  const state = reconstructFase1RunState(session, responses);
  const totalItems = getTotalItems(state.formulario.reto_dominio);
  if (responses.length < totalItems) {
    return jsonError(
      'INVALID_STATE',
      `Faltan respuestas (${responses.length}/${totalItems}). No se puede sintetizar aún.`,
      409,
    );
  }

  return ndjsonStreamResponse(async (emit) => {
    // Keepalive cada 5s para que Nginx no cierre la conexión mientras
    // la síntesis corre (puede tardar 60-120s).
    const pingInterval = setInterval(() => {
      emit({ type: 'ping' });
    }, 5_000);

    let handoffPayload;
    try {
      const sintesis = await callSintesis({
        formulario: state.formulario,
        answers: state.answers,
      });
      handoffPayload = sintesis.handoff;
      await recordLlmCall({
        sessionId: session.id,
        model: sintesis.model,
        kind: 'fase1_sintesis',
        usage: sintesis.usage,
        durationMs: sintesis.latencyMs,
      });
    } catch (err) {
      clearInterval(pingInterval);
      console.error('phase1/finish síntesis', err);
      emit({ type: 'error', code: 'INTERNAL', message: 'Fallo al generar el hand-off.' });
      return;
    }

    // Upsert hand-off + transición atómica. Si la transición no afecta
    // filas, alguien más cerró la fase entre la carga y ahora.
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
        clearInterval(pingInterval);
        emit({ type: 'error', code: 'INVALID_STATE', message: 'La sesión cambió de estado durante la síntesis.' });
        return;
      }
    } catch (err) {
      clearInterval(pingInterval);
      console.error('phase1/finish persistencia', err);
      emit({ type: 'error', code: 'INTERNAL', message: 'No se pudo guardar el hand-off.' });
      return;
    }

    clearInterval(pingInterval);

    logBusinessEvent('phase1_completed', {
      durationMs: Date.now() - session.createdAt.getTime(),
      turnsCount: totalItems,
    });

    emit({ type: 'done', status: 'phase1_completed' as const });
  });
}

