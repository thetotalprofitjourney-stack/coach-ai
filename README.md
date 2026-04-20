# Coach AI

Aplicación web de una sesión única de coaching profesional asistida por IA,
completamente anónima, sin registro ni persistencia más allá de la sesión.
Especificación completa en [`docs/`](./docs/README.md).

## Estado actual

Paso 2 — endpoints de creación de sesión y formulario inicial. Sin frontend,
sin IA, sin pagos todavía. Ver el orden de construcción en
`docs/proyecto-completo.md` §7.1.

Endpoints activos:

- `POST /api/session/create` — crea una sesión anónima (UUID v4) en estado
  `created`. Protegido con el header `X-Session-Create-Secret`.
- `POST /api/session/{token}/form` — recibe el formulario inicial (§2.3),
  valida con Zod, guarda los datos y transiciona a `phase1_in_progress`.

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

## Paso 2 — smoke test

Con la app corriendo en `localhost:3000` y un `SESSION_CREATE_SECRET` definido
en `.env`:

```bash
SECRET="$(grep ^SESSION_CREATE_SECRET .env | cut -d= -f2- | tr -d '"')"

# 1. crear sesión (devuelve { token, url })
curl -sS -X POST http://localhost:3000/api/session/create \
  -H "X-Session-Create-Secret: $SECRET" | tee /tmp/session.json
TOKEN=$(jq -r .token /tmp/session.json)

# 2. enviar el formulario inicial
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

## Documentación del producto

La documentación completa (visión, flujo, arquitectura, prompts de las IAs,
modelo de datos detallado, fixtures de test) vive en [`docs/`](./docs/).
Empezar por [`docs/README.md`](./docs/README.md) como índice.
