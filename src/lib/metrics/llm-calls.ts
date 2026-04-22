// Registro best-effort de llamadas productivas a Anthropic (§7.3,
// Paso 15). Inserta una fila en `llm_calls` para que el cron nocturno
// agregue coste y latencia por día en `daily_stats`.
//
// Best-effort significa:
//   - Nunca lanza. Un fallo de la DB no rompe la respuesta del
//     endpoint ni la experiencia del usuario.
//   - Loggea con console.error (stderr) si el insert falla.
//   - El caller no necesita envolver la llamada en try/catch.
//
// Se invoca SÓLO desde rutas productivas (§7.3 del runbook del Paso
// 15). Las rutas /api/dev/* no llaman a esta función: son validación
// aislada del operador y distorsionarían los agregados.

import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { normalizeModelLabel, type LlmUsageTokens } from './pricing';

// Kinds soportados. Los 4 wrappers productivos (admin Fase 1, síntesis
// Fase 1, auxiliar Fase 2, coach Fase 2) cubren los 5 valores — el
// coach se diferencia entre `bootstrap` (primer turno, escribe toda la
// caché) y `turn` (siguientes, leen la caché) para que el operador
// pueda separar en SQL ad-hoc el coste de apertura del coste recurrente
// cuando investigue un pico.
export type LlmCallKind =
  | 'fase1_admin'
  | 'fase1_sintesis'
  | 'fase2_auxiliar'
  | 'fase2_coach_bootstrap'
  | 'fase2_coach_turn';

export interface RecordLlmCallInput {
  sessionId: string;
  model: string;
  kind: LlmCallKind;
  usage: LlmUsageTokens;
  durationMs: number;
}

export async function recordLlmCall(input: RecordLlmCallInput): Promise<void> {
  const data: Prisma.LlmCallCreateInput = {
    session: { connect: { id: input.sessionId } },
    model: normalizeModelLabel(input.model),
    kind: input.kind,
    inputTokens: input.usage.inputTokens,
    outputTokens: input.usage.outputTokens,
    cacheCreationInputTokens: input.usage.cacheCreationInputTokens,
    cacheReadInputTokens: input.usage.cacheReadInputTokens,
    durationMs: input.durationMs,
  };

  try {
    await prisma.llmCall.create({ data });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'llm_call_record_failed',
        timestamp: new Date().toISOString(),
        kind: input.kind,
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
