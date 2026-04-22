# Coach AI

Aplicación web de una sesión única de coaching profesional asistida por IA,
completamente anónima, sin registro ni persistencia más allá de la sesión.
Especificación completa en [`docs/`](./docs/README.md).

## Estado actual

Paso 15 — Coste de API por sesión y latencia (§7.3, decisión E del
Paso 14). Segundo paso post-MVP. Cierra las dos líneas de §7.3 que
el Paso 14 dejó fuera: coste agregado por sesión y tiempo medio de
respuesta por llamada a Claude. Nueva tabla transitoria `llm_calls`
(FK CASCADE con sessions; vive hasta el cron nocturno) que persiste
`usage` + `duration_ms` por cada llamada productiva a Anthropic.
`collectDailyStats` la agrega por modelo al final del collect y
rellena 9 columnas nuevas en `daily_stats` (tokens por tipo, coste
USD total, coste USD por sesión completada, latencia media por
familia: haiku/sonnet/opus). Tarifas hardcoded en
`src/lib/metrics/pricing.ts` con fecha de consulta
(console.anthropic.com/pricing, 2026-04-21); actualizarlas es
redeploy, no migración. `GET /api/dev/stats` y `npm run metrics:show`
exponen los nuevos campos sin romper el formato anterior. No se
instrumentan las rutas `/api/dev/*` (son validación aislada, no
tráfico real). Ver la sección "Paso 15 — Coste de API por sesión y
latencia" al final de este README y el detalle técnico en
[`docs/paso-15-coste-api.md`](./docs/paso-15-coste-api.md).

Paso 14 — Métricas agregadas sin PII (§7.3). Primer paso post-MVP.
Añade observabilidad operativa sobre lo que el MVP dejó cubierto con
dos líneas de log (cron + Stripe webhook): (a) tabla `daily_stats`
poblada por el cron nocturno antes del borrado, persiste contadores
por día UTC más allá del TTL de 24-48h de las sesiones; (b) cinco
eventos de log de negocio (`session_created`, `form_submitted`,
`phase1_completed`, `phase2_completed`, `report_downloaded`) con
metadatos agregados y sin PII; (c) endpoint interno `GET
/api/dev/stats` con el header `X-Session-Create-Secret` habitual; (d)
script `npm run metrics:show` que habla directo con la BD. Sin
Plausible, PostHog, GA, Sentry ni cookies de analítica — §8 los
mantiene fuera. Ver la sección "Paso 14 — Métricas agregadas" al
final de este README y el detalle técnico en
[`docs/paso-14-metrics.md`](./docs/paso-14-metrics.md).

Paso 13 — Producción (§7.1 paso 13). Cierre del MVP: el repo queda
listo para desplegar sobre el stack estándar del operador (Ubuntu
24.04 + Docker + PostgreSQL en host + Nginx con SSL). El deploy en sí,
el registro del webhook en Stripe live, la ejecución de la rúbrica del
Paso 12 contra staging y el cutover de DNS los ejecuta el operador
siguiendo [`docs/paso-13-deploy.md`](./docs/paso-13-deploy.md); la
sesión de Claude no tiene acceso a Vercel/Stripe/DNS y no los realiza.
Cambios en código: `next.config.ts` con `output: 'standalone'`,
`Dockerfile` multi-stage, `docker-compose.prod.yml` con
`network_mode: host`, metadata completa + favicon SVG + `not-found` +
`error` + `robots.ts` en la app, `scripts/healthcheck.ts` como canary
post-deploy, datos del operador cableados en
`src/app/privacidad/page.tsx` (Total Profit Journey, S.L., NIF
B19344555, `info@totalprofitjourney.com`). Ver la sección "Paso 13 —
Producción" al final de este README.

Paso 12 — Testing end-to-end con los seis perfiles (§7.1 y §7.2).
Última fase de validación antes del Paso 13 (producción). Amplía los
fixtures de Fase 1 de 3 a los 6 slugs piloto (`daniel`, `carmen`,
`elena`, `javier`, `lucia`, `tomas`) por ingeniería inversa de los
hand-offs `docs/handoff-0{1..6}-*.md`. Los dos scripts del Paso 6/7
(`npm run fase1:compare`, `npm run e2e:compare`) cubren ahora los 6
slugs, admiten `--slug {nombre}` para iterar un solo perfil, e
imprimen tabla resumen al final. `e2e:compare` persiste la
transcripción de Fase 2 de cada run en
`src/fixtures/transcripts-generados/{slug}.md` (gitignored). La rúbrica
de revisión humana vive en `docs/paso-12-rubrica.md` — cubre hand-off,
transcripción, avisos progresivos de cierre (por revisión estática +
sesión autoadministrada del operador en staging, porque la app es no
supervisada), informe final y tiempos. Criterio go/no-go al Paso 13:
si los 6 slugs pasan la rúbrica, el producto está listo para
producción. Ver la sección "Paso 12 — Testing end-to-end" al final de
este README.

