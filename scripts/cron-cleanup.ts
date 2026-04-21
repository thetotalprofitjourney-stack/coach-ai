// scripts/cron-cleanup.ts
//
// Ejecuta `runCleanup` directamente contra la Postgres local/remota,
// sin pasar por HTTP. Útil en dev para validar contadores y en prod
// como fallback manual si Vercel Cron fallara.
//
// Uso:
//   npm run cron:cleanup           # borra de verdad
//   npm run cron:cleanup:dry       # solo cuenta
//
// Exit code 0 si todo fue bien, 1 si explotó. El log estructurado
// con los contadores lo escribe `runCleanup` por su cuenta; el
// script sólo garantiza el exit code y un mensaje humano al final.

import { runCleanup } from '../src/lib/cron/cleanup';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  try {
    const report = await runCleanup({ dryRun });
    const verb = dryRun ? 'habrían sido borradas' : 'borradas';
    console.log(
      `OK: ${report.closedCount + report.abandonedCount} sesiones ${verb} ` +
        `(closed=${report.closedCount}, abandoned=${report.abandonedCount}, ` +
        `blobs=${report.blobsDeletedCount}, ${report.durationMs}ms)`,
    );
    process.exit(0);
  } catch (err) {
    console.error('cron-cleanup failed:', err);
    process.exit(1);
  }
}

main();
