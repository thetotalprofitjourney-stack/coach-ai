import Anthropic from '@anthropic-ai/sdk';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSessionCreateSecret } from '@/lib/api/auth';
import { jsonError, jsonOk } from '@/lib/api/response';
import { callAdministrador } from '@/lib/fase1/call-administrador';
import { appendTurn, createRun, getRun } from '@/lib/fase1/store';
import { serializeFase1StateView } from '@/lib/fase1/view';

// El administrador es rápido (Haiku sin thinking), pero la llamada
// puede encadenarse con la verificación del secreto y unos milisegundos
// de overhead. 60s es amplio y consistente con los otros endpoints dev.
export const maxDuration = 60;

const formularioSchema = z.object({
  alias: z.string().min(1),
  edad: z.number().int().min(0).max(120),
  estado_civil_y_familia: z.string().min(1),
  momento_profesional: z.string().min(1),
  disparador: z.string().min(1),
  reto_dominio: z.enum(['personal', 'profesional', 'general']),
});

const bodySchema = z.object({
  formulario: formularioSchema,
  fixtureSlug: z.string().min(1).optional(),
});

// POST /api/dev/fase1/run
// Arranca una run de Fase 1 aislada en memoria (sin Prisma). Recibe el
// formulario inicial del usuario y opcionalmente un slug de fixture
// para trazabilidad. Llama al administrador (Haiku) para que produzca
// el primer mensaje con el ítem 0. Devuelve runId + mensaje + estado.
//
// Protegido con el mismo secreto de operador que los endpoints de
// creación, ping y coach dev. El operador lo usa desde curl o el
// script fase1:compare; nunca desde el frontend.
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

  const state = createRun({
    formulario: parsed.data.formulario,
    fixtureSlug: parsed.data.fixtureSlug ?? null,
  });

  try {
    const admin = await callAdministrador({
      state,
      directive: 'presentar',
      lastUserMessage: '',
    });
    appendTurn(state.runId, 'admin', admin.text);
    const latest = getRun(state.runId);
    if (!latest) {
      return jsonError('INTERNAL', 'Run desaparecido tras su creación.', 500);
    }
    return jsonOk({
      runId: latest.runId,
      adminMessage: admin.text,
      itemIndex: latest.currentItemIndex,
      latencyMs: admin.latencyMs,
      usage: admin.usage,
      state: serializeFase1StateView(latest),
    });
  } catch (err) {
    return handleAnthropicError(err, 'fase1/run');
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