Paso 11 — Landing pública (§2.1 y §6.4). La home `/` deja de ser
placeholder: hero + "Qué es" / "Cómo funciona" / "Qué obtienes" /
vídeo / precio con dos CTA "Empezar mi sesión" que invocan el endpoint
público `POST /api/checkout/create` del Paso 10 y redirigen a la URL
hosted de Stripe. Nueva `/privacidad` con la política del §6.4. Copy
y política redactados en español; los datos del responsable del
tratamiento (razón social, NIF, contacto) quedan cableados
literalmente en el Paso 13. La URL del vídeo y el importe mostrado
siguen siendo env vars. Dos env vars nuevas:
`NEXT_PUBLIC_SESSION_PRICE_DISPLAY` (precio visible al
usuario, que el operador mantiene coherente con `STRIPE_PRICE_ID`) y
`NEXT_PUBLIC_PROMO_VIDEO_URL` (embed YouTube/Vimeo opcional, fallback
a placeholder sobrio "Vídeo próximamente"). Ver la sección "Paso 11 —
Landing pública" al final de este README.

Paso 10 — Stripe e integración de pago (§2.2 y §3.1). Puente único
entre el sistema de facturación y el sistema de sesión: al
completarse la Checkout Session, el webhook crea la fila en
`sessions` con un UUID v4 y lo escribe en `metadata.session_token`
de la Checkout Session; `/pay/success` lo resuelve vía polling y
redirige a `/session/{token}`. Dentro de la app no existe ninguna
columna que vincule pago y sesión: el lazo vive sólo en Stripe.
Ver la sección "Paso 10 — Stripe" al final de este README para
configurar, probar y diagnosticar.

Paso 9 — cron nocturno de borrado (§6.3). En producción el crontab
del host (Ubuntu, ver `docs/paso-13-deploy.md` §8) invoca
`GET /api/cron/cleanup` cada día a las 02:00 UTC (03:00 CET / 04:00
CEST, dentro de la ventana 3:00-5:00 hora local). La ruta está
protegida con `Authorization: Bearer $CRON_SECRET` y hace hard delete
en dos pasos atómicos ($transaction): sesiones en `closed` y
sesiones abandonadas (`created_at < NOW() - SESSION_TTL_HOURS h` y
`status != 'closed'`, default 48h, rango 12-168h).
La fila en `sessions` arrastra en cascada el resto. Soporta
`?dryRun=1` para simular sin efectos. Cada ejecución emite un log
JSON estructurado con `event=cron_cleanup` y contadores, sin PII
(§7.3). El operador tiene además `npm run cron:cleanup[:dry]` como
fallback. El hook `deleteReportBlobs` está listo para cuando los
PDF/DOCX se persistan en Vercel Blob/S3; hoy `FinalReport.pdfPath` y
`FinalReport.docxPath` siguen a `null` porque el Paso 8 renderiza
bajo demanda, así que el contador de blobs es 0.

Endpoints activos:

- `POST /api/checkout/create` — crea una Stripe Checkout Session en modo
  `payment` y devuelve `{ url }`. Sin auth (la consumirán la landing
  del Paso 11 y curl del operador).
- `POST /api/stripe/webhook` — verifica firma HMAC con
  `STRIPE_WEBHOOK_SECRET`, actúa sólo sobre
  `checkout.session.completed`, crea la fila en `sessions` vía
  `createSessionRow()` y escribe el UUID en `metadata.session_token`
  de la Checkout Session. Idempotente por metadata.
- `GET /api/checkout/resolve?cs={id}` — consumido por `/pay/success`.
  200 `{ token }`, 202 `{ pending: true }`, 400 no `paid`, 404 `cs`
  inexistente.
- `POST /api/session/create` — wrapper HTTP delgado sobre
  `createSessionRow()`. Protegido con `X-Session-Create-Secret`;
  mantenido como fallback del operador y por los smoke tests. El
  camino productivo es el webhook.
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
- `GET /api/dev/stats` — Paso 14. Devuelve el JSON con filas de
  `daily_stats` en el rango `?from=YYYY-MM-DD&to=YYYY-MM-DD` (ambos
  opcionales, default últimos 30 días UTC) y totales. Mismo header
  `X-Session-Create-Secret`. Sin PII por construcción.
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

- `GET /` — landing pública (§2.1). Server Component estático con las
  secciones del doc (hero, "qué es", "cómo funciona", "qué obtienes",
  vídeo, precio) y dos instancias del BuyButton. El precio y la URL
  del vídeo se leen desde env públicas; cada CTA dispara
  `POST /api/checkout/create` y redirige a la URL hosted de Stripe.
- `GET /privacidad` — política de privacidad pública (§6.4). Server
  Component estático. Datos del responsable cableados literalmente
  (Total Profit Journey, S.L., NIF B19344555, contacto
  `info@totalprofitjourney.com`).
- `GET /pay/success?cs={id}` — aterrizaje post-pago. Client Component
  que hace polling contra `/api/checkout/resolve` hasta obtener el
  token y redirigir a `/session/{token}`.
