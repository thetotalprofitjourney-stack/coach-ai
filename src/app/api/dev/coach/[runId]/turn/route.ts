import Anthropic from '@anthropic-ai/sdk';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSessionCreateSecret } from '@/lib/api/auth';
import { jsonError, jsonOk } from '@/lib/api/response';
import { callAuxiliar } from '@/lib/fase2/call-auxiliar';
import { callCoach } from '@/lib/fase2/call-coach';
import {
  appendCoachTurn,
  appendUserTurn,
  applyAuxiliarOutput,
  getRun,
} from '@/lib/fase2/store';
import { serializeRunStateView } from '@/lib/fase2/view';

// Permite que la respuesta tarde minutos (auxiliar Haiku + coach Opus con
// thinking en secuencia pueden rondar 45-90 s).
export const maxDuration = 300;

const bodySchema = z.object({
  userMessage: z.string().min(1, 'userMessage no puede estar vacío'),
});

// POST /api/dev/coach/{runId}/turn
// Encadena un turno del usuario sobre una run existente:
//
//   1. Registra la respuesta del usuario en el historial.
//   2. Llama a la IA auxiliar (Haiku 4.5) con el par coach+user anterior
//      para refrescar resumen, hipótesis y nivel estimado.
//   3. Llama al coach (Opus 4.7 + extended thinking) con el estado ya
//      actualizado + los últimos turnos literales.
//   4. Registra la nueva pregunta del coach y la devuelve al operador.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ runId: string }> },
) {
  const unauthorized = requireSessionCreateSecret(req);
  if (unauthorized) return unauthorized;

  const { runId } = await ctx.params;
  const run = getRun(runId);
  if (!run) {
    return jsonError('SESSION_NOT_FOUND', `Run ${runId} no encontrado.`, 404);
  }
  if (run.closed) {
    return jsonError('INVALID_STATE', 'La run ya ha sido cerrada.', 409);
  }
  if (run.coachTurnNumber === 0) {
    return jsonError(
      'INVALID_STATE',
      'El coach aún no ha formulado su primera pregunta.',
      409,
    );
  }
  const lastTurn = run.turns[run.turns.length - 1];
  if (!lastTurn || lastTurn.role !== 'coach') {
    return jsonError(
      'INVALID_STATE',
      'Ya hay una respuesta del usuario pendiente de procesar.',
      409,
    );
  }

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
      'Parámetros inválidos.',
      400,
      parsed.error.flatten(),
    );
  }

  try {
    appendUserTurn(runId, parsed.data.userMessage);

    const afterUser = getRun(runId);
    if (!afterUser) throw new Error('run desapareció tras appendUserTurn');
    const auxResult = await callAuxiliar(afterUser);
    applyAuxiliarOutput(runId, auxResult.output);

    const afterAux = getRun(runId);
    if (!afterAux) throw new Error('run desapareció tras applyAuxiliarOutput');
    const coachResult = await callCoach(afterAux);
    appendCoachTurn(runId, coachResult.text);

    const latest = getRun(runId);
    if (!latest) throw new Error('run desapareció tras appendCoachTurn');

    return jsonOk({
      runId: latest.runId,
      coachMessage: coachResult.text,
      turnNumber: latest.coachTurnNumber,
      auxiliar: {
        latencyMs: auxResult.latencyMs,
        usage: auxResult.usage,
        applied: auxResult.output,
      },
      coach: {
        latencyMs: coachResult.latencyMs,
        usage: coachResult.usage,
      },
      state: serializeRunStateView(latest),
    });
  } catch (err) {
    return handleAnthropicError(err, 'coach/turn');
  }
}

function handleAnthropicError(err: unknown, label: string) {
  if (err instanceof Anthropic.AuthenticationError) {
    console.error(`${label}: autenticación rechazada`);
    return jsonError(
      'INTERNAL',
      'ANTHROPIC_API_KEY inválida o ausente en el servidor.',
      500,
    );
  }
  if (err instanceof Anthropic.RateLimitError) {
    console.error(`${label}: rate limit`);
    return jsonError('INTERNAL', 'Rate limit de Anthropic alcanzado.', 503);
  }
  if (err instanceof Anthropic.APIError) {
    console.error(`${label}: APIError ${err.status}`);
    return jsonError(
      'INTERNAL',
      `Anthropic respondió con error ${err.status}.`,
      502,
    );
  }
  console.error(`${label}: error inesperado`, err);
  return jsonError('INTERNAL', 'Fallo al llamar a Anthropic.', 500);
}
