# Coach AI

Aplicación web de una sesión única de coaching profesional asistida por IA,
completamente anónima, sin registro ni persistencia más allá de la sesión.
Especificación completa en [`docs/`](./docs/README.md).

## Estado actual

Paso 8 — materialización del informe final como PDF y DOCX descargables
y ciclo de vida de la sesión tras la descarga. En el estado
`phase2_completed` la pantalla `/session/{token}` muestra el informe
con dos botones primarios ("Descargar PDF" / "Descargar Word") además
del "Cerrar sesión" explícito (ahora secundario). Los dos entregables
se renderizan bajo demanda (pdfkit para PDF, docx para DOCX) con
portada (nombre + fecha), 11 bloques con los títulos de §5.4 y pie
sobrio "Informe generado por Coach AI — DD/MM/YYYY". La primera
descarga marca `FinalReport.downloadedAt` de forma idempotente y
arranca un temporizador client-side de 10 min (§2.6): transcurrido el
plazo o al pulsar el botón, la sesión transita a `closed`. Si el
usuario recarga la página dentro de esa ventana, el timer se reanuda
con el remanente calculado desde `downloadedAt`. Intento de descarga
con `status='closed'` → 410 `SESSION_CLOSED`. Paso 9 (cron nocturno)
queda fuera; los ficheros no se persisten, sólo se regeneran al vuelo
desde `FinalReport.reportContent`.

Endpoints activos:

- `POST /api/session/create` — crea una sesión anónima (UUID v4) en estado
  `created`. Protegido con el header `X-Session-Create-Secret`.
- `POST /api/session/{token}/form` — recibe el formulario inicial (§2.3),
  valida con Zod, guarda los datos y transiciona a `phase1_in_progress`.
- `POST /api/session/{token}/phase1/start` — devuelve el primer mensaje
  del administrador. Idempotente; los turnos de Fase 1 no se persisten.
- `POST /api/session/{token}/phase1/next` — respuesta del usuario al ítem
  actual. Upserta `phase1_responses` y pide al administrador el siguiente
  mensaje (o la despedida tras el ítem 16).
- `POST /api/session/{token}/phase1/finish` — dispara la síntesis con
  Sonnet 4.6, persiste `phase1_handoff` y transiciona a
  `phase1_completed`. `maxDuration=300`.
- `POST /api/session/{token}/phase2/bootstrap` — crea `phase2_state`
  inicial, emite el primer turno del coach y transiciona a
  `phase2_in_progress`. Requiere `phase1_completed`.
- `POST /api/session/{token}/phase2/message` — un turno completo: corre
  auxiliar (Haiku), actualiza `phase2_state` y emite la siguiente
  pregunta del coach (Opus 4.7 + thinking 10k).
- `POST /api/session/{token}/phase2/finish` — parsea los 11 bloques del
  último turno del coach, persiste `final_reports` y transiciona a
  `phase2_completed`.
- `GET /api/session/{token}/report/pdf` — renderiza y sirve el informe
  final como PDF (`application/pdf`, attachment). Sólo desde
  `phase2_completed`; 410 `SESSION_CLOSED` si la sesión ya se cerró.
  La primera descarga marca `FinalReport.downloadedAt`.
- `GET /api/session/{token}/report/docx` — gemelo del anterior para
  formato Word (`vnd.openxmlformats-officedocument.wordprocessingml.document`).
  Comparte loader y marcado idempotente de `downloadedAt`.
- `POST /api/session/{token}/close` — transición terminal a `closed`
  desde cualquier estado activo.
- `POST /api/dev/anthropic-ping` — endpoint interno del operador.
  Hace una llamada real al SDK de Anthropic con prompt caching y devuelve
  la respuesta, las métricas de `usage` y la latencia. Reutiliza el mismo
  header `X-Session-Create-Secret`. No se invoca desde el frontend.
- `POST /api/dev/coach/run` — arranca una run de validación aislada del
  coach con un hand-off fixture. Devuelve `runId` y el primer turno del
  coach. Mismo header de operador.
- `POST /api/dev/coach/{runId}/turn` — envía una respuesta del usuario,
  corre la auxiliar, el coach responde y devuelve todo junto al operador.