- `GET /pay/cancelled` — pantalla estática de pago cancelado, con
  botón "Volver al inicio".
- `GET /session/{token}` — pantalla pública anónima. Pinta el componente
  correspondiente al `Session.status`: formulario inicial (`created`),
  chat con el administrador DISC (`phase1_in_progress`), transición con
  spinner (`phase1_completed`), chat con el coach (`phase2_in_progress`),
  informe de 11 bloques (`phase2_completed`), pantalla final (`closed`).
  Token inválido o inexistente → 404.

## Paso 7 — smoke test end-to-end

El script `scripts/fase1-to-fase2-compare.ts` atraviesa el flujo real
completo (create → form → phase1/\* → phase2/\* → close) con los 6
fixtures piloto. El Paso 12 amplió de 3 a 6 slugs, añadió
persistencia de la transcripción de Fase 2 por slug y una tabla
resumen al final con `turnosCoach | turnosUsuario | duración |
parseStatus`.

```bash
SESSION_CREATE_SECRET=... COACH_BASE_URL=https://... \
  npm run e2e:compare

# sólo uno (soportado desde el Paso 12)
SESSION_CREATE_SECRET=... COACH_BASE_URL=https://... \
  npm run e2e:compare -- --slug javier
```

Cada fixture crea una sesión real. Inspeccionar resultado con
`npm run db:studio` — cada sesión debe acabar en `status='closed'`, con
16 filas en `phase1_responses`, un `phase1_handoff`, N filas en
`phase2_turns`, un `phase2_state` y un `final_reports`. Las
transcripciones de Fase 2 quedan en
`src/fixtures/transcripts-generados/{slug}.md` (gitignored) para
aplicar la rúbrica de revisión humana (`docs/paso-12-rubrica.md`).

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
| `npm run fase1:compare` | Corre los 6 fixtures piloto de Fase 1 contra los endpoints dev y escribe los hand-offs generados en `src/fixtures/handoffs-generados/`. Admite `--slug` |
| `npm run e2e:compare` | Flujo completo `create → form → phase1 → phase2 → close` con los 6 slugs contra los endpoints productivos, persiste transcripciones en `src/fixtures/transcripts-generados/`. Admite `--slug` |
| `npm run cron:cleanup` / `cron:cleanup:dry` | Fallback del operador al cron nocturno: ejecuta `runNightly` (collect de `daily_stats` + borrado) directamente contra `DATABASE_URL`; `--dry-run` salta collect y sólo cuenta |
| `npm run healthcheck` | Canary post-deploy (Paso 13): GET a las rutas públicas contra `$COACH_BASE_URL` y `exit 1` ante la primera que no devuelva 200 |
| `npm run metrics:show` | Paso 14: tabla ASCII con las filas de `daily_stats`. `-- --days N` ajusta el rango (default 30) |

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
piloto — los 6 slugs del Paso 12):

| Slug | Perfil | Dilema |
| --- | --- | --- |
| `daniel` | D-C | Montar consultoría propia tras 12 años en una empresa |
| `carmen` | S-D | Jubilación y qué hacer con la empresa familiar |
| `elena` | I-S | Replanteamiento existencial tras 18 años fuera del mercado |
| `javier` | D-C | Meta declarada: CEO en 4 años |
| `lucia` | C-D | Fuga de consultoría sin saber adónde ir |
| `tomas` | I-D | Mudanza familiar a Zúrich por oferta laboral |

Uso:

