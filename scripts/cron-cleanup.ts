// scripts/cron-cleanup.ts
//
// Ejecuta `runNightly` (collect + cleanup) directamente contra la
// Postgres local/remota, sin pasar por HTTP. Útil en dev para validar
// contadores y en prod como fallback manual si el cron del host
// fallara.
//
// Uso:
//   npm run cron:cleanup           # collect + borra de verdad
//   npm run cron:cleanup:dry       # sólo cuenta (salta collect y delete)
//
// Exit code 0 si todo fue bien, 1 si explotó. `runNightly` escribe
// por su cuenta dos líneas JSON en stdout (`daily_stats_collected` y
// `cron_cleanup`); el script sólo garantiza el exit code y un
// resumen humano al final.

import { runNightly } from '../src/lib/cron/cleanup';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  try {
    const { cleanup } = await runNightly({ dryRun });
    const verb = dryRun ? 'habrían sido borradas' : 'borradas';
    console.log(
      `OK: ${cleanup.closedCount + cleanup.abandonedCount} sesiones ${verb} ` +
        `(closed=${cleanup.closedCount}, abandoned=${cleanup.abandonedCount}, ` +
        `blobs=${cleanup.blobsDeletedCount}, ${cleanup.durationMs}ms)`,
    );
    process.exit(0);
  } catch (err) {
    console.error('cron-cleanup failed:', err);
    process.exit(1);
  }
}

main();