- `POST /api/dev/fase1/run` — arranca una run aislada de Fase 1 con un
  formulario inicial (y opcionalmente un `fixtureSlug` para trazabilidad).
  Devuelve `runId` y el primer mensaje del administrador con el ítem 0.
  Mismo header de operador.
- `POST /api/dev/fase1/{runId}/answer` — un turno del usuario en la
  Fase 1. Parsea la letra, registra la respuesta, pide al administrador
  el siguiente mensaje y, al responder al ítem 16, dispara la síntesis
  del hand-off con Sonnet 4.6 + extended thinking.

Rutas activas:

- `GET /session/{token}` — pantalla pública anónima. Pinta el componente
  correspondiente al `Session.status`: formulario inicial (`created`),
  chat con el administrador DISC (`phase1_in_progress`), transición con
  spinner (`phase1_completed`), chat con el coach (`phase2_in_progress`),
  informe de 11 bloques (`phase2_completed`), pantalla final (`closed`).
  Token inválido o inexistente → 404.

## Paso 7 — smoke test end-to-end

El script `scripts/fase1-to-fase2-compare.ts` atraviesa el flujo real
completo (create → form → phase1/\* → phase2/\* → close) con los 3
fixtures simulados (`daniel`, `carmen`, `tomas`). No verifica calidad
del output del LLM: sólo confirma que el flujo no rompe y que las
transiciones de estado son correctas.

```bash
SESSION_CREATE_SECRET=... COACH_BASE_URL=https://... \
  npm run e2e:compare
```

Cada fixture crea una sesión real. Inspeccionar resultado con
`npm run db:studio` — cada sesión debe acabar en `status='closed'`, con
16 filas en `phase1_responses`, un `phase1_handoff`, N filas en
`phase2_turns`, un `phase2_state` y un `final_reports`.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS
- PostgreSQL 16
- Prisma ORM
- Node 20 LTS

## Quickstart

Requisitos: Node 20+, Docker (para la Postgres local).

```bash
# 1. instalar dependencias
npm install

# 2. levantar Postgres local (docker-compose, puerto 5433)
npm run db:up

# 3. configurar entorno
cp .env.example .env

# 4. aplicar la primera migración
npm run db:migrate

# 5. abrir Prisma Studio (opcional, para inspeccionar el schema)
npm run db:studio

# 6. arrancar el servidor de dev
npm run dev
```

La app estará disponible en `http://localhost:3000`.

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo Next.js |
| `npm run build` | `prisma generate` + build de producción |
| `npm run start` | Sirve el build de producción |
| `npm run lint` | ESLint (Next) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:up` / `db:down` | Arranca/para Postgres local (docker-compose) |
| `npm run db:migrate` | `prisma migrate dev` (nuevas migraciones en dev) |
| `npm run db:migrate:deploy` | `prisma migrate deploy` (aplicar en prod/CI) |
| `npm run db:generate` | Regenera el cliente Prisma |
| `npm run db:studio` | Abre Prisma Studio |
| `npm run db:reset` | Borra la DB y rehace migraciones (sólo dev) |
| `npm run db:seed` | Ejecuta `prisma/seed.ts` (no-op en el Paso 1) |
| `npm run fase1:compare` | Corre los 3 fixtures simulados de Fase 1 contra los endpoints dev y escribe los hand-offs generados en `src/fixtures/handoffs-generados/` |

## Estructura

```
coach-ai/
├── docs/                 # especificación completa del producto
├── prisma/               # schema.prisma + migraciones (commiteadas)
├── src/
│   ├── app/              # Next.js App Router (placeholder por ahora)
│   ├── lib/prisma.ts     # cliente Prisma singleton
│   └── data/             # recursos estáticos consumidos por la app
├── docker-compose.yml    # Postgres local
└── README.md
```

## Paso 3 — smoke test

Con la app corriendo en `localhost:3000` y un `SESSION_CREATE_SECRET` definido
en `.env`:

```bash
SECRET="$(grep ^SESSION_CREATE_SECRET .env | cut -d= -f2- | tr -d '"')"