```bash
# los 6 slugs
SESSION_CREATE_SECRET=... \
FASE1_BASE_URL=https://tu-despliegue.app \
npm run fase1:compare

# sólo uno (el script soporta --slug desde el Paso 12)
SESSION_CREATE_SECRET=... \
FASE1_BASE_URL=https://tu-despliegue.app \
npm run fase1:compare -- --slug elena
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
(created_at anterior a la ventana `SESSION_TTL_HOURS` — 48 h por
defecto, clamp 12-168 — y estado distinto de `closed`). El borrado
de la fila en `sessions` arrastra en cascada `phase1_responses`,
`phase1_handoff`, `phase2_turns`, `phase2_state` y `final_reports`
por `onDelete: Cascade`. El hook `deleteReportBlobs` iteraría los
`pdfPath`/`docxPath` asociados; hoy son siempre `null` (Paso 8
renderiza on-demand), así que el contador de blobs es 0.

**Schedule.** Un `/etc/cron.d/coach-ai-cleanup` en el host invoca a
las `0 2 * * *` UTC el script wrapper `/usr/local/bin/coach-ai-cleanup.sh`,
que hace `curl` a `/api/cron/cleanup` en loopback con el header
`Authorization: Bearer $CRON_SECRET`. 02:00 UTC equivale a 03:00 CET
(invierno) / 04:00 CEST (verano), dentro de la ventana 3:00-5:00 hora
local que pide §6.3 todo el año. Detalles completos del setup en
`docs/paso-13-deploy.md` §8.

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

## Paso 10 — Stripe e integración de pago

Implementa §2.2 y §3.1. El único puente entre el sistema de
facturación (Stripe) y el sistema de sesión (la app) es la Checkout
Session: al confirmarse el pago, el webhook crea la fila en
`sessions`, escribe el UUID en `metadata.session_token` de la
Checkout Session y el frontend lo resuelve para abrir
`/session/{token}`. Dentro de la app no hay ninguna columna que
relacione un pago con una sesión (§3.1: "la información de unión
vive sólo en Stripe").

**Variables de entorno.** Además de las anteriores:

- `STRIPE_SECRET_KEY` — clave del operador (test/live según entorno).
- `STRIPE_WEBHOOK_SECRET` — `whsec_...` que devuelve el dashboard al
  registrar el endpoint del webhook, o `stripe listen` en dev.
- `STRIPE_PRICE_ID` — `price_...` del único line item (modo `payment`).
- `APP_PUBLIC_URL` — obligatoria. Usada para construir las URLs de
  `success_url`/`cancel_url` de la Checkout Session y la URL que
  devuelve `/api/session/create`.

**Endpoints nuevos.**

- `POST /api/checkout/create` — crea una Stripe Checkout Session hosted
  y devuelve `{ url }`. Sin auth: lo consumirá la landing pública
  (Paso 11) y un curl del operador. `mode: 'payment'` (§8: una sesión
  = un pago), sin códigos promocionales.
- `POST /api/stripe/webhook` — endpoint de Stripe. Valida la firma con
  `STRIPE_WEBHOOK_SECRET`, actúa sólo sobre
  `checkout.session.completed`, idempotencia por
  `metadata.session_token`. Llama a `createSessionRow()` en proceso
  (no self-HTTP) y escribe el token de vuelta en la Checkout Session.
- `GET /api/checkout/resolve?cs={id}` — usado por `/pay/success` para
  obtener el token. 200 `{ token }`, 202 `{ pending: true }`, 400 si
  no `paid`, 404 si `cs` no existe en Stripe.

**Páginas nuevas.**

- `/pay/success?cs=…` — Client Component con polling (1 s × 30
  intentos) contra `/api/checkout/resolve`; al resolver, redirige a
  `/session/{token}`.
- `/pay/cancelled` — estática. Botón "Volver al inicio".

**Desarrollo local con `stripe listen`.**

```bash
# 1. Autenticar la CLI (sólo la primera vez):
stripe login

# 2. Reenviar eventos al endpoint local. La CLI imprime un
#    `whsec_...` que debes copiar en STRIPE_WEBHOOK_SECRET.
stripe listen --forward-to localhost:3000/api/stripe/webhook

# 3. En otra terminal, disparar un evento sin pagar de verdad:
stripe trigger checkout.session.completed
```

**Pruebas humanas (sólo en producción, como los Pasos 4–9).** El
operador registra el endpoint en el dashboard de Stripe, configura
las env vars en Vercel y ejecuta el flujo end-to-end primero con
`stripe listen` + `stripe trigger`, y luego con una compra real
usando tarjetas test:

| Número | Efecto |
| --- | --- |
| `4242 4242 4242 4242` | Pago correcto. |
| `4000 0025 0000 3155` | Requiere 3D Secure. |
| `4000 0000 0000 0002` | Rechazo (generic decline). |

CVC cualquiera, fecha futura, código postal cualquiera.

**Criterios de cierre.**

- `curl -X POST $HOST/api/checkout/create` devuelve `{ url }` válida.
- `stripe trigger checkout.session.completed` → webhook responde 200,
  crea fila en `sessions` con UUID v4, y
  `stripe.checkout.sessions.retrieve` muestra
  `metadata.session_token` con ese UUID.
- Disparar el mismo evento repetido → NO crea una segunda fila
  (idempotencia por metadata).
- Webhook sin firma válida → 400.
- `GET /api/checkout/resolve?cs=<paid>` → `{ token }` post-webhook;
  `{ pending: true }` (202) antes.
- `/pay/success?cs=<id>` redirige a `/session/{token}` tras el polling.
- `/pay/cancelled` se renderiza.

**Diagnóstico.**

- Logs en Vercel → endpoint `/api/stripe/webhook` emite una línea JSON
  por evento con `event='stripe_webhook'`, `eventId`, `outcome`
  (`ignored`/`idempotent`/`created`), `sessionToken` y `durationMs`.
  Sin PII del pago (ni email ni nombre fiscal).
- Dashboard de Stripe → "Developers" → "Events" para ver el payload
  completo y reintentar manualmente si hizo falta.
- Errores de firma (400) en los logs indican desalineamiento entre el
  `whsec_` del listener / dashboard y `STRIPE_WEBHOOK_SECRET` del
  servidor.

## Paso 11 — Landing pública

Implementa §2.1 (landing) y §6.4 (política de privacidad). La home
pública `/` abre el circuito comercial: el usuario aterriza, entiende
qué hace el producto, pulsa "Empezar mi sesión" y el componente
cliente `BuyButton` invoca `POST /api/checkout/create` (Paso 10) para
redirigir a la URL hosted de Stripe. Tras el pago, el usuario termina
en `/pay/success` y el polling resuelve el token para redirigir a
`/session/{token}`. La política de privacidad en `/privacidad` queda
enlazada desde el footer de la landing.

**Variables de entorno nuevas.** Ambas son `NEXT_PUBLIC_*`, lo que
significa que Next.js las inlina en el bundle del cliente. Basta con
declararlas en el entorno del build.

- `NEXT_PUBLIC_SESSION_PRICE_DISPLAY` — string libre con el precio que
  se renderiza en la sección "Precio" de la landing (ej. `"149 €"`,
  `"120 EUR"`). Debe mantenerse coherente con el importe del Price
  apuntado por `STRIPE_PRICE_ID`: Stripe es la fuente de verdad del
  cobro; esta variable sólo pinta el número. Si queda vacía, la
  landing muestra `—` como marcador visible de falta de configuración.
- `NEXT_PUBLIC_PROMO_VIDEO_URL` — URL embed del vídeo promocional,
  típicamente YouTube o Vimeo (ej. `https://www.youtube.com/embed/XXXX`).
  Si queda vacía, la sección "Vídeo" se renderiza como un cuadro gris
  con el texto "Vídeo próximamente".

