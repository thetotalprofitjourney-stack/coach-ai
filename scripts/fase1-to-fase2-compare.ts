// scripts/fase1-to-fase2-compare.ts
//
// Atraviesa el flujo real end-to-end (formulario → Fase 1 → hand-off →
// Fase 2 → informe → cierre) contra una instancia corriendo, usando los
// 3 fixtures de Fase 1 como entrada. NO verifica la calidad del output
// del LLM; sólo que el flujo no rompe y las transiciones de estado son
// correctas. El operador lo corre tras desplegar a producción.
//
// Uso:
//   SESSION_CREATE_SECRET=... COACH_BASE_URL=https://... \
//     npx tsx scripts/fase1-to-fase2-compare.ts
//
// Si COACH_BASE_URL no se define, usa http://localhost:3000.

import { FASE1_FIXTURES } from '../src/fixtures/fase1';
import type { Fase1Fixture } from '../src/lib/fase1/types';

const BASE_URL = process.env.COACH_BASE_URL ?? 'http://localhost:3000';
const SECRET = process.env.SESSION_CREATE_SECRET;

if (!SECRET) {
  console.error(
    'ERROR: falta la variable de entorno SESSION_CREATE_SECRET. Aborto.',
  );
  process.exit(1);
}

// Tres respuestas de usuario fijas que se envían al coach en Fase 2.
// Son genéricas a propósito: lo que importa es que el bucle se ejecute,
// no la calidad de la conversación.
const FASE2_USER_MESSAGES = [
  'Sí, creo que eso resume bien lo que me preocupa.',
  'Lo he pensado varias veces, pero me cuesta concretar.',
  'Para mí estabilidad significa poder planificar sin sobresaltos.',
];

async function postJson<T>(
  path: string,
  body?: unknown,
  withSecret = false,
): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (withSecret) headers['x-session-create-secret'] = SECRET as string;
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} -> ${res.status}: ${text.slice(0, 500)}`);
  }
  return (await res.json()) as T;
}

function renderUserMessage(letter: string, freeText: string | undefined): string {
  if (!freeText || freeText.length === 0) return letter;
  return `${letter}. ${freeText}`;
}

async function runFixture(fixture: Fase1Fixture): Promise<void> {
  console.log(`\n=== ${fixture.slug} (${fixture.label}) ===`);

  // 1. Crear sesión.
  const created = await postJson<{ token: string; url: string }>(
    '/api/session/create',
    undefined,
    true,
  );
  console.log(`  sesión creada: ${created.token}`);

  // 2. Formulario inicial.
  await postJson(`/api/session/${created.token}/form`, {
    name: fixture.formulario.nombre,
    age: fixture.formulario.edad,
    familyContext: fixture.formulario.estado_civil_y_familia,
    location: fixture.formulario.zona_geografica,
    professionalMoment: fixture.formulario.momento_profesional,
    trigger: fixture.formulario.disparador,
  });
  console.log('  formulario enviado');

  // 3. Fase 1: start + 16 responses + finish.
  await postJson(`/api/session/${created.token}/phase1/start`);
  for (let i = 0; i < fixture.respuestas.length; i += 1) {
    const r = fixture.respuestas[i];
    const userMessage = renderUserMessage(r.letter, r.freeText);
    const answer = await postJson<{ itemIndex: number; done: boolean }>(
      `/api/session/${created.token}/phase1/next`,
      { userMessage },
    );
    console.log(`  item ${i + 1}/16 → índice ${answer.itemIndex}`);
  }

  console.log('  sintetizando hand-off…');
  await postJson(`/api/session/${created.token}/phase1/finish`);
  console.log('  hand-off persistido');

  // 4. Fase 2: bootstrap + N turnos + finish.
  console.log('  arrancando coach…');
  const bootstrap = await postJson<{ coachMessage: string; turnNumber: number }>(
    `/api/session/${created.token}/phase2/bootstrap`,
  );
  console.log(`  coach turno ${bootstrap.turnNumber}: ${bootstrap.coachMessage.slice(0, 80)}…`);

  for (const msg of FASE2_USER_MESSAGES) {
    const reply = await postJson<{
      coachMessage: string;
      turnNumber: number;
      estimatedLevel: number;
    }>(`/api/session/${created.token}/phase2/message`, { userMessage: msg });
    console.log(
      `  coach turno ${reply.turnNumber} (nivel ${reply.estimatedLevel}): ${reply.coachMessage.slice(0, 80)}…`,
    );
  }

  // 5. Cierre: finish (informe) + close (estado terminal).
  const finish = await postJson<{ parseStatus: string }>(
    `/api/session/${created.token}/phase2/finish`,
  );
  console.log(`  informe persistido (parseStatus=${finish.parseStatus})`);
  await postJson(`/api/session/${created.token}/close`);
  console.log('  sesión cerrada');
}

async function main() {
  for (const fixture of FASE1_FIXTURES) {
    try {
      await runFixture(fixture);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  fallo en fixture ${fixture.slug}: ${msg}`);
    }
  }
  console.log('\nFin.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
