// scripts/fase1-to-fase2-compare.ts
//
// Atraviesa el flujo real end-to-end (formulario → Fase 1 → hand-off →
// Fase 2 → informe → cierre) contra una instancia corriendo, usando los
// 6 fixtures de Fase 1 como entrada. El Paso 12 amplía la cobertura de 3
// a 6 slugs, añade persistencia de la transcripción de Fase 2 en
// `src/fixtures/transcripts-generados/{slug}.md` y una tabla resumen al
// final con turnos + duración + status por slug.
//
// IMPORTANTE: el script simula al usuario con un set de mensajes escritos
// a mano por perfil. No es un usuario real — no alcanza los turnos
// 40/45/50 donde la app inyecta los avisos progresivos de cierre. Esa
// parte del §5.2 se verifica por revisión de código del prompt y por una
// sesión de prueba real autoadministrada por el operador (ver
// docs/paso-12-rubrica.md §3).
//
// Uso:
//   SESSION_CREATE_SECRET=... COACH_BASE_URL=https://... npm run e2e:compare
//   SESSION_CREATE_SECRET=... npm run e2e:compare -- --slug elena
//
// Si COACH_BASE_URL no se define, usa http://localhost:3000.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

const TRANSCRIPTS_DIR = join(
  process.cwd(),
  'src',
  'fixtures',
  'transcripts-generados',
);

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

// Mensajes de usuario simulados en Fase 2, por slug. Cada array intenta
// ser coherente con el perfil del hand-off piloto: Elena evasiva y
// matizando, Javier ejecutivo y directo, Lucía analítica, etc. Los
// mensajes se envían en orden; cuando se agotan, el script llama a
// phase2/finish y close. No se alcanzan los 50 turnos ni los avisos de
// cierre — eso queda para test manual del operador.
const FASE2_USER_MESSAGES_BY_SLUG: Record<string, readonly string[]> = {
  daniel: [
    'Sí, lo tengo claro. Llevo dándole vueltas dos años y medio.',
    'Mi empresa actual no da más de sí, y eso me pesa. No aprendo nada nuevo.',
    'Tengo contactos del sector que me han dicho que cuente con ellos cuando dé el paso.',
    'Puedo tirar seis meses con ahorros si no entra nada, pero no creo que llegue a ser necesario.',
    'Mi mujer al principio no lo veía claro. Ahora cree que es cuestión de tiempo.',
    'Clientes pienso tener dos o tres al mes. Tengo la red activa.',
    'No lo he pensado en detalle la verdad. Sé cómo se consulta, no tanto cómo se vende.',
    'Me refiero a empezar ya. Meses arriba o abajo no cambian nada.',
    'Independencia quiere decir que soy yo quien marca el ritmo, sin mandos intermedios.',
    'Sé que es un riesgo. Pero llevo 12 años en la misma silla, más riesgo es no moverme.',
  ],
  carmen: [
    'La verdad es que llevo meses sin dormir bien por esto.',
    'Pablo lleva diez años en la empresa. Si no le toca a él, ¿a quién?',
    'Marta no quiere saber nada desde siempre. Lo respeto.',
    'No sé si Pablo lleva realmente el barco o sólo la parte comercial.',
    'Venderla me daría tranquilidad económica. Cerrarla se me hace insoportable.',
    'El legado de mi marido pesa mucho. Él la fundó conmigo.',
    'Que quede en buenas manos significa que la gente conserve el empleo. Son 55 familias.',
    'Justo quiere decir que Pablo no reciba menos de lo que ha puesto estos años.',
    'No lo he hablado con él todavía de frente. Siempre acabamos hablando de otra cosa.',
    'Tiempo me queda, pero cada mes que pasa me cuesta más la faena.',
  ],
  elena: [
    'No sé por dónde empezar. Me suena a cosa grande y luego no sé a qué me refiero.',
    'Hay días que me levanto y pienso: no es esto.',
    'Quiero volver a ser yo. La de antes de los hijos. Pero tampoco sé muy bien quién era.',
    'Con mi marido la relación está... tranquila. No sé si es lo que debería.',
    'Mis hijos ya son mayores. La pequeña tiene 13, la mayor 16.',
    'Trabajar fuera de casa me da vértigo. Han pasado 18 años.',
    'Felicidad... no sé. A veces creo que es poder elegir cosas pequeñas para mí.',
    'Depende del día. Algunos días lo veo, otros me cuesta incluso nombrarlo.',
    'No lo he hablado con nadie. Con una amiga muy por encima, poco más.',
    'Cambiar no sé si significa irme, trabajar, o simplemente dejar de sentir lo que siento ahora.',
  ],
  javier: [
    'Lo que me falta ahora mismo es perfil internacional a nivel de board.',
    'Llevo tres años como COO. Máximo uno más y busco el salto.',
    'Lo que estoy haciendo mal es delegar poco. Lo sé pero me cuesta soltar.',
    'Mi mujer me apoya. Lo hemos hablado y tenemos un plan para los próximos años.',
    'Los niños están bien. El tiempo que les dedico lo saco yo.',
    'Éxito es llegar a CEO antes de los 48. Fin.',
    'Lo que haga falta significa viajes, horas, lo que sea. Lo tengo asumido.',
    'No, no hemos hablado en detalle qué implica en día a día. Ella conoce mi estilo desde el principio.',
    'El día después de llegar a CEO... no lo había pensado. Supongo que plantearé el siguiente objetivo.',
    'Si no llegara a CEO, me costaría. Sería un fracaso a mis ojos, sí.',
  ],
  lucia: [
    'No avanzo. Llevo año y medio dándole vueltas.',
    'Lo que no quiero lo tengo clarísimo: no quiero seguir con 60-70 horas ni con este tipo de clientes.',
    'Lo que sí quiero... no lo sé. He mirado producto, diseño, comunicación, y nada me convence del todo.',
    'Tengo 8 meses de ahorro. No voy a tirarlos sin saber adónde voy.',
    'Algo mío quiere decir algo con mi nombre al lado. Un proyecto, una empresa, no estoy segura.',
    'Propósito... suena grande. Yo sólo querría no levantarme los lunes con ganas de llorar.',
    'Encontrar mi camino, no sé muy bien qué evidencia necesito para saber que es el bueno.',
    'Necesito decidir ya porque esto me está pasando factura. Físicamente también.',
    'He hablado con dos compañeros que saltaron. Uno lo sigue de cerca, otro me desaconseja.',
    'Mi familia no sabe nada. Mis padres creen que estoy contentísima.',
  ],
  tomas: [
    'La oferta es una pasada. Es un salto que no vamos a tener dos veces.',
    'María al principio dudaba, ahora lo tiene claro. Lo hablamos el fin de semana.',
    'Las niñas lo tienen todo hablado. Van a aprender alemán y todo.',
    'Su carrera la puede retomar allí. Ya ha empezado a mirar despachos.',
    'Nuestros padres no están cerca pero vienen a vernos. Hablamos todas las semanas.',
    'El colegio lo hemos mirado. Hay un bilingüe a diez minutos del piso que queremos.',
    'No tiene que salir perfecto. Lo veo como oportunidad única y, si algo no cuadra, ajustamos.',
    'Bueno para todos significa estabilidad y una experiencia que las niñas no van a tener aquí.',
    'Cabos sueltos son los papeles del colegio y alguna gestión bancaria. Nada grave.',
    'Sí, voy a pedirle a mi jefe una despedida en condiciones. Es gente que me ha apoyado mucho.',
  ],
};

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

