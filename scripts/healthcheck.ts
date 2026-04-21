// scripts/healthcheck.ts
//
// Canary post-deploy del Paso 13. Hace GET a las rutas públicas del
// producto y valida que cada una devuelve 200. No pasa por Stripe ni
// por Anthropic: cubre el hecho de que el container arrancó, el
// reverse proxy propaga correctamente, el DNS está resuelto y los
// Server Components renderizan. Para validar el pipeline completo
// (webhook, Fase 1, Fase 2, informe), usar `fase1:compare` y
// `e2e:compare` — este script es el canary ligero que corre en
// segundos tras cada deploy.
//
// Uso:
//   COACH_BASE_URL=https://tu-dominio.tld npm run healthcheck
//
// Exit 0 si todas las rutas responden 200. Exit 1 a la primera que
// falle, con un resumen en stdout de lo que se comprobó y lo que
// rompió.

type Probe = {
  path: string;
  expectedStatus: number;
  name: string;
};

const PROBES: Probe[] = [
  { path: '/', expectedStatus: 200, name: 'landing' },
  { path: '/privacidad', expectedStatus: 200, name: 'privacidad' },
  { path: '/pay/cancelled', expectedStatus: 200, name: 'pay-cancelled' },
  { path: '/robots.txt', expectedStatus: 200, name: 'robots' },
  { path: '/icon.svg', expectedStatus: 200, name: 'favicon' },
];

type Result = {
  name: string;
  path: string;
  status: number | 'ERROR';
  ok: boolean;
  durationMs: number;
  error?: string;
};

async function probe(baseUrl: string, p: Probe): Promise<Result> {
  const url = `${baseUrl}${p.path}`;
  const started = Date.now();
  try {
    const res = await fetch(url, { redirect: 'manual' });
    const durationMs = Date.now() - started;
    return {
      name: p.name,
      path: p.path,
      status: res.status,
      ok: res.status === p.expectedStatus,
      durationMs,
    };
  } catch (err) {
    return {
      name: p.name,
      path: p.path,
      status: 'ERROR',
      ok: false,
      durationMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  const baseUrl = process.env.COACH_BASE_URL?.replace(/\/$/, '');
  if (!baseUrl) {
    console.error('COACH_BASE_URL es obligatorio. Ej: https://coach.example.tld');
    process.exit(1);
  }

  console.log(`healthcheck → ${baseUrl}`);
  const results: Result[] = [];
  for (const p of PROBES) {
    const r = await probe(baseUrl, p);
    results.push(r);
    const mark = r.ok ? 'ok' : 'FAIL';
    const statusStr = typeof r.status === 'number' ? r.status : r.status;
    console.log(
      `  [${mark}] ${p.name.padEnd(14)} ${p.path.padEnd(16)} → ${statusStr} (${r.durationMs}ms)`,
    );
    if (r.error) console.log(`          ${r.error}`);
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`\n${failed.length}/${results.length} probes fallaron.`);
    process.exit(1);
  }
  console.log(`\nOK: ${results.length}/${results.length} probes en verde.`);
  process.exit(0);
}

main();
