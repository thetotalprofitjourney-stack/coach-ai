# Coach AI

Aplicación web de una sesión única de coaching profesional asistida por IA,
completamente anónima, sin registro ni persistencia más allá de la sesión.
Especificación completa en [`docs/`](./docs/README.md).

## Estado actual

Paso 4 — integración con el SDK de Anthropic y prompt caching. Hay un
endpoint interno que el operador puede golpear para verificar que la clave
funciona y que la caché acierta en la segunda llamada. Sin chat todavía, sin
prompts reales de Fase 1 ni Fase 2 — esos llegan en los Pasos 5 y 6. Ver el
orden de construcción en `docs/proyecto-completo.md` §7.1.

Endpoints activos:

- `POST /api/session/create` — crea una sesión anónima (UUID v4) en estado
  `created`. Protegido con el header `X-Session-Create-Secret`.
- `POST /api/session/{token}/form` — recibe el formulario inicial (§2.3),
  valida con Zod, guarda los datos y transiciona a `phase1_in_progress`.
- `POST /api/dev/anthropic-ping` — endpoint interno del operador.
  Hace una llamada real al SDK de Anthropic con prompt caching y devuelve
  la respuesta, las métricas de `usage` y la latencia. Reutiliza el mismo
  header `X-Session-Create-Secret`. No se invoca desde el frontend.

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

## Documentación del producto

La documentación completa (visión, flujo, arquitectura, prompts de las IAs,
modelo de datos detallado, fixtures de test) vive en [`docs/`](./docs/).
Empezar por [`docs/README.md`](./docs/README.md) como índice.
