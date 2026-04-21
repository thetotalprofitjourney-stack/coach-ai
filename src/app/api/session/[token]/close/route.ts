import type { NextRequest } from 'next/server';

import { jsonError, jsonOk } from '@/lib/api/response';
import { prisma } from '@/lib/prisma';
import { loadSessionOrResponse } from '@/lib/session/loader';

// POST /api/session/{token}/close
// Cierre explícito del usuario (§6.2). Válido desde cualquier estado
// activo (no-`closed`). Escribe `closed_at` y transita a `closed`. Los
// datos persisten hasta que el cron nocturno (§6.4, Paso 9) los borre.
export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const loaded = await loadSessionOrResponse(token, [
    'created',
    'phase1_in_progress',
    'phase1_completed',
    'phase2_in_progress',
    'phase2_completed',
  ]);
  if (loaded instanceof Response) return loaded;
  const { session } = loaded;

  try {
    await prisma.session.update({
      where: { id: session.id },
      data: { status: 'closed', closedAt: new Date() },
    });
  } catch (err) {
    console.error('session/close', err);
    return jsonError('INTERNAL', 'No se pudo cerrar la sesión.', 500);
  }

  return jsonOk({ ok: true, status: 'closed' as const });
}
