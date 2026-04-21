import type { NextRequest } from 'next/server';

import { jsonError, jsonOk } from '@/lib/api/response';
import { runNightly } from '@/lib/cron/cleanup';

// GET /api/cron/cleanup
// Invocado por el cron del host en la ventana 3:00-5:00 hora local
// (§6.3, runbook §8). Autenticado con `Authorization: Bearer $CRON_SECRET`.
// `?dryRun=1` simula el borrado (contadores verdaderos, sin efectos,
// sin tocar `daily_stats`).
//
// Desde Paso 14 el endpoint dispara dos stages encadenados:
//   1. `collectDailyStats` — agrega ayer-UTC a `daily_stats` (§7.3).
//   2. hard delete de sesiones closed y abandonadas.
// Si el collect falla, el cleanup NO corre y la ruta devuelve 500.
//
// maxDuration alto porque `percentile_cont` y los dos `findMany` pueden
// tardar con volumen alto.
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
    const nightly = await runNightly({ dryRun });
    return jsonOk({ ok: true, ...nightly });
  } catch (err) {
    console.error('cron/cleanup', err);
    return jsonError('INTERNAL', 'Fallo en el cron nocturno.', 500);
  }
}
