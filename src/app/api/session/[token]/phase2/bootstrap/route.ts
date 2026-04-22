import type { NextRequest } from 'next/server';

import { jsonError } from '@/lib/api/response';
import { ndjsonStreamResponse } from '@/lib/api/ndjson-stream';
import { callCoachStream } from '@/lib/fase2/call-coach';
import { recordLlmCall } from '@/lib/metrics/llm-calls';
import { prisma } from '@/lib/prisma';
import { loadSessionOrResponse, transitionStatus } from '@/lib/session/loader';
import {
  canonicalHandoff,
  reconstructFase2RunState,
} from '@/lib/session/reconstruct';

// Primera llamada al coach (Opus 4.7 + thinking 10k). Tarda 20-40s.
export const maxDuration = 120;

// POST /api/session/{token}/phase2/bootstrap
// Sólo válido desde `phase1_completed`. Llama al coach con turnos vacíos
// para obtener su primera pregunta y, en la misma transacción, crea el
// Phase2State inicial + el primer Phase2Turn + transición a phase2_in_progress.
// Si la llamada al coach falla, no persistimos nada: la sesión queda en
// phase1_completed y el cliente puede reintentar.
export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const loaded = await loadSessionOrResponse(token, ['phase1_completed']);
  if (loaded instanceof Response) return loaded;
  const { session } = loaded;

  const handoffRow = await prisma.phase1Handoff.findUnique({
    where: { sessionId: session.id },
  });
  if (!handoffRow) {
    return jsonError(
      'INVALID_STATE',
      'No hay hand-off persistido para esta sesión.',
      409,
    );
  }

  let handoff;
  try {
    handoff = canonicalHandoff(handoffRow.handoffContent);
  } catch (err) {
    console.error('phase2/bootstrap hand-off inválido', err);
    return jsonError('INTERNAL', 'Hand-off persistido no cumple el schema.', 500);
  }

  const state = reconstructFase2RunState(session, handoff, [], null);

  // Igual que /phase2/message: abrimos stream NDJSON y emitimos tokens según
  // llegan. Al terminar, creamos Phase2State + primer Phase2Turn y hacemos
  // la transición de estado en una única transacción. Si algo falla después
  // de abrir el stream, emitimos {type:'error'}.
  return ndjsonStreamResponse(async (emit) => {
    let coachResult;
    try {
      coachResult = await callCoachStream(state, (delta) => {
        emit({ type: 'delta', text: delta });
      });
    } catch (err) {
      console.error('phase2/bootstrap coach stream', err);
      emit({
        type: 'error',
        code: 'INTERNAL',
        message: 'Fallo generando la primera pregunta del coach.',
      });
      return;
    }

    await recordLlmCall({
      sessionId: session.id,
      model: coachResult.model,
      kind: 'fase2_coach_bootstrap',
      usage: coachResult.usage,
      durationMs: coachResult.latencyMs,
    });

    let transitioned = false;
    try {
      transitioned = await prisma.$transaction(async (tx) => {
        await tx.phase2State.create({
          data: {
            sessionId: session.id,
            currentLevel: 1,
            hypothesesExplored: [],
            runningSummary: '',
            subjectiveTermsResolved: [],
            subjectiveTermsPending: [...handoff.terminos_subjetivos],
          },
        });
        await tx.phase2Turn.create({
          data: {
            sessionId: session.id,
            turnNumber: 1,
            role: 'coach',
            content: coachResult.text,
          },
        });
        return transitionStatus(
          tx,
          session.id,
          'phase1_completed',
          'phase2_in_progress',
        );
      });
    } catch (err) {
      console.error('phase2/bootstrap persistencia', err);
      emit({
        type: 'error',
        code: 'INTERNAL',
        message: 'No se pudo arrancar Fase 2.',
      });
      return;
    }

    if (!transitioned) {
      emit({
        type: 'error',
        code: 'INVALID_STATE',
        message: 'La sesión cambió de estado durante el arranque.',
      });
      return;
    }

    emit({
      type: 'done',
      turnNumber: 1,
      status: 'phase2_in_progress' as const,
    });
  });
}
