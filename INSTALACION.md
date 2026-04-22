# Instalación de Coach AI

Guía consolidada para el equipo técnico del operador. El runbook
completo con el detalle operativo está en
[`docs/paso-13-deploy.md`](./docs/paso-13-deploy.md); este documento
remite a él por sección para lo que requiere profundidad.

## 1. Requisitos técnicos

- **Hardware mínimo**: 2 vCPU, 2 GB RAM, 20 GB disco.
- **SO**: Ubuntu 24.04 LTS (kernel >= 6.8).
- **Red**: IP pública con 80/443 abiertos; 22 restringido a IP operador o VPN.
- **Acceso**: usuario con `sudo`/root al servidor.
- **Cuenta Stripe** con claves **test** y **live**.
- **Cuenta Anthropic** con crédito para Opus 4.7, Sonnet 4.6 y Haiku 4.5.
- **Dominio** del operador con acceso al panel DNS.
- **Acceso al repo** `thetotalprofitjourney-stack/coach-ai` (deploy key SSH o HTTPS + token).

## 2. Variables de entorno

Destino: `~coach/coach-ai/.env.production` con `chmod 600`. No se
versiona. Origen de cada valor en `docs/paso-13-deploy.md` §3.

| Nombre | Descripción | De dónde sale | Ejemplo | Secreto |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | Postgres del host vía loopback. | Password generado en §3.2. | `postgresql://coach_app:PASS@127.0.0.1:5432/coach_ai_prod?schema=public` | sí |
| `APP_PUBLIC_URL` | URL pública `https://`, sin trailing slash. `metadataBase` + URLs de Checkout. | Dominio del operador. | `https://coach.totalprofitjourney.com` | no |
| `ANTHROPIC_API_KEY` | Clave del SDK Anthropic. Server-only. | Anthropic Console -> API keys. | `sk-ant-...` | sí |
| `SESSION_CREATE_SECRET` | Protege `POST /api/session/create` y `/api/dev/*`. | `openssl rand -hex 32`. | `a1b2...` | sí |
| `CRON_SECRET` | Protege `GET /api/cron/cleanup`. Lo usa el crontab del host. | `openssl rand -hex 32`. | `9f8e...` | sí |
| `STRIPE_SECRET_KEY` | Clave secreta Stripe (test en staging, live en cutover). | Stripe -> API keys. | `sk_test_...` / `sk_live_...` | sí |
| `STRIPE_WEBHOOK_SECRET` | Signing secret del endpoint. Distinto test/live. | Stripe -> Webhooks -> endpoint. | `whsec_...` | sí |
| `STRIPE_PRICE_ID` | Price de la Checkout Session (modo `payment`). | Stripe -> Products. | `price_...` | no |
| `NEXT_PUBLIC_SESSION_PRICE_DISPLAY` | Precio visible en landing. Debe casar con `STRIPE_PRICE_ID`. **Inline en bundle** (rebuild). | String libre. | `"149 €"` | no |
| `NEXT_PUBLIC_PROMO_VIDEO_URL` | URL embed YouTube/Vimeo. Vacía => placeholder. **Inline en bundle**. | URL embed. | `https://www.youtube.com/embed/XXXX` | no |
| `PREVIEW_IP_HASH_SALT` | Salt con el que se hashea la IP del visitante antes de persistirla en `preview_quotas`. Sin esto el botón "Prueba la conversación" responde 500 al arrancar. | `openssl rand -hex 32`. | `a3f7…` | sí |
| `PREVIEW_DAILY_LIMIT_PER_IP` | Cupo de previews nuevas por IP al día UTC. Default 3. Los 3 turnos de una preview ya iniciada no consumen cupo. | String numérico. | `"3"` | no |
| `SESSION_TTL_HOURS` | TTL de sesiones abandonadas antes de que el cron las borre. Default 48; clamp 12-168. No afecta a sesiones `closed`. | String numérico. | `"48"` | no |
| `SMTP_HOST` | Host SMTP para el envío opt-in del informe y los tickets de soporte. Si vacío, el formulario del informe y el botón de ticket quedan ocultos. | Proveedor de email elegido (SES, Postmark, Mailgun, relay propio, Gmail App Password). | `email-smtp.eu-west-1.amazonaws.com` | no |
| `SMTP_PORT` | Puerto SMTP. 587 STARTTLS (default), 465 TLS directo, 25 sin TLS. | Dashboard del proveedor. | `"587"` | no |
| `SMTP_SECURE` | `"true"` si el puerto es 465. `"false"` (default) para 587/25 con STARTTLS. | — | `"false"` | no |
| `SMTP_USER` | Usuario SMTP. Vacío si el proveedor usa relay por IP. | Dashboard. | `AKIA…` | sí |
| `SMTP_PASSWORD` | Password SMTP. | Dashboard. | `BZxxxx…` | sí |
| `EMAIL_FROM` | Remitente visible del email. DEBE estar verificado en el proveedor. | Dashboard. | `Coach AI <noreply@tudominio.com>` | no |
| `EMAIL_SUBJECT` | Asunto del email del informe. Default `"Tu informe de Coach AI"`. | String libre. | `"Tu informe de Coach AI"` | no |
| `SUPPORT_EMAIL` | Destinatario de los tickets de soporte. Si vacío, el botón "Generar ticket" queda oculto y el endpoint responde 503. El email del usuario viaja como Reply-To, no se persiste. | Operador. | `soporte@totalprofitjourney.com` | no |

