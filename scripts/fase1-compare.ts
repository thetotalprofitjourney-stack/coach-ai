// scripts/fase1-compare.ts
//
// Ejecuta los fixtures de usuario simulado contra los endpoints dev de
// Fase 1 (`/api/dev/fase1/run` y `/api/dev/fase1/{runId}/answer`) y
// escribe los hand-offs resultantes en `src/fixtures/handoffs-generados/`
// para que el operador los compare a ojo con los 6 hand-offs del piloto
// (`docs/handoff-0*.md`). El Paso 12 amplía la cobertura a los 6 slugs
// (daniel, carmen, elena, javier, lucia, tomas) y añade tabla resumen +
// flag `--slug`.
//
// Uso (en producción — no en dev):
//   SESSION_CREATE_SECRET=... FASE1_BASE_URL=https://... npm run fase1:compare
//   SESSION_CREATE_SECRET=... npm run fase1:compare -- --slug elena
//
// Si FASE1_BASE_URL no se define, usa http://localhost:3000. El script
// no levanta el servidor — el operador lo dispara manualmente antes.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FASE1_FIXTURES } from '../src/fixtures/fase1';
import type { Fase1Fixture } from '../src/lib/fase1/types';

const BASE_URL = process.env.FASE1_BASE_URL ?? 'http://localhost:3000';
const SECRET = process.env.SESSION_CREATE_SECRET;

if (!SECRET) {
  console.error(
    'ERROR: falta la variable de entorno SESSION_CREATE_SECRET. Aborto.',
  );
  process.exit(1);
}

const OUTPUT_DIR = join(process.cwd(), 'src', 'fixtures', 'handoffs-generados');

function parseSlugArg(): string | null {
  const idx = process.argv.indexOf('--slug');
  if (idx === -1) return null;
  const value = process.argv[idx + 1];
  if (!value) {
    console.error('ERROR: --slug requiere un valor. Aborto.');
    process.exit(1);
  }
  return value;
}

interface RunResponse {
  runId: string;
  adminMessage: string;
  itemIndex: number;
  latencyMs?: number;
  usage?: unknown;
  state: unknown;
}

interface AnswerResponse {
  adminMessage: string;
  itemIndex: number;
  parsedLetter: 'A' | 'B' | 'C' | 'D' | null;
  handoff?: unknown;
  synthesisError?: string | null;
  sintesisUsage?: unknown;
  sintesisLatencyMs?: number | null;
  adminUsage?: unknown;
  adminLatencyMs?: number;
  state: unknown;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-session-create-secret': SECRET as string,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} -> ${res.status}: ${text.slice(0, 500)}`);
  }
  return (await res.json()) as T;
}

function renderUserMessage(
  letter: string,
  freeText: string | undefined,
): string {
  if (!freeText || freeText.length === 0) return letter;
  return `${letter}. ${freeText}`;
}

async function runFixture(fixture: Fase1Fixture): Promise<unknown> {
  console.log(`\n=== ${fixture.slug} (${fixture.label}) ===`);

  const first = await postJson<RunResponse>('/api/dev/fase1/run', {
    formulario: fixture.formulario,
    fixtureSlug: fixture.slug,
  });
  console.log(`  run creado: ${first.runId}`);

  let lastAnswer: AnswerResponse | null = null;
  for (let i = 0; i < fixture.respuestas.length; i += 1) {
    const r = fixture.respuestas[i];
    const userMessage = renderUserMessage(r.letter, r.freeText);
    lastAnswer = await postJson<AnswerResponse>(
      `/api/dev/fase1/${first.runId}/answer`,
      { userMessage },
    );
    const progress = `item ${i + 1}/16 → índice ${lastAnswer.itemIndex}`;
    if (lastAnswer.synthesisError) {
      console.log(`  ${progress}  [síntesis: ERROR ${lastAnswer.synthesisError}]`);
    } else if (lastAnswer.handoff) {
      console.log(`  ${progress}  [síntesis: OK]`);
    } else {
      console.log(`  ${progress}`);
    }
  }

  if (!lastAnswer || !lastAnswer.handoff) {
    throw new Error(
      `fixture ${fixture.slug}: no se produjo hand-off. synthesisError=${
        lastAnswer?.synthesisError ?? 'desconocido'
      }`,
    );
  }

  return lastAnswer.handoff;
}

interface Result {
  slug: string;
  status: 'ok' | 'fallo';
  durationMs: number;
  error?: string;
}

function pad(value: string, width: number): string {
  if (value.length >= width) return value;
  return value + ' '.repeat(width - value.length);
}

function printSummary(results: readonly Result[]): void {
  const slugW = Math.max(6, ...results.map((r) => r.slug.length));
  const header = `| ${pad('slug', slugW)} | status | duración |`;
  const sep = `|${'-'.repeat(slugW + 2)}|--------|----------|`;
  console.log('\nResumen Fase 1:');
  console.log(header);
  console.log(sep);
  for (const r of results) {
    const secs = (r.durationMs / 1000).toFixed(1);
    console.log(
      `| ${pad(r.slug, slugW)} | ${pad(r.status, 6)} | ${pad(`${secs}s`, 8)} |`,
    );
  }
  const failed = results.filter((r) => r.status === 'fallo');
  if (failed.length > 0) {
    console.log(
      `\nFallaron ${failed.length}/${results.length}: ${failed.map((r) => r.slug).join(', ')}`,
    );
  }
}

async function main() {
  const slugFilter = parseSlugArg();
  const fixtures = slugFilter
    ? FASE1_FIXTURES.filter((f) => f.slug === slugFilter)
    : FASE1_FIXTURES;

  if (fixtures.length === 0) {
    console.error(
      `ERROR: no existe ningún fixture con slug '${slugFilter}'. ` +
        `Disponibles: ${FASE1_FIXTURES.map((f) => f.slug).join(', ')}`,
    );
    process.exit(1);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const results: Result[] = [];

  for (const fixture of fixtures) {
    const startedAt = Date.now();
    try {
      const handoff = await runFixture(fixture);
      const outPath = join(OUTPUT_DIR, `${fixture.slug}.json`);
      writeFileSync(outPath, JSON.stringify(handoff, null, 2), 'utf8');
      console.log(`  hand-off escrito en ${outPath}`);
      results.push({
        slug: fixture.slug,
        status: 'ok',
        durationMs: Date.now() - startedAt,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  fallo en fixture ${fixture.slug}: ${msg}`);
      results.push({
        slug: fixture.slug,
        status: 'fallo',
        durationMs: Date.now() - startedAt,
        error: msg,
      });
    }
  }

  printSummary(results);
  console.log(`\nHand-offs en ${OUTPUT_DIR}`);

  if (results.some((r) => r.status === 'fallo')) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
