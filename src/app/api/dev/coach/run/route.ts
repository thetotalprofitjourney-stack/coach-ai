import Anthropic from '@anthropic-ai/sdk';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { HANDOFF_FIXTURE_SLUGS, getHandoffFixture } from '@/fixtures/handoffs';
import { requireSessionCreateSecret } from '@/lib/api/auth';
import { jsonError, jsonOk } from '@/lib/api/response';
import { callCoach } from '@/lib/fase2/call-coach';
import { appendCoachTurn, createRun, getRun } from '@/lib/fase2/store';
import { serializeRunStateView } from '@/lib/fase2/view';

// Permite que la respuesta tarde minutos (extended thinking del Opus 4.7
// con budget alto puede rondar 30-60 s). Sin este override el runtime de
// Node de Next.js puede cortar en 30 s por defecto.
export const maxDuration = 300;

const bodySchema = z.object({
  fixtureSlug: z
    .string()
    .refine((s) => HANDOFF_FIXTURE_SLUGS.includes(s), 'fixtureSlug desconocido'),
});

// POST /api/dev/coach/run
// Paso 5 — Fase 2 en validación aislada. Arranca una run: carga un hand-off
// fixture hardcodeado, inicializa el RunState en memoria del proceso, pide
// al coach Opus 4.7 su pregunta de apertura (§"Inicio de sesión" del prompt)
// y devuelve el runId para los turnos siguientes. Protegido con el mismo
// secreto de operador que los endpoints de creación y ping.
export async function POST(req: NextRequest) {
  const unauthorized = requireSessionCreateSecret(req);
  if (unauthorized) return unauthorized;

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

  const fixture = getHandoffFixture(parsed.data.fixtureSlug);
  if (!fixture) {
    return jsonError(
      'INVALID_INPUT',
      `Fixture ${parsed.data.fixtureSlug} no encontrado.`,
      400,
    );
  }

  const state = createRun(fixture);

  try {
    const coach = await callCoach(state);
    appendCoachTurn(state.runId, coach.text);
    const latest = getRun(state.runId);
    if (!latest) {
      return jsonError('INTERNAL', 'Run desaparecido tras su creación.', 500);
    }
    return jsonOk({
      runId: latest.runId,
      fixtureSlug: latest.fixtureSlug,
      coachMessage: coach.text,
      turnNumber: latest.coachTurnNumber,
      latencyMs: coach.latencyMs,
      usage: coach.usage,
      state: serializeRunStateView(latest),
    });
  } catch (err) {
    return handleAnthropicError(err, 'coach/run');
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