**Datos del operador cableados.** En el Paso 13 se fijaron en
`src/app/privacidad/page.tsx` los datos del responsable del
tratamiento: Total Profit Journey, S.L., NIF B19344555, contacto
`info@totalprofitjourney.com`. La redacción de la cláusula del
subencargado externo de modelos de lenguaje se mantiene genérica
("proveedor externo de modelos de lenguaje") por decisión explícita;
si en el futuro interesa citar a Anthropic por nombre y enlazar al
DPA, se edita ahí directamente.

**TODO del operador en cada deploy.**

- [ ] Configurar `NEXT_PUBLIC_SESSION_PRICE_DISPLAY` con el mismo
      importe que el Price activo en Stripe.
- [ ] Configurar `NEXT_PUBLIC_PROMO_VIDEO_URL` con el embed del vídeo
      promocional cuando esté producido.
- [ ] Revisar a ojo el copy de la landing (hero, "qué es", "cómo
      funciona", "qué obtienes", precio) — deriva de §1 y §2.1 y
      puede ajustarse en tono.

**Flujo de validación en producción.** Con las env vars configuradas
y un deploy activo:

1. Abrir la URL pública de la app. La home debe renderizar el hero
   con el CTA "Empezar mi sesión".
2. Pulsar el CTA. El botón muestra "Redirigiendo…" y redirige al
   Checkout hosted de Stripe.
3. Introducir una tarjeta test (`4242 4242 4242 4242`, CVC cualquiera,
   fecha futura, código postal cualquiera).
4. Al completar el pago, aterrizar en `/pay/success?cs={id}` y
   comprobar que redirige a `/session/{token}` tras el polling.
5. Volver a la home, pulsar el CTA y cancelar el Checkout. Aterrizar
   en `/pay/cancelled`; el botón "Volver al inicio" debe llevar a la
   landing real.
6. Desde la home, pulsar el enlace del footer "Política de privacidad"
   y comprobar que `/privacidad` renderiza los ocho bloques.

**Diseño (§6.1).** Mobile-first, legible en 375 px. Tipografía base
16 px en móvil / `text-lg` (18 px) en escritorio para los párrafos
principales. Paleta `neutral-*` (fondos blancos, texto
`neutral-700`/`neutral-900`, acento `neutral-900` en los CTA, bordes
`neutral-200`). Sin emojis ni iconos decorativos.

**Fuera de alcance.** Analytics, banner de cookies (no hay cookies no
funcionales), multi-idioma (§7.4: solo español en MVP), Open Graph
avanzado, sitemap, A/B testing de copy, landings alternativas, CMS.
Se retoma en el Paso 12 (testing end-to-end con los seis perfiles) y
Paso 13 (producción).

## Paso 12 — Testing end-to-end con los seis perfiles

Última fase de validación antes del Paso 13 (producción). Cubre §7.1
(paso 12 del orden de construcción) y §7.2 (testing manual documentado
por flujo crítico). No introduce cadenas LLM nuevas: se ejercitan las
existentes con los 6 fixtures piloto.

**Qué añade.**

- 3 fixtures nuevos de Fase 1 (`elena`, `javier`, `lucia`) derivados
  por ingeniería inversa de `docs/handoff-0{3,4,5}-*.md`. El barrel
  `src/fixtures/fase1/index.ts` exporta ahora los 6 slugs del piloto.
- `npm run fase1:compare` cubre los 6 slugs; admite `--slug {nombre}`
  para iterar uno solo; imprime tabla resumen con `status | duración`
  por slug; `exit 1` si alguno falla.
- `npm run e2e:compare` cubre los 6 slugs con mensajes de Fase 2
  específicos por perfil (~10 mensajes plausibles por slug, escritos a
  mano); admite `--slug`; persiste la transcripción completa de cada
  run en `src/fixtures/transcripts-generados/{slug}.md` (gitignored);
  imprime tabla resumen con `status | coachTurns | userTurns |
  duración | parseStatus`; `exit 1` si alguno falla.
- `docs/paso-12-rubrica.md` — rúbrica de revisión humana en 5
  secciones, ejecutable por el operador en una tarde sobre los 6
  artefactos generados.

**Por qué los mensajes de Fase 2 son scripted y no generativos.** El
simulador de usuario es un array literal de strings por slug. No es un
humano y no adapta sus respuestas al coach. Alcanza ~11 turnos de
coach, muy por debajo del tope de 50 (§5.2). Los avisos progresivos
`[[QUEDAN 10 PREGUNTAS]]` / `[[QUEDAN 5 PREGUNTAS]]` / `[[CIERRA YA]]`
(inyectados en `src/lib/fase2/render-state.ts:57-59` para los turnos
40/45/50) **no se pueden ejercitar desde el script**. La rúbrica §3
los valida de otra forma: revisión estática del código + una sesión
autoadministrada del operador en staging. Supervisar sesiones reales
de usuarios no es una opción — §6.4 lo prohíbe y la app es no
supervisada en producción.

**Uso.**

```bash
# 1. Fase 1 aislada contra los endpoints dev. ~1 min por slug.
SESSION_CREATE_SECRET=... \
FASE1_BASE_URL=https://tu-despliegue.app \
npm run fase1:compare

# 2. Flujo completo contra el producto. ~2-4 min por slug con thinking.
SESSION_CREATE_SECRET=... \
COACH_BASE_URL=https://tu-despliegue.app \
npm run e2e:compare

# 3. Abrir docs/paso-12-rubrica.md y ejecutarlo sobre los 6 slugs.
# 4. Ejecutar la sección §3.2 de la rúbrica: una sesión completa hasta
#    turno 50 contra staging con el operador como usuario.
```

**Coste estimado por run completa (los 6 slugs, e2e).** Fase 1 por
slug: ~16 llamadas del administrador (Haiku) + 1 de síntesis (Sonnet
4.6 + extended thinking). Fase 2 por slug: 1 bootstrap + ~10 mensajes
= ~11 pares (Haiku auxiliar + Opus 4.7 con thinking 10k). El prompt
caching reduce el coste de los tokens del sistema a partir de la
segunda llamada dentro de cada sesión, pero los runs son
independientes entre slugs, así que cada uno paga su primera
escritura. En el orden de unos pocos euros por ejecución completa de
los 6. Sin contador automático — no se expone `usage` en los endpoints
de producción.

**Artefactos persistidos (no versionados).**

- `src/fixtures/handoffs-generados/{slug}.json` — 6 hand-offs.
- `src/fixtures/transcripts-generados/{slug}.md` — 6 transcripciones
  de Fase 2 con metadatos en cabecera.
- BD: `sessions`, `phase1_responses`, `phase1_handoff`, `phase2_state`,
  `phase2_turns`, `final_reports`. Inspeccionables con
  `npm run db:studio`.

**Criterio go/no-go al Paso 13.**

- **Go** — los 6 slugs pasan la rúbrica §1, §2, §4, §5 y la sesión
  autoadministrada §3.2 cumple. El producto está listo para
  producción.
- **No-go** — si al menos un slug falla una línea de §1, §2 o §3, se
  abre un Paso 12bis (iteración de prompts) antes de seguir. No hay
  auto-rollback: la decisión la toma el operador leyendo los
  artefactos.

**Fuera de alcance.** Deploy real, registro del webhook en el
dashboard de Stripe, env vars de live, propagación del dominio. Todo
eso es el Paso 13.

## Paso 13 — Producción

Cierre del MVP (§7.1 paso 13). El repo queda **listo para deploy**; el
deploy en sí lo ejecuta el operador siguiendo el runbook completo en
[`docs/paso-13-deploy.md`](./docs/paso-13-deploy.md).

**Qué añade este paso al código.**

- `next.config.ts` con `output: 'standalone'` para que Docker sirva
  sólo el runtime mínimo.
- `Dockerfile` multi-stage (deps → builder → runner) y `.dockerignore`.
  Imagen final ~300-400 MB con Prisma CLI incluida para poder ejecutar
  `db:migrate:deploy` desde un container efímero.
- `docker-compose.prod.yml` con `network_mode: host` (Postgres en el
  propio host, no en compose) y healthcheck contra `/robots.txt`.
- Metadata completa en `src/app/layout.tsx` (OG básico, locale es_ES,
  `metadataBase` derivada de `APP_PUBLIC_URL`), favicon SVG sobrio
  (`src/app/icon.svg`), página 404 (`not-found.tsx`), error boundary
  raíz (`error.tsx`) y `robots.ts` permisivo sobre `/` y `/privacidad`.
- `scripts/healthcheck.ts` como canary post-deploy: GET a las rutas
  públicas, `exit 1` a la primera que no responda 200.
- Datos del operador cableados en `src/app/privacidad/page.tsx` (Total
  Profit Journey, S.L., NIF B19344555, `info@totalprofitjourney.com`).

**Qué NO añade.** Ni analytics, ni Sentry, ni tests automatizados con
oráculos sobre la salida del LLM, ni CMS, ni multi-idioma, ni Open
Graph con imágenes dinámicas — todo fuera del alcance del MVP (§8).

**Gate go/no-go.** Parte inseparable del runbook. Antes del cutover a
Stripe live y DNS final, el operador ejecuta sobre staging la rúbrica
de [`docs/paso-12-rubrica.md`](./docs/paso-12-rubrica.md): los 6 slugs
deben pasar §1/§2/§4/§5 y la sesión autoadministrada §3.2 debe
cumplirse. Sin go, no hay cutover.

**Precondiciones del operador.** Servidor Ubuntu 24.04 con Docker,
Docker Compose, Nginx y PostgreSQL 16 en el host; dominio con acceso a
DNS; cuentas de Stripe (test + live) y Anthropic con crédito
suficiente; acceso root/sudo. Lista completa en
`docs/paso-13-deploy.md` §0.

**Variables de entorno en `.env.production`.** El runbook §3.2
incluye la checklist con la tabla "nombre · obligatoria · secreto · de
dónde sale" y separa `NEXT_PUBLIC_*` (inline en el bundle, cualquier
cambio requiere rebuild).