# 1. crear sesión (devuelve { token, url })
curl -sS -X POST http://localhost:3000/api/session/create \
  -H "X-Session-Create-Secret: $SECRET" | tee /tmp/session.json
TOKEN=$(jq -r .token /tmp/session.json)

# 2a. abrir el formulario en el navegador (Paso 3)
echo "http://localhost:3000/session/$TOKEN"

# 2b. (alternativa) enviar el formulario directamente por API
curl -sS -X POST "http://localhost:3000/api/session/$TOKEN/form" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Ana",
    "age": 35,
    "familyContext": "casada, un hijo de 6",
    "location": "Madrid",
    "professionalMoment": "autónoma",
    "trigger": "Estoy dudando si cerrar mi consulta y volver por cuenta ajena. Llevo dos años arrastrando la decisión."
  }'
```

Errores esperados:

| Caso | Respuesta |
| --- | --- |
| `POST /create` sin header | 401 `UNAUTHORIZED` |
| `POST /form` con body inválido (edad 10, trigger vacío) | 400 `INVALID_INPUT` + `details` |
| `POST /form` con token inexistente | 404 `SESSION_NOT_FOUND` |
| `POST /form` repetido sobre la misma sesión | 409 `INVALID_STATE` |

Inspecciona la BD con `npm run db:studio` para ver el registro en `sessions`.

## Paso 4 — smoke test del endpoint Anthropic

Requisitos:

- `SESSION_CREATE_SECRET` definido en `.env` (se reutiliza como secreto del
  operador para este endpoint).
- `ANTHROPIC_API_KEY` definido en `.env` con una clave válida del operador.

Este smoke test está pensado para ejecutarse contra producción una vez la
clave esté desplegada. Hace dos llamadas idénticas para validar que el
prompt caching acierta en la segunda:

```bash
SECRET="$(grep ^SESSION_CREATE_SECRET .env | cut -d= -f2- | tr -d '"')"
HOST="http://localhost:3000"   # o la URL de producción

# 1. Primera llamada: escritura de caché
curl -sS -X POST "$HOST/api/dev/anthropic-ping" \
  -H "X-Session-Create-Secret: $SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"model":"haiku"}' | jq '.usage'

# 2. Segunda llamada idéntica: lectura de caché
curl -sS -X POST "$HOST/api/dev/anthropic-ping" \
  -H "X-Session-Create-Secret: $SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"model":"haiku"}' | jq '.usage'
```

Lo que esperas ver en `usage`:

| Campo | 1ª llamada | 2ª llamada |
| --- | --- | --- |
| `inputTokens` | tokens uncached (pocos, solo el user message) | igual |
| `cacheCreationInputTokens` | > 0 (el system prompt completo) | 0 |
| `cacheReadInputTokens` | 0 | ≈ el `cacheCreationInputTokens` de la 1ª |
| `outputTokens` | la respuesta del modelo | la respuesta del modelo |

El body acepta `{"model": "opus"|"sonnet"|"haiku"}` (default `opus`) para
probar los tres modelos usados en el doc §4: Opus 4.7 (coach de Fase 2),
Sonnet 4.6 (síntesis del hand-off) y Haiku 4.5 (administrador DISC y
auxiliar). También acepta `{"userPrompt": "..."}` (default `"ping"`).

Errores esperados:

| Caso | Respuesta |
| --- | --- |
| Sin header `X-Session-Create-Secret` | 401 `UNAUTHORIZED` |
| `ANTHROPIC_API_KEY` ausente/inválida | 500 `INTERNAL` |
| Body con `model` fuera del enum | 400 `INVALID_INPUT` |
| Rate limit de Anthropic | 503 `INTERNAL` |

## Paso 5 — smoke test del coach en validación aislada

Pensado para ejecutarse en producción una vez la clave esté desplegada
(el Paso 5 se prueba en caliente por el operador; no hay test humano en
dev). Requisitos:

- `SESSION_CREATE_SECRET` configurado en el entorno del servidor.
- `ANTHROPIC_API_KEY` configurado en el entorno del servidor.
- Tiempo de respuesta: el coach usa extended thinking (budget alto). Una
  llamada de `turn` encadena auxiliar + coach y puede tardar 45-90 s. El
  hosting debe permitir respuestas largas; las rutas declaran
  `maxDuration = 300` para cubrirlo.

Fixtures de hand-off disponibles (slugs):

| Slug | Perfil | Dilema |
| --- | --- | --- |
| `daniel` | D-C (dominancia + análisis) | Montar consultoría propia tras 12 años en una empresa |
| `carmen` | S-D (estabilidad + dominancia matizada) | Jubilación y qué hacer con la empresa familiar |
| `tomas` | I-D (influencia + dominancia tardía) | Mudanza familiar a Zúrich por oferta laboral |

Flujo:

```bash
SECRET="$(grep ^SESSION_CREATE_SECRET .env | cut -d= -f2- | tr -d '"')"
HOST="http://localhost:3000"   # o la URL de producción

