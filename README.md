# Coach AI

Aplicación web de una sesión única de coaching profesional asistida por IA,
completamente anónima, sin registro ni persistencia más allá de la sesión.
Especificación completa en [`docs/`](./docs/README.md).

## Estado actual

Paso 1 — scaffolding y modelo de datos. Sin endpoints, sin IA, sin pagos
todavía. Ver el orden de construcción en `docs/proyecto-completo.md` §7.1.

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

## Documentación del producto

La documentación completa (visión, flujo, arquitectura, prompts de las IAs,
modelo de datos detallado, fixtures de test) vive en [`docs/`](./docs/).
Empezar por [`docs/README.md`](./docs/README.md) como índice.
