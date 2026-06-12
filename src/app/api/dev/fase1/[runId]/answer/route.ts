import Anthropic from '@anthropic-ai/sdk';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSessionCreateSecret } from '@/lib/api/auth';
import { jsonError, jsonOk } from '@/lib/api/response';
import { factorOf, getFilteredItemByIndex, getTotalItems } from '@/lib/fase1/banco';
import { callAdministrador } from '@/lib/fase1/call-administrador';
import { callSintesis } from '@/lib/fase1/call-sintesis';
import { parseUserAnswer } from '@/lib/fase1/parse-answer';
import {
  appendTurn,
  bumpReask,
  getRun,
  markSynthesisError,
  markSynthesized,
  recordAnswer,
} from '@/lib/fase1/store';
import { serializeFase1StateView } from '@/lib/fase1/view';

// La síntesis con Sonnet + extended thinking puede rondar 60-90s. El
// handler del ítem 16 corre admin + síntesis en el mismo request; 300s
// es amplio y consistente con /api/dev/coach/*.
export const maxDuration = 300;

const REASK_LIMIT = 3;

const bodySchema = z.object({
  userMessage: z.string().min(1),
});

// POST /api/dev/fase1/{runId}/answer
// Un turno del usuario contra el administrador. Flujo:
//   1. Registra el turno del usuario en el store.
//   2. Parsea la letra del mensaje.
//      - Si no hay letra y no se supera el tope de re-preguntas:
//        pide al administrador que re-pregunte (sin avanzar índice).
//      - Si no hay letra y se supera el tope: registra answer con
//        chosenLetter=null y avanza índice.
//      - Si hay letra: registra answer y avanza índice.
//   3. Si tras avanzar currentItemIndex llega a 16: dispara la síntesis
//      con Sonnet y pide al administrador una despedida breve.
//   4. Si no ha llegado a 16: pide al administrador que presente el
//      siguiente ítem.
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  const unauthorized = requireSessionCreateSecret(req);
  if (unauthorized) return unauthorized;

  const { runId } = await context.params;
  const state = getRun(runId);
  if (!state) {
    return jsonError('SESSION_NOT_FOUND', `Run ${runId} no encontrado.`, 404);
  }
  if (state.closed) {
    return jsonError(
      'INVALID_STATE',
      'Run ya cerrado; la Fase 1 ha concluido.',
      409,
    );
  }
  const totalItems = getTotalItems(state.formulario.reto_dominio);
  if (state.currentItemIndex >= totalItems) {
    return jsonError(
      'INVALID_STATE',
      'Todos los ítems ya respondidos; la síntesis debería haber corrido.',
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

  const userMessage = parsed.data.userMessage;
  appendTurn(runId, 'user', userMessage);

  const parsedAnswer = parseUserAnswer(userMessage);
  const currentItem = getFilteredItemByIndex(state.currentItemIndex, state.formulario.reto_dominio);

  // Caso re-pregunta: no hay letra y el tope no está agotado.
  if (parsedAnswer.letter === null) {
    const nextReask = bumpReask(runId);
    if (nextReask <= REASK_LIMIT) {
      try {
        const admin = await callAdministrador({
          state: getRun(runId)!,
          directive: 'repreguntar',
          lastUserMessage: userMessage,
        });
        appendTurn(runId, 'admin', admin.text);
        const latest = getRun(runId)!;
        return jsonOk({
          adminMessage: admin.text,
          itemIndex: latest.currentItemIndex,
          parsedLetter: null,
          adminUsage: admin.usage,
          adminLatencyMs: admin.latencyMs,
          state: serializeFase1StateView(latest),
        });
      } catch (err) {
        return handleAnthropicError(err, 'fase1/answer reask');
      }
    }
    // Tope superado: avanzamos con letra null y freeText completo.
    recordAnswer(runId, {
      itemId: currentItem.id,
      chosenLetter: null,
      chosenFactor: null,
      freeText: parsedAnswer.freeText,
    });
  } else {
    // Letra detectada: avanzamos.
    recordAnswer(runId, {
      itemId: currentItem.id,
      chosenLetter: parsedAnswer.letter,
      chosenFactor: factorOf(currentItem.id, parsedAnswer.letter),
      freeText: parsedAnswer.freeText,
    });
  }

  const afterRecord = getRun(runId)!;

  // Cierre del bucle: hemos pasado del último ítem al total. Sintetizamos y
  // pedimos despedida al administrador.
  if (afterRecord.currentItemIndex >= totalItems) {
    return await finalizeRun(runId, userMessage);
  }

  // Continuación: pedimos al administrador que presente el siguiente
  // ítem.
  try {
    const admin = await callAdministrador({
      state: afterRecord,
      directive: 'presentar',
      lastUserMessage: userMessage,
    });
    appendTurn(runId, 'admin', admin.text);
    const latest = getRun(runId)!;
    return jsonOk({
      adminMessage: admin.text,
      itemIndex: latest.currentItemIndex,
      parsedLetter: parsedAnswer.letter,
      adminUsage: admin.usage,
      adminLatencyMs: admin.latencyMs,
      state: serializeFase1StateView(latest),
    });
  } catch (err) {
    return handleAnthropicError(err, 'fase1/answer present');
  }
}

async function finalizeRun(runId: string, lastUserMessage: string) {
  const state = getRun(runId)!;

  // Síntesis primero; si falla, seguimos con despedida pero devolvemos
  // synthesisError para que el operador vea qué rompió.
  let handoffPayload = null;
  let sintesisUsage = null;
  let sintesisLatencyMs: number | null = null;
  let synthesisError: string | null = null;

  try {
    const sintesis = await callSintesis({
      formulario: state.formulario,
      answers: state.answers,
    });
    markSynthesized(runId, sintesis.handoff);
    handoffPayload = sintesis.handoff;
    sintesisUsage = sintesis.usage;
    sintesisLatencyMs = sintesis.latencyMs;
  } catch (err) {
    synthesisError =
      err instanceof Error ? err.message : 'error desconocido en síntesis';
    markSynthesisError(runId, synthesisError);
  }

  // Despedida del administrador (en paralelo a la síntesis no — queremos
  // que el cierre en el log siga un orden legible).
  try {
    const admin = await callAdministrador({
      state: getRun(runId)!,
      directive: 'despedir',
      lastUserMessage,
    });
    appendTurn(runId, 'admin', admin.text);
    const latest = getRun(runId)!;
    return jsonOk({
      adminMessage: admin.text,
      itemIndex: latest.currentItemIndex,
      parsedLetter: null,
      handoff: handoffPayload,
      synthesisError,
      sintesisUsage,
      sintesisLatencyMs,
      adminUsage: admin.usage,
      adminLatencyMs: admin.latencyMs,
      state: serializeFase1StateView(latest),
    });
  } catch (err) {
    return handleAnthropicError(err, 'fase1/answer despedida');
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
