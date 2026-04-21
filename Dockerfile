# syntax=docker/dockerfile:1.7
#
# Imagen de producción para el despliegue del Paso 13 (Ubuntu + Docker +
# Postgres en host). Tres stages: `deps` hace `npm ci` aislado para cachear
# dependencias mientras package-lock.json no cambie; `builder` genera el
# cliente Prisma y hace `next build` en modo `output: 'standalone'`;
# `runner` es la imagen mínima que ejecuta el servidor como usuario no-root.
#
# El operador ejecuta las migraciones antes del `up` con:
#   docker compose -f docker-compose.prod.yml run --rm app npm run db:migrate:deploy
# Por eso el runner carga también el CLI de Prisma y el schema; el coste
# son ~60 MB adicionales sobre la base.

FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl curl
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001 -G nodejs

# Standalone build: server.js + runtime node_modules mínimos generados
# por Next. El directorio `public/` y `.next/static` se copian fuera del
# bundle porque Next los sirve estáticos desde disco, no desde el bundle.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Schema + CLI de Prisma para migrate deploy. `.prisma` contiene el
# cliente generado y los binarios de `@prisma/engines` que Next no
# siempre arrastra al standalone si ninguna ruta los referencia en el
# bundle — los duplicamos aquí para garantizarlos a runtime.
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