# 1. Arrancar una run con un fixture. Devuelve { runId, coachMessage, ... }
curl -sS -X POST "$HOST/api/dev/coach/run" \
  -H "X-Session-Create-Secret: $SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"fixtureSlug":"daniel"}' | tee /tmp/coach-run.json

RUN_ID=$(jq -r .runId /tmp/coach-run.json)
jq -r .coachMessage /tmp/coach-run.json

# 2. Responder como usuario. Encadena auxiliar (Haiku) + coach (Opus).
curl -sS -X POST "$HOST/api/dev/coach/$RUN_ID/turn" \
  -H "X-Session-Create-Secret: $SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"userMessage":"Quiero dedicarme a mi propio proyecto y dejar la empresa."}' \
  | jq '{turnNumber, coachMessage, state: .state | {estimatedLevel, hypothesesExplored, hypothesesPending, runningSummary}}'

# 3. Repetir el paso 2 tantas veces como haga falta. El estado mutable vive
#    en memoria del proceso (Map<runId, RunState>) — si el servidor
#    reinicia, la run se pierde. Es deliberado para este paso.
```

Qué inspeccionar en cada respuesta:

- `turnNumber` — contador de preguntas del coach (1..50). En 40, 45 y 50
  la aplicación inyecta los comandos progresivos de cierre.
- `state.estimatedLevel` — nivel 1-6 que estima la auxiliar según §5.3.
- `state.hypothesesExplored` / `hypothesesPending` — la auxiliar mueve
  ids del hand-off de pending a explored cuando el coach las toca.
- `state.runningSummary` — resumen estructurado en palabras del usuario.
- `coach.usage` — comprueba que `cacheReadInputTokens` sube en la segunda
  llamada y siguientes (prompt + hand-off cacheados por run).

Errores esperados:

| Caso | Respuesta |
| --- | --- |
| Sin header `X-Session-Create-Secret` | 401 `UNAUTHORIZED` |
| `fixtureSlug` fuera del enum | 400 `INVALID_INPUT` |
| `runId` inexistente en `POST /turn` | 404 `SESSION_NOT_FOUND` |
| `userMessage` vacío | 400 `INVALID_INPUT` |
| Llamar a `/turn` cuando el último turno fue del usuario | 409 `INVALID_STATE` |
| Run cerrada | 409 `INVALID_STATE` |
| Rate limit de Anthropic | 503 `INTERNAL` |

## Paso 6 — smoke test de la Fase 1 completa

Pensado para ejecutarse en producción una vez desplegado. Corre los 3
fixtures simulados contra los endpoints dev de Fase 1 y deja los 3
hand-offs resultantes en `src/fixtures/handoffs-generados/{slug}.json`
para que el operador los compare a ojo con los 6 hand-offs del piloto
(`docs/handoff-0{1..6}-*.md`).

Requisitos:

- `SESSION_CREATE_SECRET` configurado en el entorno del servidor.
- `ANTHROPIC_API_KEY` configurado en el entorno del servidor.
- `FASE1_BASE_URL` (opcional, default `http://localhost:3000`).
- Tiempo de respuesta: cada fixture hace 17 llamadas (16 del
  administrador + 1 de síntesis). La síntesis final con extended
  thinking puede tardar 60-120 s. Las rutas declaran `maxDuration = 300`.

