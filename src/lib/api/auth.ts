import { timingSafeEqual } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import { jsonError } from './response';

// Protege POST /api/session/create. En producción espera un secreto compartido
// con el sistema que invoca el endpoint (inicialmente tests; en el Paso 10,
// el webhook de Stripe). En desarrollo, `ALLOW_UNAUTHENTICATED_SESSION_CREATE=true`
// deshabilita el check explícitamente — no se deriva de NODE_ENV para evitar
// que un despliegue mal configurado debilite producción por accidente.
export function requireSessionCreateSecret(req: NextRequest): NextResponse | null {
  if (process.env.ALLOW_UNAUTHENTICATED_SESSION_CREATE === 'true') {
    return null;
  }

  const expected = process.env.SESSION_CREATE_SECRET;
  if (!expected) {
    return jsonError(
      'INTERNAL',
      'SESSION_CREATE_SECRET no está configurado en el servidor.',
      500,
    );
  }

  const provided = req.headers.get('x-session-create-secret') ?? '';
  if (!secretsMatch(provided, expected)) {
    return jsonError('UNAUTHORIZED', 'Credenciales inválidas.', 401);
  }

  return null;
}

function secretsMatch(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  // timingSafeEqual exige longitudes iguales; comparamos primero longitudes
  // contra un buffer del mismo tamaño para no filtrar tamaño por timing.
  if (aBuf.length !== bBuf.length) {
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}