`ALLOW_UNAUTHENTICATED_SESSION_CREATE` **NO debe definirse en
producción** — sólo para desarrollo local. Las variables **Inline en
bundle** (`NEXT_PUBLIC_*` y `APP_PUBLIC_URL`) se congelan en `next
build`: cualquier cambio exige rebuild, no basta con reiniciar el
container. Las variables `SMTP_*`, `EMAIL_*`, `SUPPORT_EMAIL`,
`PREVIEW_*` y `SESSION_TTL_HOURS` se leen en runtime: un cambio basta
con reiniciar el container (no rebuild).

## 3. Instalación paso a paso

### 3.1 Preparación del servidor

Como root. Detalle (repo Docker, llaves) en
`docs/paso-13-deploy.md` §1.

```bash
apt update && apt upgrade -y
apt install -y ca-certificates curl gnupg lsb-release ufw fail2ban nginx
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
adduser --disabled-password --gecos '' coach
# Docker Engine + Compose plugin (repo oficial, claves en /etc/apt/keyrings/docker.gpg)
apt update && apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
usermod -aG docker coach && systemctl enable --now docker nginx
```

### 3.2 PostgreSQL 16 en el host

Detalle en `docs/paso-13-deploy.md` §2. Mantener `listen_addresses =
'localhost'` (default); no exponer al exterior.

```bash
sudo apt install -y postgresql-16
sudo -iu postgres psql <<SQL
CREATE USER coach_app WITH PASSWORD '<PASSWORD_GENERADO>';
CREATE DATABASE coach_ai_prod OWNER coach_app ENCODING 'UTF8' LC_COLLATE='C' LC_CTYPE='C' TEMPLATE template0;
GRANT ALL PRIVILEGES ON DATABASE coach_ai_prod TO coach_app;
ALTER ROLE coach_app SET timezone TO 'UTC';
SQL
```

En `/etc/postgresql/16/main/pg_hba.conf`, `scram-sha-256` sobre loopback:

```
host    coach_ai_prod   coach_app   127.0.0.1/32    scram-sha-256
host    coach_ai_prod   coach_app   ::1/128         scram-sha-256
```

`sudo systemctl restart postgresql`. Validar con `psql postgresql://coach_app:<PASS>@127.0.0.1:5432/coach_ai_prod -c '\l'`.

### 3.3 Clonar repo y `.env.production`

Como usuario `coach`. Detalle en `docs/paso-13-deploy.md` §3.1-§3.2.

```bash
cd ~ && git clone https://github.com/thetotalprofitjourney-stack/coach-ai.git
cd coach-ai && git checkout main
cp .env.example .env.production && chmod 600 .env.production  # editar con los valores de §2
```

### 3.4 Build de la imagen Docker

Detalle en `docs/paso-13-deploy.md` §3.3.

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml build
```

**Crítico**: `--env-file` es obligatorio en el `build`. `NEXT_PUBLIC_*`
y `APP_PUBLIC_URL` se inlinean en `next build`; el `env_file` del
servicio sólo actúa en runtime. Sin él, la landing sale con precio
`—` y sin vídeo aunque el fichero esté bien.

### 3.5 Migración del schema

Detalle en `docs/paso-13-deploy.md` §4.

```bash
docker compose -f docker-compose.prod.yml run --rm app npm run db:migrate:deploy
```

Debe terminar con `X migrations applied`. Validar con `sudo -iu
postgres psql coach_ai_prod -c '\dt'`. Regla dura: en prod **sólo**
`prisma migrate deploy`. Tras aplicar todas las migraciones del MVP
y las post-MVP, `\dt` debe listar: `sessions`, `phase1_responses`,
`phase1_handoff`, `phase2_turns`, `phase2_state`, `final_reports`
(con `emailed_at` añadida por la migración
`20260422010000_add_emailed_at_to_final_reports`), `llm_calls`,
`daily_stats`, `preview_sessions` y `preview_quotas` (migración
`20260422000000_add_preview_sessions`).

### 3.6 Arranque del container

Detalle en `docs/paso-13-deploy.md` §5.

```bash
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps    # STATUS: Up (healthy)
curl -sSI http://127.0.0.1:3000/robots.txt      # 200
```

### 3.7 Nginx reverse proxy

Vhost con bloque HTTP -> HTTPS (301) + bloque HTTPS con `proxy_pass
http://127.0.0.1:3000`, headers `Host`, `X-Forwarded-For`,
`X-Forwarded-Proto`, `client_max_body_size 5m` y `proxy_buffering off`.
**Timeouts 310 s obligatorios** (`proxy_read_timeout` y
`proxy_send_timeout`) porque las rutas de síntesis de Fase 1 y turnos
de Fase 2 con extended thinking declaran `maxDuration=300`; con el
default de 60 s se cortan a medio turno. Vhost inicial (ACME) y final
literal en `docs/paso-13-deploy.md` §6. Recargar con `sudo nginx -t &&
sudo systemctl reload nginx`.