type TranscriptRole = 'coach' | 'usuario';
interface TranscriptEntry {
  role: TranscriptRole;
  turnNumber: number;
  estimatedLevel?: number;
  text: string;
}

function pad(value: string, width: number): string {
  if (value.length >= width) return value;
  return value + ' '.repeat(width - value.length);
}

interface Result {
  slug: string;
  status: 'ok' | 'fallo';
  coachTurns: number;
  userTurns: number;
  durationMs: number;
  parseStatus?: string;
  error?: string;
}

async function runFixture(fixture: Fase1Fixture): Promise<Result> {
  const startedAt = Date.now();
  const transcript: TranscriptEntry[] = [];
  let parseStatus: string | undefined;
  let coachTurns = 0;
  let userTurns = 0;

  try {
    console.log(`\n=== ${fixture.slug} (${fixture.label}) ===`);

    const created = await postJson<{ token: string; url: string }>(
      '/api/session/create',
      undefined,
      true,
    );
    console.log(`  sesión creada: ${created.token}`);

    await postJson(`/api/session/${created.token}/form`, {
      name: fixture.formulario.nombre,
      age: fixture.formulario.edad,
      familyContext: fixture.formulario.estado_civil_y_familia,
      location: fixture.formulario.zona_geografica,
      professionalMoment: fixture.formulario.momento_profesional,
      trigger: fixture.formulario.disparador,
    });
    console.log('  formulario enviado');

    await postJson(`/api/session/${created.token}/phase1/start`);
    for (let i = 0; i < fixture.respuestas.length; i += 1) {
      const r = fixture.respuestas[i];
      const userMessage = renderUserMessage(r.letter, r.freeText);
      const answer = await postJson<{ itemIndex: number; done: boolean }>(
        `/api/session/${created.token}/phase1/next`,
        { userMessage },
      );
      console.log(`  fase1 ${i + 1}/16 → índice ${answer.itemIndex}`);
    }

    console.log('  sintetizando hand-off…');
    await postJson(`/api/session/${created.token}/phase1/finish`);
    console.log('  hand-off persistido');

    console.log('  arrancando coach…');
    const bootstrap = await postJson<{ coachMessage: string; turnNumber: number }>(
      `/api/session/${created.token}/phase2/bootstrap`,
    );
    transcript.push({
      role: 'coach',
      turnNumber: bootstrap.turnNumber,
      text: bootstrap.coachMessage,
    });
    coachTurns += 1;
    console.log(
      `  coach turno ${bootstrap.turnNumber}: ${bootstrap.coachMessage.slice(0, 80)}…`,
    );

    const userMessages = FASE2_USER_MESSAGES_BY_SLUG[fixture.slug] ?? [];
    if (userMessages.length === 0) {
      throw new Error(`no hay mensajes de usuario para slug '${fixture.slug}'`);
    }

    let userTurnNumber = bootstrap.turnNumber + 1;
    for (const msg of userMessages) {
      transcript.push({ role: 'usuario', turnNumber: userTurnNumber, text: msg });
      userTurns += 1;
      const reply = await postJson<{
        coachMessage: string;
        turnNumber: number;
        estimatedLevel: number;
      }>(`/api/session/${created.token}/phase2/message`, { userMessage: msg });
      transcript.push({
        role: 'coach',
        turnNumber: reply.turnNumber,
        estimatedLevel: reply.estimatedLevel,
        text: reply.coachMessage,
      });
      coachTurns += 1;
      userTurnNumber = reply.turnNumber + 1;
      console.log(
        `  coach turno ${reply.turnNumber} (nivel ${reply.estimatedLevel}): ${reply.coachMessage.slice(0, 80)}…`,
      );
    }

    const finish = await postJson<{ parseStatus: string }>(
      `/api/session/${created.token}/phase2/finish`,
    );
    parseStatus = finish.parseStatus;
    console.log(`  informe persistido (parseStatus=${parseStatus})`);

    await postJson(`/api/session/${created.token}/close`);
    console.log('  sesión cerrada');

    return {
      slug: fixture.slug,
      status: 'ok',
      coachTurns,
      userTurns,
      durationMs: Date.now() - startedAt,
      parseStatus,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  fallo en fixture ${fixture.slug}: ${msg}`);
    return {
      slug: fixture.slug,
      status: 'fallo',
      coachTurns,
      userTurns,
      durationMs: Date.now() - startedAt,
      parseStatus,
      error: msg,
    };
  } finally {
    // Siempre volcar lo que haya del transcript, aunque la run haya fallado.
    writeTranscript(fixture, transcript, {
      coachTurns,
      userTurns,
      durationMs: Date.now() - startedAt,
      parseStatus,
    });
  }
}

function writeTranscript(
  fixture: Fase1Fixture,
  entries: readonly TranscriptEntry[],
  meta: {
    coachTurns: number;
    userTurns: number;
    durationMs: number;
    parseStatus?: string;
  },
): void {
  mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
  const lines: string[] = [];
  lines.push(`# Transcripción Fase 2 — ${fixture.slug}`);
  lines.push('');
  lines.push(`**Label:** ${fixture.label}`);
  lines.push('');
  lines.push('## Metadatos');
  lines.push('');
  lines.push(`- Turnos de coach: ${meta.coachTurns}`);
  lines.push(`- Turnos de usuario: ${meta.userTurns}`);
  lines.push(`- Duración total: ${(meta.durationMs / 1000).toFixed(1)} s`);
  lines.push(`- parseStatus del informe: ${meta.parseStatus ?? '—'}`);
  lines.push('');
  lines.push('## Conversación');
  lines.push('');
  for (const e of entries) {
    const level =
      e.role === 'coach' && e.estimatedLevel !== undefined
        ? ` (nivel ${e.estimatedLevel})`
        : '';
    const heading = e.role === 'coach' ? 'Coach' : 'Usuario';
    lines.push(`### ${heading} · turno ${e.turnNumber}${level}`);
    lines.push('');
    lines.push(e.text);
    lines.push('');
  }
  const outPath = join(TRANSCRIPTS_DIR, `${fixture.slug}.md`);
  writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(`  transcripción escrita en ${outPath}`);
}

function printSummary(results: readonly Result[]): void {
  const slugW = Math.max(6, ...results.map((r) => r.slug.length));
  console.log('\nResumen end-to-end:');
  console.log(
    `| ${pad('slug', slugW)} | status | turnos coach | turnos usuario | duración | parseStatus |`,
  );
  console.log(
    `|${'-'.repeat(slugW + 2)}|--------|--------------|----------------|----------|-------------|`,
  );
  for (const r of results) {
    const secs = (r.durationMs / 1000).toFixed(1);
    console.log(
      `| ${pad(r.slug, slugW)} | ${pad(r.status, 6)} | ${pad(String(r.coachTurns), 12)} | ${pad(String(r.userTurns), 14)} | ${pad(`${secs}s`, 8)} | ${pad(r.parseStatus ?? '—', 11)} |`,
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

  const results: Result[] = [];
  for (const fixture of fixtures) {
    const r = await runFixture(fixture);
    results.push(r);
  }

  printSummary(results);
  console.log(`\nTranscripciones en ${TRANSCRIPTS_DIR}`);

  if (results.some((r) => r.status === 'fallo')) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
