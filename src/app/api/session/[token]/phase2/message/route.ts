import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { handleAnthropicError } from '@/lib/api/anthropic-errors';
import { jsonError } from '@/lib/api/response';
import { ndjsonStreamResponse } from '@/lib/api/ndjson-stream';
import { callAuxiliar } from '@/lib/fase2/call-auxiliar';
import { callCoachStream } from '@/lib/fase2/call-coach';
import type { RunState } from '@/lib/fase2/types';
import { recordLlmCall } from '@/lib/metrics/llm-calls';
import { prisma } from '@/lib/prisma';
import { loadSessionOrResponse } from '@/lib/session/loader';
import {
  canonicalHandoff,
  reconstructFase2RunState,
} from '@/lib/session/reconstruct';

// Coach (Opus 4.7 + thinking 10k) + auxiliar (Haiku). El auxiliar corre
// antes del coach para inyectar el resumen actualizado en el siguiente
// prompt. Budget 240s para un margen holgado en turnos con más thinking.
export const maxDuration = 300;

const bodySchema = z.object({
  userMessage: z.string().min(1).max(8000),
});

// POST /api/session/{token}/phase2/message
// Un turno completo: persistir respuesta del usuario, correr auxiliar,
// correr coach, persistir turno del coach + state actualizado. No detecta
// cierre — el cliente dispara /phase2/finish cuando el coach emita el
// informe de cierre (§5.4).
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const loaded = await loadSessionOrResponse(token, ['phase2_in_progress']);
  if (loaded instanceof Response) return loaded;
  const { session } = loaded;

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

  const [handoffRow, stateRow, turnRows] = await Promise.all([
    prisma.phase1Handoff.findUnique({ where: { sessionId: session.id } }),
    prisma.phase2State.findUnique({ where: { sessionId: session.id } }),
    prisma.phase2Turn.findMany({ where: { sessionId: session.id } }),
  ]);

  if (!handoffRow || !stateRow) {
    return jsonError(
      'INVALID_STATE',
      'Fase 2 no está inicializada. Invoca /phase2/bootstrap primero.',
      409,
    );
  }

  let handoff;
  try {
    handoff = canonicalHandoff(handoffRow.handoffContent);
  } catch (err) {
    console.error('phase2/message hand-off inválido', err);
    return jsonError('INTERNAL', 'Hand-off persistido no cumple el schema.', 500);
  }

  const state = reconstructFase2RunState(session, handoff, turnRows, stateRow);

  // El último turno persistido debe ser coach. Si es user, alguien ya
  // respondió pero aún no hemos generado la contrarréplica del coach —
  // situación anómala.
  const lastTurn = state.turns[state.turns.length - 1];
  if (!lastTurn || lastTurn.role !== 'coach') {
    return jsonError(
      'INVALID_STATE',
      'El último turno persistido no es del coach.',
      409,
    );
  }

  // coachTurnNumber is the max turn number of coach turns. The next user
  // turn occupies coachTurnNumber+1 and the coach reply coachTurnNumber+2.
  const userTurnNumber = state.coachTurnNumber + 1;
  const withUser: RunState = {
    ...state,
    turns: [
      ...state.turns,
      { role: 'user', content: userMessage, turnNumber: userTurnNumber },
    ],
  };

  // Auxiliar: actualiza resumen, hipótesis, nivel, términos.
  let auxiliarOutput;
  try {
    const auxiliar = await callAuxiliar(withUser);
    auxiliarOutput = auxiliar.output;
    await recordLlmCall({
      sessionId: session.id,
      model: auxiliar.model,
      kind: 'fase2_auxiliar',
      usage: auxiliar.usage,
      durationMs: auxiliar.latencyMs,
    });
  } catch (err) {
    return handleAnthropicError(err, 'phase2/message auxiliar');
  }

  const exploredSet = new Set(state.hypothesesExplored);
  for (const id of auxiliarOutput.hipotesis_tocadas) exploredSet.add(id);
  const newResolvedSet = new Set(state.subjectiveTermsResolved);
  const newPendingList = [...state.subjectiveTermsPending];
  for (const term of auxiliarOutput.nuevos_terminos_subjetivos) {
    if (!newResolvedSet.has(term) && !newPendingList.includes(term)) {
      newPendingList.push(term);
    }
  }
  const allHypothesisIds = handoff.observaciones_y_tensiones.map((h) => h.id);
  const newExplored = Array.from(exploredSet);
  const newPending = allHypothesisIds.filter((id) => !exploredSet.has(id));

  const coachState: RunState = {
    ...withUser,
    runningSummary: auxiliarOutput.nuevo_resumen,
    estimatedLevel: auxiliarOutput.nivel_estimado,
    hypothesesExplored: newExplored,
    hypothesesPending: newPending,
    subjectiveTermsPending: newPendingList,
  };

  const nextCoachTurnNumber = state.coachTurnNumber + 2;

  // A partir de aquí abrimos un stream NDJSON hacia el cliente. Mientras
  // Opus genera tokens emitimos {type:'delta'}; al terminar persistimos el
  // turno y el estado en una única transacción y emitimos {type:'done'}.
  // Cualquier fallo después de abrir el stream viaja como {type:'error'}
  // en el propio stream — ya respondimos 200 OK con los headers.
  return ndjsonStreamResponse(async (emit) => {
    let coachResult;
    try {
      coachResult = await callCoachStream(coachState, (delta) => {
        emit({ type: 'delta', text: delta });
      });
    } catch (err) {
      console.error('phase2/message coach stream', err);
      emit({
        type: 'error',
        code: 'INTERNAL',
        message: 'Fallo generando la respuesta del coach.',
      });
      return;
    }

    await recordLlmCall({
      sessionId: session.id,
      model: coachResult.model,
      kind: 'fase2_coach_turn',
      usage: coachResult.usage,
      durationMs: coachResult.latencyMs,
    });

    try {
      await prisma.$transaction(async (tx) => {
        await tx.phase2Turn.create({
          data: {
            sessionId: session.id,
            turnNumber: userTurnNumber,
            role: 'user',
            content: userMessage,
          },
        });
        await tx.phase2Turn.create({
          data: {
            sessionId: session.id,
            turnNumber: nextCoachTurnNumber,
            role: 'coach',
            content: coachResult.text,
          },
        });
        await tx.phase2State.update({
          where: { sessionId: session.id },
          data: {
            currentLevel: auxiliarOutput.nivel_estimado,
            runningSummary: auxiliarOutput.nuevo_resumen,
            hypothesesExplored: newExplored,
            subjectiveTermsPending: newPendingList,
          },
        });
      });
    } catch (err) {
      console.error('phase2/message persistencia', err);
      emit({
        type: 'error',
        code: 'INTERNAL',
        message: 'No se pudo persistir el turno.',
      });
      return;
    }

    emit({
      type: 'done',
      turnNumber: nextCoachTurnNumber,
      totalTurns: 50,
      estimatedLevel: auxiliarOutput.nivel_estimado,
    });
  });
}