Fixtures disponibles (derivados por ingeniería inversa de los hand-offs
piloto):

| Slug | Perfil | Dilema |
| --- | --- | --- |
| `daniel` | D-C | Montar consultoría propia tras 12 años en una empresa |
| `carmen` | S-D | Jubilación y qué hacer con la empresa familiar |
| `tomas` | I-D | Mudanza familiar a Zúrich por oferta laboral |

Uso:

```bash
SESSION_CREATE_SECRET=... \
FASE1_BASE_URL=https://tu-despliegue.app \
npm run fase1:compare
```

Cada ejecución:

1. Llama a `POST /api/dev/fase1/run` con el formulario del fixture.
2. Envía los 16 mensajes del usuario (letra + freeText) a
   `POST /api/dev/fase1/{runId}/answer`.
3. En el ítem 16 la síntesis produce el hand-off; el script lo escribe
   como JSON en `src/fixtures/handoffs-generados/{slug}.json`.

Qué inspeccionar en cada hand-off generado:

- **Estructura**: debe pasar `HandoffSchema.parse` automáticamente en el
  endpoint; si falla, el campo `synthesisError` del último turno lo
  explica y el script aborta el fixture.
- **Lectura conductual**: accionable y específica, sin jerga DISC,
  coherente con la mayoría de respuestas del fixture.
- **Hipótesis**: tres, con ids `H1`/`H2`/`H3`, concretas y sondeables en
  una sesión; orientadas al coach (no al usuario).