## Paso 14 — Métricas agregadas sin PII

Primer paso post-MVP. Implementa §7.3: observabilidad operativa
sobre sesiones creadas/completadas/abandonadas, duraciones, turnos
del coach y descargas, todo agregado por día UTC y sin datos
personales. No introduce Plausible, PostHog, GA, Sentry ni cookies
de analítica (§8).

**Qué añade al código.**

- Nuevo modelo `DailyStats` (`prisma/schema.prisma`) + migración
  `20260421020000_paso_14_daily_stats`. Índice adicional
  `idx_sessions_created_status` para las queries del recolector.
- `src/lib/metrics/daily.ts` con `collectDailyStats({ date })`.
  Contadores con `groupBy`/`count` de Prisma y `percentile_cont`
  vía `$queryRaw` tipado para p50/p95.
- `src/lib/metrics/events.ts` con `logBusinessEvent(name, payload)`.
  Mismo formato JSON que los logs existentes del Paso 9 y 10.
- Refactor `src/lib/cron/cleanup.ts`: `runCleanup` → `runNightly`,
  que encadena `collect + cleanup`. Si collect falla, el cleanup no
  corre (no hay pérdida de datos). Callers actualizados:
  `GET /api/cron/cleanup` y `scripts/cron-cleanup.ts`.
