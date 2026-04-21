import type { NextRequest } from 'next/server';
import { requireSessionCreateSecret } from '@/lib/api/auth';
import { jsonError, jsonOk } from '@/lib/api/response';
import { createSessionRow } from '@/lib/session/create';

// POST /api/session/create
// Wrapper HTTP delgado sobre `createSessionRow()`. Mantenido por
// compatibilidad con los smoke tests y como fallback del operador; el
// camino productivo es el webhook de Stripe, que llama al helper
// directamente sin pasar por HTTP (Paso 10, §2.2 / §3.1).
export async function POST(req: NextRequest) {
  const unauthorized = requireSessionCreateSecret(req);
  if (unauthorized) return unauthorized;

  try {
    const payload = await createSessionRow();
    return jsonOk(payload, 201);
  } catch (err) {
    console.error('POST /api/session/create failed', err);
    return jsonError('INTERNAL', 'No se pudo crear la sesión.', 500);
  }
}