### 3.8 SSL con certbot

Detalle en `docs/paso-13-deploy.md` §7.

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d <dominio> --email <email> --agree-tos --no-eff-email --redirect
sudo certbot renew --dry-run
```

### 3.9 Cron del host para el borrado nocturno

Reemplaza Vercel Cron: crontab del sistema hace `curl` a
`/api/cron/cleanup` cada 02:00 UTC (ventana 3-5 hora local). Script y
cron literales en `docs/paso-13-deploy.md` §8.

```bash
# Secreto root-only fuera del crontab
sudo install -m 0600 /dev/null /etc/coach-ai-cron.env
echo "CRON_SECRET=<mismo valor que .env.production>" | sudo tee -a /etc/coach-ai-cron.env
# /usr/local/bin/coach-ai-cleanup.sh (curl con Authorization: Bearer $CRON_SECRET) con chmod +x
# /etc/cron.d/coach-ai-cleanup: 0 2 * * * root /usr/local/bin/coach-ai-cleanup.sh (chmod 644)
sudo /usr/local/bin/coach-ai-cleanup.sh && journalctl -t coach-ai-cleanup --since '5 minutes ago'
```

### 3.10 Stripe: webhook

Orden operativo en `docs/paso-13-deploy.md` §9. Configurar **primero
en test mode** (staging) y, tras el gate go/no-go del runbook §11,
replicar en **live mode**. Pasos en el dashboard:

1. Product + Price -> copiar `price_...` a `STRIPE_PRICE_ID`.
2. API keys -> Secret key -> `STRIPE_SECRET_KEY`.
3. Webhooks -> Add endpoint:
   - URL: `https://<dominio>/api/stripe/webhook`.
   - Events: **únicamente** `checkout.session.completed` (la ruta ignora el resto).
   - Copiar Signing secret `whsec_...` a `STRIPE_WEBHOOK_SECRET`.

Tras tocar `NEXT_PUBLIC_*` o `APP_PUBLIC_URL`: `docker compose down && build --no-cache && up -d`.

## 4. Smoke tests post-deploy

- **Healthcheck**: `COACH_BASE_URL=https://<dominio> npm run healthcheck`.
- **Ping Anthropic** (valida clave + prompt caching):
  ```bash
  curl -sS -X POST https://<dominio>/api/dev/anthropic-ping \
    -H "X-Session-Create-Secret: $SECRET" -H 'Content-Type: application/json' \
    -d '{"model":"haiku"}' | jq '.usage'
  ```
- **Webhook Stripe (staging)**: dashboard -> Webhooks -> endpoint ->
  "Send test webhook" con `checkout.session.completed` -> **200** en <1 s;
  `docker compose logs app` muestra `event='stripe_webhook'`.
- **Creación de sesión real**: landing -> CTA -> tarjeta test
  `4242 4242 4242 4242` (CVC y fecha futura cualesquiera). `/pay/success`
  debe redirigir a `/session/{token}`.
- **Preview gratuita**: landing -> botón "Prueba la conversación (3 turnos)"
  -> `/preview/{token}` con banner ámbar "Demo · N/3". Completar 3 turnos
  debe esconder el input y mostrar la CTA a la sesión completa. Verificar
  en BD que existe una fila nueva en `preview_sessions` y que
  `preview_quotas.preview_count` incrementa para el hash de IP correcto.
- **Streaming de Fase 2**: durante una sesión completa, verificar que tras
  el primer par de segundos de "Pensando…" el botón pasa a "Escribiendo…"
  y el texto del coach aparece palabra a palabra. Si sigue apareciendo
  sólo al final, Nginx está bufereando — revisar `proxy_buffering off` y
  headers NDJSON (`X-Accel-Buffering: no`).
