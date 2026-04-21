import type { NextRequest } from 'next/server';

import { jsonError, jsonOk } from '@/lib/api/response';
import { runCleanup } from '@/lib/cron/cleanup';

// GET /api/cron/cleanup
// Invocado por Vercel Cron en la ventana 3:00-5:00 hora local (§6.3).
// Autenticado con `Authorization: Bearer $CRON_SECRET`: Vercel Cron lo
// inyecta automáticamente si la env var existe en el proyecto, y el
// operador puede replicar el header con `curl` para ejecutarlo a mano.
// `?dryRun=1` simula sin borrar (contadores verdaderos, sin efectos).
//
// maxDuration alto por si el volumen crece: la operación es un par de
// deleteMany con cascade, pero el índice (status, created_at) y el
// número de sesiones no están acotados.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return jsonError('INTERNAL', 'CRON_SECRET no configurado.', 500);
  }

  const header = req.headers.get('authorization') ?? '';
  if (header !== `Bearer ${secret}`) {
    return jsonError('UNAUTHORIZED', 'Credenciales inválidas.', 401);
  }

  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1';

  try {
    const report = await runCleanup({ dryRun });
    return jsonOk({ ok: true, ...report });
  } catch (err) {
    console.error('cron/cleanup', err);
    return jsonError('INTERNAL', 'Fallo en la limpieza.', 500);
  }
}
