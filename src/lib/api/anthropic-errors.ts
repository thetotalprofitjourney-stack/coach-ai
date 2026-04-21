import Anthropic from '@anthropic-ai/sdk';
import type { NextResponse } from 'next/server';

import { jsonError, type ApiErrorBody } from '@/lib/api/response';

// Mapea errores del SDK de Anthropic a NextResponse JSON. Extraído del
// endpoint dev `/api/dev/fase1/[runId]/answer` para reutilizar en todos
// los endpoints reales de Fase 1 y Fase 2.
export function handleAnthropicError(
  err: unknown,
  label: string,
): NextResponse<ApiErrorBody> {
  if (err instanceof Anthropic.AuthenticationError) {
    console.error(`${label}: autenticación rechazada`);
    return jsonError(
      'INTERNAL',
      'ANTHROPIC_API_KEY inválida o ausente.',
      500,
    );
  }
  if (err instanceof Anthropic.RateLimitError) {
    console.error(`${label}: rate limit`);
    return jsonError('INTERNAL', 'Rate limit de Anthropic.', 503);
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
