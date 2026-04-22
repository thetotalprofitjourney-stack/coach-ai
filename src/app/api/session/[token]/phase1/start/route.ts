import type { NextRequest } from 'next/server';

import { handleAnthropicError } from '@/lib/api/anthropic-errors';
import { jsonError, jsonOk } from '@/lib/api/response';
import { callAdministrador } from '@/lib/fase1/call-administrador';
import { recordLlmCall } from '@/lib/metrics/llm-calls';
import { prisma } from '@/lib/prisma';
import { loadSessionOrResponse } from '@/lib/session/loader';
import { reconstructFase1RunState } from '@/lib/session/reconstruct';

export const maxDuration = 60;

// POST /api/session/{token}/phase1/start
// Idempotente. Devuelve el primer mensaje del administrador (presentación
// del ítem 0). No modifica nada en BD: los turnos de Fase 1 no se
// persisten, así que el cliente puede invocarlo cada vez que el usuario
// entra a la pantalla de chat sin respuestas aún dadas.
//
// Si ya hay respuestas, devuelve el enunciado del ítem actual (el que el
// usuario tenga pendiente) para reanudar la sesión tras un refresh del
// navegador.
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

  if (state.currentItemIndex >= 16) {
    return jsonError(
      'INVALID_STATE',
      'Todos los ítems ya respondidos. Invoca /phase1/finish.',
      409,
    );
  }

  try {
    const admin = await callAdministrador({
      state,
      directive: 'presentar',
      lastUserMessage: '',
    });
    await recordLlmCall({
      sessionId: session.id,
      model: admin.model,
      kind: 'fase1_admin',
      usage: admin.usage,
      durationMs: admin.latencyMs,
    });
    return jsonOk({
      adminMessage: admin.text,
      itemIndex: state.currentItemIndex,
      totalItems: 16,
    });
  } catch (err) {
    return handleAnthropicError(err, 'phase1/start');
  }
}
