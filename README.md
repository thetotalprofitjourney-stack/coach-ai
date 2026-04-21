# Coach AI

Aplicación web de una sesión única de coaching profesional asistida por IA,
completamente anónima, sin registro ni persistencia más allá de la sesión.
Especificación completa en [`docs/`](./docs/README.md).

## Estado actual

Paso 5 — Fase 2 en modo validación aislada. El coach conversacional (Opus
4.7 + extended thinking) corre contra hand-offs hardcodeados, con la IA
auxiliar (Haiku 4.5) refrescando el estado estructurado tras cada turno y
las inyecciones progresivas de cierre (`[[QUEDAN 10 PREGUNTAS]]`,
`[[QUEDAN 5 PREGUNTAS]]`, `[[CIERRA YA]]`) activas. Sin chat UI todavía
(llega en el Paso 7) ni Fase 1 real (Paso 6). Orden de construcción en
`docs/proyecto-completo.md` §7.1.

Endpoints activos:

- `POST /api/session/create` — crea una sesión anónima (UUID v4) en estado
  `created`. Protegido con el header `X-Session-Create-Secret`.
- `POST /api/session/{token}/form` — recibe el formulario inicial (§2.3),
  valida con Zod, guarda los datos y transiciona a `phase1_in_progress`.
- `POST /api/dev/anthropic-ping` — endpoint interno del operador.
  Hace una llamada real al SDK de Anthropic con prompt caching y devuelve
  la respuesta, las métricas de `usage` y la latencia. Reutiliza el mismo
  header `X-Session-Create-Secret`. No se invoca desde el frontend.
- `POST /api/dev/coach/run` — arranca una run de validación aislada del
  coach con un hand-off fixture. Devuelve `runId` y el primer turno del
  coach. Mismo header de operador.
- `POST /api/dev/coach/{runId}/turn` — envía una respuesta del usuario,
  corre la auxiliar, el coach responde y devuelve todo junto al operador.

Rutas activas:

- `GET /session/{token}` — pantalla pública anónima. Si la sesión está en
  `created` muestra el formulario inicial; si ya avanzó, muestra el
  placeholder "Fase 1 en construcción"; si está `closed`, la pantalla de
  sesión cerrada. Token inválido o inexistente → 404.

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

## Documentación del producto

La documentación completa (visión, flujo, arquitectura, prompts de las IAs,
modelo de datos detallado, fixtures de test) vive en [`docs/`](./docs/).
Empezar por [`docs/README.md`](./docs/README.md) como índice.