- **Términos subjetivos**: entre 3 y 6, capturan vocabulario del
  formulario y freeText (esperable: "listo"/"dar el salto" en Daniel,
  "legado"/"buenas manos" en Carmen, "oportunidad única"/"bueno para
  todos" en Tomás).
- **Disparador**: literal del formulario inicial, sin reescribir.

Errores esperados:

| Caso | Respuesta |
| --- | --- |
| Sin `SESSION_CREATE_SECRET` en el script | Aborto con mensaje claro |
| `userMessage` vacío | 400 `INVALID_INPUT` |
| `runId` inexistente | 404 `SESSION_NOT_FOUND` |
| Run ya cerrado | 409 `INVALID_STATE` |
| Usuario sin letra tras 3 re-preguntas | El servidor avanza con letra `null` (se refleja en `answers[i].chosenLetter`) |
| Síntesis falla validación Zod | El último turno devuelve `handoff: null` y `synthesisError` con el mensaje |
| Rate limit de Anthropic | 503 `INTERNAL` |

Los outputs (`src/fixtures/handoffs-generados/`) están en `.gitignore` —
no se versionan, se regeneran en cada ejecución.

## Paso 8 — smoke test de descargas

Pensado para ejecutarse en producción contra una sesión real en estado
`phase2_completed`. Verifica que los dos entregables bajan, abren
correctamente y que la primera descarga arranca el timer de 10 min.

Requisitos:

- Una sesión real con `status='phase2_completed'` y `final_reports`
  relleno. Una forma rápida de obtener una es ejecutar
  `npm run e2e:compare` con el fixture `daniel` y abortar antes de
  cerrar, o inspeccionar `db:studio` tras cualquier corrida terminada.
- Token válido en la URL.

```bash
HOST="https://tu-despliegue.app"
TOKEN="<uuid-de-sesion-en-phase2_completed>"

# 1. Descargar PDF. Debe crear informe-<slug>-<YYYY-MM-DD>.pdf.
curl -OJ "$HOST/api/session/$TOKEN/report/pdf"

# 2. Descargar DOCX. Debe crear informe-<slug>-<YYYY-MM-DD>.docx.
curl -OJ "$HOST/api/session/$TOKEN/report/docx"

# 3. Abrir ambos a ojo: portada con nombre y fecha, 11 bloques
#    titulados (§5.4), pie "Informe generado por Coach AI — DD/MM/YYYY".

# 4. Inspeccionar la BD: FinalReport.downloadedAt debe tener el
#    timestamp de la primera descarga; las posteriores no lo mueven.
```

En la UI, abrir `/session/{TOKEN}`: los dos botones de descarga aparecen
encima del "Cerrar sesión" (ahora secundario). Tras la primera descarga,
un contador "La sesión se cerrará automáticamente en M:SS" empieza a
correr; al llegar a 0:00 el cliente llama a `/close` y la pantalla pasa
a `ClosedScreen`.

Errores esperados:

| Caso | Respuesta |
| --- | --- |
| Token inválido | 400 `INVALID_INPUT` |
| Token inexistente | 404 `SESSION_NOT_FOUND` |
| `status='closed'` | 410 `SESSION_CLOSED` |
| Estado distinto de `phase2_completed` | 409 `INVALID_STATE` |
| `FinalReport` ausente en `phase2_completed` | 404 `REPORT_NOT_FOUND` |
| Error de render interno | 500 `INTERNAL` |

## Paso 9 — cron de limpieza

Implementa §6.3. Una vez al día, un cron nocturno borra en hard
delete todas las sesiones `closed` y todas las abandonadas
(created_at anterior a 24 h y estado distinto de `closed`). El borrado
de la fila en `sessions` arrastra en cascada `phase1_responses`,
`phase1_handoff`, `phase2_turns`, `phase2_state` y `final_reports`
por `onDelete: Cascade`. El hook `deleteReportBlobs` iteraría los
`pdfPath`/`docxPath` asociados; hoy son siempre `null` (Paso 8
renderiza on-demand), así que el contador de blobs es 0.

**Schedule.** `vercel.json` declara el cron como `0 2 * * *` UTC, que
equivale a 03:00 CET (invierno) / 04:00 CEST (verano) — dentro de la
ventana 3:00-5:00 hora local que pide §6.3 todo el año. Vercel Cron
es GET y añade `Authorization: Bearer $CRON_SECRET` si la env var
está configurada.

**Invocación manual (curl).** Útil para validar en producción:

```bash
HOST="https://tu-despliegue.app"
CRON_SECRET="..."   # el mismo valor que tenga Vercel como env var

# 1. Dry-run: cuenta sin borrar.
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "$HOST/api/cron/cleanup?dryRun=1" | jq

# 2. Ejecución real.
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "$HOST/api/cron/cleanup" | jq
```

Respuesta esperada (HTTP 200):

```json
{
  "ok": true,
  "event": "cron_cleanup",
  "timestamp": "2026-04-21T02:00:03.412Z",
  "durationMs": 87,
  "dryRun": false,
  "closedCount": 3,
  "abandonedCount": 0,
  "blobsDeletedCount": 0
}
```

**Invocación manual (CLI).** Corre `runCleanup` directamente contra
la DB configurada en `DATABASE_URL`, sin pasar por HTTP:

```bash
npm run cron:cleanup:dry   # simula
npm run cron:cleanup       # borra
```

Útil en dev con Postgres local y en prod como fallback si Vercel
Cron fallara.

**Log de auditoría (§7.3).** Cada ejecución escribe una sola línea
JSON en stdout con el event `cron_cleanup` y los contadores — sin
datos personales. En Vercel aparece en los Logs del deployment; en
dev se imprime en consola. Ejemplo:

```json
{"event":"cron_cleanup","timestamp":"...","durationMs":87,"dryRun":false,"closedCount":3,"abandonedCount":0,"blobsDeletedCount":0}
```

Errores esperados:

| Caso | Respuesta |
| --- | --- |
| Sin header `Authorization` | 401 `UNAUTHORIZED` |
| Header no coincide con `CRON_SECRET` | 401 `UNAUTHORIZED` |
| `CRON_SECRET` no configurado en el servidor | 500 `INTERNAL` |
| Fallo de DB durante el `deleteMany` | 500 `INTERNAL` (la transacción aborta, no hay borrado parcial) |

## Documentación del producto

La documentación completa (visión, flujo, arquitectura, prompts de las IAs,
modelo de datos detallado, fixtures de test) vive en [`docs/`](./docs/).
Empezar por [`docs/README.md`](./docs/README.md) como índice.