- Instrumentación de 5 eventos en los endpoints correspondientes
  (`session_created`, `form_submitted`, `phase1_completed`,
  `phase2_completed`, `report_downloaded`). Sin PII: metadatos
  de proceso (durationMs, turnsCount, format) y nada más.
- `GET /api/dev/stats` y `scripts/metrics-show.ts` + entrada en
  `package.json` (`npm run metrics:show`).

**Qué NO añade.** Analytics de terceros, tracking del visitante,
dashboards web, cohortes, A/B testing, alertas, medición de coste
por llamada de Anthropic (requiere persistir `usage` — fuera del
alcance aquí). §8 mantiene todo esto fuera del MVP.

**Tres vías de consulta.**

```bash
# 1. CLI contra la BD local (o con DATABASE_URL apuntando a prod):
npm run metrics:show                # últimos 30 días
npm run metrics:show -- --days 7    # última semana

# 2. Endpoint HTTP con el mismo header que el resto de /api/dev/*:
curl -sS -H "X-Session-Create-Secret: $SECRET" \
  "$HOST/api/dev/stats?from=2026-04-01&to=2026-04-30" | jq

# 3. SQL directo — la tabla es pública para el operador, sin PII:
sudo -iu postgres psql coach_ai_prod -c 'SELECT * FROM daily_stats ORDER BY date DESC LIMIT 30;'
```

**Deploy.** El Paso 14 **no** despliega nada en prod — eso es un
`git pull && docker compose build && up -d` + `prisma migrate deploy`
que ejecuta el operador siguiendo el runbook del Paso 13. El cron
del host no cambia: el mismo endpoint `GET /api/cron/cleanup` ahora
dispara `runNightly` internamente.

Detalle técnico y caveats (frontera de días, idempotencia, queries
SQL de ejemplo) en
[`docs/paso-14-metrics.md`](./docs/paso-14-metrics.md). El caveat
"Coste Anthropic" que quedó fuera del Paso 14 lo cierra el Paso 15.

## Paso 15 — Coste de API por sesión y latencia