- **Envío opt-in del informe**: al llegar al informe, rellenar el campo
  de email y enviar; verificar recepción con PDF y DOCX adjuntos. En BD,
  `final_reports.emailed_at` debe quedar fijado. Un segundo POST al mismo
  endpoint debe devolver 409.
- **Ticket de soporte**: forzar un error en Fase 2 (p. ej. desactivar
  temporalmente `ANTHROPIC_API_KEY`), enviar un turno, esperar 30 s tras
  el primer error y verificar que aparece el botón "Generar ticket".
  Rellenar email + descripción, enviar, comprobar que llega un email a
  `SUPPORT_EMAIL` con `Reply-To` apuntando al email del usuario y con el
  token de sesión en el cuerpo.
- **Resume link**: en la Fase 1 activa, copiar el enlace del aviso
  superior, cerrar la pestaña, esperar un minuto, volver a pegar: la
  sesión debe retomarse con el historial intacto. Confirmar además que
  pasadas más de `SESSION_TTL_HOURS` horas el cron la borra (usar
  `npm run cron:cleanup:dry` para contar antes).
- **E2E contra staging** (sesión `closed` con `final_reports` relleno;
  inspeccionar con `npm run db:studio`):
  ```bash
  SESSION_CREATE_SECRET=... COACH_BASE_URL=https://<dominio> \
    npm run e2e:compare -- --slug daniel
  ```
  Flujo de los 6 slugs y rúbrica go/no-go en `docs/paso-13-deploy.md`
  §10-§11 y `docs/paso-12-rubrica.md`.

## 5. Rollback y troubleshooting básico

### 5.1 Rollback del deploy (código)

Detalle en `docs/paso-13-deploy.md` §15.1. Tiempo: 2-5 min. Las
sesiones en curso pierden el turno actual; el estado en BD se preserva.

```bash
cd ~/coach-ai && git log --oneline -10
git checkout <sha-anterior>         # o tag previo
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

### 5.2 Rollback del schema

Prisma **no ofrece `migrate down`**. Nunca editar una migración ya
aplicada en prod. Para revertir, escribir una **nueva** migración
correctiva (`ALTER TABLE ... DROP COLUMN`, etc.) y aplicarla con
`db:migrate:deploy`. Restaurar del `pg_dump` diario
(`docs/paso-13-deploy.md` §13) sólo en corrupción irrecuperable.

### 5.3 Troubleshooting mínimo

| Síntoma | Causa probable | Dónde mirar |
| --- | --- | --- |
| 502 Bad Gateway | Container no arriba o unhealthy. | `docker compose ps`, `logs -f app`. |
| 504 Gateway Timeout | Timeouts Nginx <310 s. | `proxy_read_timeout` del vhost; `nginx -t && reload`. |
| Webhook Stripe 400 | Signing secret desalineado. | Dashboard endpoint vs `STRIPE_WEBHOOK_SECRET`. |
| `Can't reach database server` | `DATABASE_URL` o `pg_hba.conf`. | §3.2; `systemctl status postgresql`. |
| Landing con "—" o sin vídeo | `NEXT_PUBLIC_*` no inlineadas (falta `--env-file` en build). | Rebuild con `--env-file` y `--no-cache`. |
| Cron no ejecuta | Wrapper sin `+x` o `CRON_SECRET` desalineado. | `journalctl -t coach-ai-cleanup --since '2 days ago'`. |
| Streaming del coach no aparece en vivo | Nginx está bufereando la respuesta NDJSON. | `proxy_buffering off`; verificar headers `Cache-Control: no-store` y `X-Accel-Buffering: no` en la respuesta del endpoint. |
| Botón "Prueba la conversación" → 500 | Falta `PREVIEW_IP_HASH_SALT`. | `docker compose logs app` muestra `preview/start: PREVIEW_IP_HASH_SALT no está configurado`. |
| Formulario de email del informe oculto | `SMTP_HOST` o `EMAIL_FROM` vacío. | `isEmailConfigured()` devuelve false; revisar `.env.production`. |
| Botón "Generar ticket" no aparece tras error | `SUPPORT_EMAIL` vacío, o no han pasado 30 s de error sostenido. | `.env.production`; medir desde que aparece el banner rojo. |
| Ticket llega pero no puedes responder al usuario | Proveedor SMTP ignora `Reply-To` (algunos relays lo reescriben). | Enviar un test manual con `nodemailer` y revisar cabeceras recibidas; configurar el proveedor para propagar `Reply-To`. |

## 6. Referencia completa

Para detalles operativos (backups `pg_dump`, rotación de logs Docker,
cutover DNS, canary con 1 €, Stripe live), seguir el runbook completo
en [`docs/paso-13-deploy.md`](./docs/paso-13-deploy.md).
