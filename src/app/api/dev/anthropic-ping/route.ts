import Anthropic from '@anthropic-ai/sdk';
import type { NextRequest } from 'next/server';
import { requireSessionCreateSecret } from '@/lib/api/auth';
import { jsonError, jsonOk } from '@/lib/api/response';
import { pingRequestSchema, type PingResponse } from '@/lib/api/schemas';
import { runAnthropicPing } from '@/lib/anthropic/ping';

// POST /api/dev/anthropic-ping
// Endpoint interno del Paso 4 (docs/proyecto-completo.md §7.1): llamada
// básica al SDK de Anthropic con prompt caching activado. El operador lo
// invoca manualmente con curl para verificar credenciales, caching y
// latencia. No se llama desde el frontend — nunca — y nunca recibe
// identificadores del usuario final (§6.4).
//
// Reutiliza la guardia de autenticación de POST /api/session/create, de modo
// que no hay una env var nueva; el "secreto del operador" es uno solo.
export async function POST(req: NextRequest) {
  const unauthorized = requireSessionCreateSecret(req);
  if (unauthorized) return unauthorized;

  let body: unknown = {};
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      body = await req.json();
    } catch {
      return jsonError('INVALID_INPUT', 'JSON inválido en el cuerpo.', 400);
    }
  }

  const parsed = pingRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      'INVALID_INPUT',
      'Parámetros de ping inválidos.',
      400,
      parsed.error.flatten(),
    );
  }

  try {
    const result = await runAnthropicPing(parsed.data);
    const response: PingResponse = {
      model: result.model,
      text: result.text,
      latencyMs: result.latencyMs,
      usage: result.usage,
    };
    return jsonOk(response);
  } catch (err) {
    // Errores tipados del SDK — usar instanceof, nunca string matching.
    if (err instanceof Anthropic.AuthenticationError) {
      console.error('anthropic-ping: autenticación rechazada');
      return jsonError(
        'INTERNAL',
        'ANTHROPIC_API_KEY inválida o ausente en el servidor.',
        500,
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      console.error('anthropic-ping: rate limit');
      return jsonError('INTERNAL', 'Rate limit de Anthropic alcanzado.', 503);
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`anthropic-ping: APIError ${err.status}`);
      return jsonError(
        'INTERNAL',
        `Anthropic respondió con error ${err.status}.`,
        502,
      );
    }
    console.error('anthropic-ping: error inesperado', err);
    return jsonError('INTERNAL', 'Fallo al llamar a Anthropic.', 500);
  }
}