Segundo paso post-MVP. Cierra las dos líneas de §7.3 que el Paso 14
dejó explícitamente fuera: coste agregado de API por sesión y
tiempo medio de respuesta por llamada a Claude.

**Qué añade al código.**

- Nuevo modelo `LlmCall` (`prisma/schema.prisma`) + migración
  `20260421030000_add_llm_calls_and_cost_metrics`. Tabla transitoria
  con FK `ON DELETE CASCADE` a `sessions`: persiste `usage` + `duration_ms`
  por cada llamada productiva a Anthropic y se borra junto con las
  sesiones en el cleanup nocturno (consistente con el compromiso
  anti-PII de §6.4).
- 9 columnas nuevas en `daily_stats` (todas nullable):
  `total_input_tokens`, `total_output_tokens`,
  `total_cache_creation_tokens`, `total_cache_read_tokens` (BigInt),
  `total_cost_usd`, `avg_cost_usd_per_completed_session`,
  `avg_latency_ms_haiku`, `avg_latency_ms_sonnet`, `avg_latency_ms_opus`.
- `src/lib/metrics/pricing.ts` con `calculateCostUsd(model, usage)`
  puro y tarifas hardcoded para `haiku-4-5`, `sonnet-4-6`, `opus-4-7`
  (fuente: console.anthropic.com/pricing, consultado 2026-04-21).
  Actualizar precios es editar el objeto `PRICING` y redeploy — no
  requiere migración.
- `src/lib/metrics/llm-calls.ts` con `recordLlmCall` best-effort:
  envuelve el insert en try/catch, loggea
  `event=llm_call_record_failed` a stderr si falla, nunca propaga.
- Instrumentación de los 5 route handlers productivos que invocan
  los 4 wrappers de Anthropic: `phase1/start`, `phase1/next` (ambos
  kind `fase1_admin`), `phase1/finish` (`fase1_sintesis`),
  `phase2/bootstrap` (`fase2_coach_bootstrap`), `phase2/message`
  (`fase2_auxiliar` + `fase2_coach_turn`). El registro se hace desde
  el handler — los wrappers siguen devolviendo `{ usage, latencyMs,
  model }` sin cambios.
- Agregación en `collectDailyStats` con un único `groupBy` por
  modelo y `calculateCostUsd` sobre los totales por modelo. Si el
  día no tiene `llm_calls`, las 9 columnas quedan null y el upsert
  sigue funcionando.
- `GET /api/dev/stats` y `scripts/metrics-show.ts` extendidos con
  las nuevas columnas y totales ponderados sobre el rango.
  `metrics:show` añade 3 columnas (`coste $`, `p/sesión $`, `lat Opus ms`).

**Qué NO añade.** Alertas de presupuesto, desglose por `kind` en
`daily_stats`, coste por sesión individual (imposible por diseño
anti-PII), conversión a EUR, percentiles p50/p95 de latencia,
instrumentación de `/api/dev/*` (tráfico operador, no productivo),
dashboard web, cambios en prompts. Ver §7 de
[`docs/paso-15-coste-api.md`](./docs/paso-15-coste-api.md) para la
lista explícita.

**Consultar los datos.** Scripts y endpoints sin cambios respecto
al Paso 14 — sólo campos nuevos en la respuesta:

```bash
# CLI contra la BD local (o con DATABASE_URL apuntando a prod):
npm run metrics:show                # últimos 30 días con coste y latencia Opus
npm run metrics:show -- --days 7

# Endpoint HTTP con el mismo header que el resto de /api/dev/*:
curl -sS -H "X-Session-Create-Secret: $SECRET" \
  "$HOST/api/dev/stats?from=2026-04-01&to=2026-04-30" | jq

# SQL ad-hoc sobre llm_calls antes del cron para desglose por kind:
sudo -iu postgres psql coach_ai_prod -c "
SELECT kind, COUNT(*), SUM(input_tokens), SUM(output_tokens), AVG(duration_ms)::int
FROM llm_calls
WHERE created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')
GROUP BY kind;"
```

**Deploy.** El Paso 15 **no** despliega nada en prod — eso es un
`git pull && docker compose build && up -d` + `prisma migrate deploy`
que ejecuta el operador siguiendo el runbook del Paso 13. La
migración es aditiva (tabla nueva + columnas nullable); Postgres la
aplica con la app corriendo. El cron del host no cambia: el mismo
`GET /api/cron/cleanup` dispara `runNightly` y el `collect` ve la
tabla `llm_calls` automáticamente desde el primer cron post-deploy.

Detalle técnico completo (cálculo del coste, tarifas vigentes, zonas
grises, interpretación de `avgCostUsdPerCompletedSession`, caveats,
procedimiento para actualizar tarifas) en
[`docs/paso-15-coste-api.md`](./docs/paso-15-coste-api.md).

## Documentación del producto

La documentación completa (visión, flujo, arquitectura, prompts de las IAs,
modelo de datos detallado, fixtures de test) vive en [`docs/`](./docs/).
Empezar por [`docs/README.md`](./docs/README.md) como índice.
