# Paso 13 — Runbook de despliegue

Guía ejecutable por el operador para pasar el repo de "listo para
deploy" a producción. Se asume el stack estándar del operador: servidor
Ubuntu 24.04 LTS, Docker + Docker Compose, PostgreSQL 16 en el propio
host, Nginx como reverse proxy con SSL (Let's Encrypt).

El Paso 12 deja el criterio de go/no-go (`docs/paso-12-rubrica.md`): es
**parte inseparable** de este runbook, no un anexo. El deploy pasa por
una fase de **staging con Stripe en modo test**, se ejecuta la rúbrica
contra ese staging, y sólo si hay *go* se migra a Stripe live y se
apunta el DNS final.

Este documento está escrito para ser seguido **en orden**. No saltar
pasos: las dependencias entre secciones son reales (p. ej. certbot
requiere que Nginx esté levantado antes; el webhook de Stripe requiere
el dominio con SSL; el cron requiere `CRON_SECRET` en `.env.production`).

---

## §0 Prerrequisitos

### §0.1 Cuentas y credenciales

- [ ] Cuenta de **Stripe** del operador con acceso a claves live.
- [ ] Cuenta de **Anthropic Console** con una API key activa con
      suficiente crédito para Opus 4.7 + Sonnet 4.6 + Haiku 4.5.
- [ ] **Dominio** del operador. Acceso al panel de DNS.
- [ ] Acceso **root o sudo** al servidor Ubuntu 24.04.
- [ ] **Acceso al repositorio** de GitHub
      `thetotalprofitjourney-stack/coach-ai`. Deploy key de sólo lectura
      si el servidor clona por SSH, o clonado por HTTPS con token.

### §0.2 Servidor mínimo recomendado

- **CPU**: 2 vCPU.
- **RAM**: 2 GB (suficiente para la app + Postgres; 4 GB holgado).
- **Disco**: 20 GB. La app pesa <200 MB; Postgres crece muy poco (el
  cron nocturno borra las sesiones en 24-48 h).
- **Sistema**: Ubuntu 24.04 LTS, kernel ≥ 6.8.
- **Red**: IP pública con puertos 80 y 443 abiertos al exterior. 22
  abierto sólo a la IP del operador (o a la VPN).

### §0.3 Notas de coste

- Llamadas a Anthropic: orden de unos pocos euros por sesión completa
  con prompt caching activo (validado en `e2e:compare` del Paso 12).
- Stripe: comisión por transacción según tarifa del operador.
- Hosting: depende del proveedor del servidor. No hay coste por Cron
  (lo ejecuta el crontab del propio host).

---

## §1 Preparación del servidor Ubuntu

Los comandos de esta sección se ejecutan como `root` o con `sudo`.

### §1.1 Actualización del sistema

```bash
apt update && apt upgrade -y
apt install -y ca-certificates curl gnupg lsb-release ufw fail2ban
```

### §1.2 Firewall básico

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status
```

El puerto 3000 (app) y 5432 (Postgres) **no se abren al exterior**: la
app se expone a través de Nginx en 443, y Postgres vive en loopback.

### §1.3 Usuario no-root para la app

```bash
adduser --disabled-password --gecos '' coach
usermod -aG docker coach   # tras instalar Docker en §1.4
```

Todo lo que siga se ejecuta como `coach` salvo que se indique `sudo`.

### §1.4 Docker Engine + Compose plugin

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker
docker --version
docker compose version
```

### §1.5 Nginx

```bash
apt install -y nginx
systemctl enable --now nginx
```

Config del vhost y SSL en §6 y §7 — todavía no. Primero Postgres, app
y migraciones; la exposición pública se hace al final de la fase de
staging.

---

## §2 PostgreSQL 16 en el host

La app se conecta al Postgres del host a través del loopback
(`127.0.0.1:5432`) gracias a `network_mode: host` del
`docker-compose.prod.yml`. No se expone Postgres al exterior en ningún
momento.

### §2.1 Instalación

```bash
sudo apt install -y postgresql-16
systemctl status postgresql
```

### §2.2 Base de datos y usuario de la app

```bash
sudo -iu postgres
psql <<SQL
CREATE USER coach_app WITH PASSWORD '<PASSWORD_GENERADO>';
CREATE DATABASE coach_ai_prod OWNER coach_app ENCODING 'UTF8' LC_COLLATE='C' LC_CTYPE='C' TEMPLATE template0;
GRANT ALL PRIVILEGES ON DATABASE coach_ai_prod TO coach_app;
ALTER ROLE coach_app SET client_encoding TO 'utf8';
ALTER ROLE coach_app SET default_transaction_isolation TO 'read committed';
ALTER ROLE coach_app SET timezone TO 'UTC';
SQL
exit
```

Generar el password con `openssl rand -base64 32` y guardarlo para el
`.env.production` del §3.

### §2.3 `pg_hba.conf`

Autenticación `scram-sha-256` para conexiones locales (loopback). Con
`network_mode: host`, el container se presenta como `127.0.0.1`, así
que basta con permitir `host` sobre el bloque `127.0.0.1/32`. Editar
`/etc/postgresql/16/main/pg_hba.conf`:

```
# Coach AI — app en container con network_mode: host
host    coach_ai_prod   coach_app       127.0.0.1/32            scram-sha-256
host    coach_ai_prod   coach_app       ::1/128                 scram-sha-256
```

Asegurar `listen_addresses = 'localhost'` en
`/etc/postgresql/16/main/postgresql.conf` (default en Ubuntu). **No**
abrirlo a `*`. Reiniciar:

```bash
sudo systemctl restart postgresql
```

### §2.4 Validación de conectividad

```bash
# Como usuario coach (NO como postgres). Debe pedir password.
psql "postgresql://coach_app:<PASSWORD>@127.0.0.1:5432/coach_ai_prod" -c '\l'
```

Si aquí falla, el resto no va a funcionar. No seguir hasta resolverlo.

### §2.5 Connection pooling (opcional, escala baja)

Para el volumen del MVP (sesiones cortas, cron nocturno, tráfico bajo)
el pool interno de Prisma es suficiente. Si en el futuro aparece
`too many connections`, añadir **PgBouncer** en modo `transaction` en
el mismo host y apuntar `DATABASE_URL` a su puerto (6432). No forma
parte del Paso 13.

---

## §3 Preparación del proyecto en el servidor

Todo lo que sigue se ejecuta como el usuario `coach`.

### §3.1 Clonar el repo

```bash
cd ~
git clone https://github.com/thetotalprofitjourney-stack/coach-ai.git
cd coach-ai
git checkout main   # o el tag de release que corresponda
```

Se recomienda desplegar siempre desde un tag firmado (p. ej.
`v1.0.0`). El `git log --oneline -5` debe mostrar el commit exacto que
el operador quiere en producción.

### §3.2 `.env.production` en el host

El fichero vive en `~coach/coach-ai/.env.production`. **No se
versiona** (`.gitignore` lo cubre). Lo carga Docker Compose mediante
`env_file` y se inyecta al container.

Plantilla inicial (copiar, editar, guardar con permisos 600):

```bash
cd ~/coach-ai
cp .env.example .env.production
chmod 600 .env.production
```

Checklist de variables, con el origen de cada valor:

| Variable | Obligatoria | Secreto | De dónde sale |
| --- | --- | --- | --- |
| `DATABASE_URL` | sí | sí | `postgresql://coach_app:<PASSWORD>@127.0.0.1:5432/coach_ai_prod?schema=public` del §2 |
| `APP_PUBLIC_URL` | sí | no | Dominio público con `https://`, sin trailing slash. Ej. `https://coach.totalprofitjourney.com` |
| `ANTHROPIC_API_KEY` | sí | sí | Anthropic Console → API keys |
| `SESSION_CREATE_SECRET` | sí | sí | `openssl rand -hex 32`. Se reutiliza como secreto del operador para `/api/dev/*` y smoke tests |
| `CRON_SECRET` | sí | sí | `openssl rand -hex 32`. Referenciado por el crontab del §8 |
| `STRIPE_SECRET_KEY` | sí | sí | Stripe dashboard → API keys. **Test mode** en staging, **live mode** en cutover |
| `STRIPE_WEBHOOK_SECRET` | sí | sí | Stripe dashboard → Webhooks → endpoint → Signing secret. `whsec_...` |
| `STRIPE_PRICE_ID` | sí | no | Stripe dashboard → Products → Price ID. `price_...`. Test en staging, live en cutover |
| `NEXT_PUBLIC_SESSION_PRICE_DISPLAY` | sí | no | String libre con el precio a mostrar. Ej. `"149 €"`. **Inline en el bundle** (cualquier cambio requiere rebuild) |
| `NEXT_PUBLIC_PROMO_VIDEO_URL` | no | no | URL embed del vídeo promocional. Si está vacía, la landing muestra placeholder sobrio. **Inline en el bundle** |
| `ALLOW_UNAUTHENTICATED_SESSION_CREATE` | no | no | **NO definir en prod**. Solo existe para desarrollo local |

Variables marcadas como "Inline en el bundle" (`NEXT_PUBLIC_*`) se
congelan en **tiempo de build**: cualquier cambio requiere `docker
compose build --no-cache` y reinicio, no basta con reiniciar el
container.

### §3.3 Construcción de la imagen

```bash
cd ~/coach-ai
docker compose --env-file .env.production -f docker-compose.prod.yml build
```

La primera vez tarda 2-5 minutos. Cachea `node_modules` contra
`package-lock.json`; deploys posteriores sin cambio de deps bajan a
<1 minuto.

> **Importante — `--env-file`**. Las variables `NEXT_PUBLIC_*` y
> `APP_PUBLIC_URL` se **inlinean en el bundle cliente** durante
> `next build`. El `env_file` declarado en el servicio del
> `docker-compose.prod.yml` sólo se aplica en runtime; para que lleguen
> al build hay que pasar `--env-file .env.production` al comando
> `docker compose ... build`. Los `up -d`, `down`, `logs`, `run`, `ps`
> no lo requieren: leen del `env_file` del servicio. Si se olvida
> `--env-file` en el build, la landing saldrá con precio "—" y sin
> vídeo, aunque `.env.production` tenga los valores correctos.

Verificar tamaño final:

```bash
docker images coach-ai:latest
# Esperable: 300-400 MB (standalone + Prisma CLI + engines)
```

---

## §4 Migración del schema

Antes de subir el container, aplicar el schema completo contra la base
de datos vacía creada en §2. Prisma detecta las migraciones existentes
en `prisma/migrations/` y las ejecuta en orden.

```bash
cd ~/coach-ai
docker compose -f docker-compose.prod.yml run --rm app npm run db:migrate:deploy
```

El comando debe terminar con `X migrations applied`. Si hay errores:

- `Can't reach database server`: `DATABASE_URL` mal construida o
  Postgres no escucha en `127.0.0.1` (revisar §2.3).
- `Authentication failed`: password incorrecto en `DATABASE_URL`.
- `permission denied for schema public`: el owner de la DB no es
  `coach_app` (revisar el `CREATE DATABASE ... OWNER` del §2.2).

**Regla dura**: en producción se usa `prisma migrate deploy`, nunca
`prisma migrate dev` ni `prisma db push`. Ambos pueden destruir datos
sin aviso.

Validar el schema aplicado:

```bash
sudo -iu postgres psql coach_ai_prod -c '\dt'
# Debe listar: sessions, phase1_responses, phase1_handoff,
# phase2_turns, phase2_state, final_reports, _prisma_migrations.
```

---

## §5 Primer arranque del container (aún sin proxy)

### §5.1 Levantar el servicio

```bash
cd ~/coach-ai
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
```

`STATUS` debe mostrar `Up (healthy)` tras ~20 segundos (el healthcheck
del container ya hace `curl` a `/robots.txt` cada 30s).

### §5.2 Probar la app desde el propio host

El container escucha en `127.0.0.1:3000`. Probar:

```bash
curl -sSI http://127.0.0.1:3000/robots.txt        # 200
curl -sSI http://127.0.0.1:3000/                  # 200
curl -sSI http://127.0.0.1:3000/privacidad        # 200
```

Si cualquiera devuelve 5xx o no conecta, revisar logs:

```bash
docker compose -f docker-compose.prod.yml logs -f app
```

### §5.3 Salir y volver

Comandos de ciclo de vida recurrentes:

```bash
# Parar
docker compose -f docker-compose.prod.yml down

# Arrancar
docker compose -f docker-compose.prod.yml up -d

# Rebuild tras git pull
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# Seguir logs en vivo
docker compose -f docker-compose.prod.yml logs -f app
```

---

## §6 Reverse proxy con Nginx

La app habla HTTP plano en `127.0.0.1:3000`. Nginx termina HTTPS en
443 y reenvía al container. **Timeouts largos obligatorios**: la
síntesis de Fase 1 y los turnos de Fase 2 con extended thinking
tardan entre 60 y 180 segundos; con los defaults de Nginx (60 s) se
cortarían.

### §6.1 Vhost inicial para obtener el certificado

Crear `/etc/nginx/sites-available/coach-ai` (editar como `sudo`):

```nginx
# Redirección HTTP → HTTPS la pone certbot más tarde; de entrada
# necesitamos 80 abierto para que Let's Encrypt valide el dominio.
server {
    listen 80;
    listen [::]:80;
    server_name coach.totalprofitjourney.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 404;
    }
}
```

Sustituir `coach.totalprofitjourney.com` por el dominio real del
operador. Activar:

```bash
sudo mkdir -p /var/www/certbot
sudo ln -s /etc/nginx/sites-available/coach-ai /etc/nginx/sites-enabled/coach-ai
sudo nginx -t
sudo systemctl reload nginx
```

### §6.2 Vhost final tras emitir el certificado

Tras completar §7 (certbot habrá editado el fichero con los
`ssl_certificate`), revisar que el bloque HTTPS queda como sigue
(sobrescribir lo que certbot genere si hace falta):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name coach.totalprofitjourney.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name coach.totalprofitjourney.com;

    ssl_certificate     /etc/letsencrypt/live/coach.totalprofitjourney.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/coach.totalprofitjourney.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    # El webhook de Stripe manda bodies <5 KB, pero los informes
    # generados pueden superar 1 MB; damos margen holgado.
    client_max_body_size 5m;

    # Evitar compresión sobre las respuestas del API (SSE futuro,
    # cabeceras de Stripe). La landing sí se comprime bien.
    gzip on;
    gzip_types text/css application/javascript image/svg+xml text/plain;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;

        # CRÍTICO. `maxDuration` de las rutas del Next (síntesis de
        # Fase 1 = 300s, turnos de Fase 2 con thinking = 300s) exige
        # timeouts holgados en el proxy. Si se bajan, la sesión se
        # corta a medio turno y el usuario queda en estado inconsistente.
        proxy_read_timeout  310s;
        proxy_send_timeout  310s;
        proxy_connect_timeout 30s;

        # El webhook de Stripe es idempotente pero espera 2xx/4xx en
        # <20 s; con el default es suficiente.
        proxy_buffering off;
    }
}
```

Tras cada edición: `sudo nginx -t && sudo systemctl reload nginx`.

---

## §7 Certificado SSL con Let's Encrypt

### §7.1 Instalar certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### §7.2 Emitir certificado

Con el vhost HTTP del §6.1 ya levantado y el DNS del dominio
apuntando al servidor (si aún no se ha hecho el cutover final,
servirá el propio subdominio `staging.` o el dominio temporal):

```bash
sudo certbot --nginx -d coach.totalprofitjourney.com \
  --email info@totalprofitjourney.com \
  --agree-tos --no-eff-email --redirect
```

Certbot configura automáticamente el bloque HTTPS y activa la
redirección HTTP→HTTPS. Revisar que el fichero del §6.2 queda como
allí se describe; si certbot ha generado algo diferente, ajustar los
`proxy_*_timeout` a la mano.

### §7.3 Renovación automática

`certbot` instala un timer de systemd (`certbot.timer`) que renueva
los certificados con ≥30 días de margen. Verificar:

```bash
systemctl list-timers | grep certbot
sudo certbot renew --dry-run
```

El `--dry-run` debe terminar con `Congratulations, all simulated renewals succeeded`.

### §7.4 Probar HTTPS

```bash
curl -I https://coach.totalprofitjourney.com/robots.txt
# 200 OK
```

Si da 502: el vhost reenvía bien pero la app no está arriba (revisar
§5). Si da 504: los timeouts del §6.2 no se aplicaron (recargar
Nginx).

---

## §8 Cron del host para el borrado nocturno

Reemplaza Vercel Cron. Un crontab del sistema hace `curl` a
`/api/cron/cleanup` con el `Authorization: Bearer $CRON_SECRET`. La
ruta ya existe desde el Paso 9 (`src/app/api/cron/cleanup/route.ts`).

### §8.1 Script envoltorio

Para mantener el secreto fuera del crontab (que es legible por
cualquier usuario con `cat /etc/cron.d/...`), se guarda en un
fichero sólo-root y el script lo carga:

```bash
sudo install -m 0600 /dev/null /etc/coach-ai-cron.env
sudo tee /etc/coach-ai-cron.env > /dev/null <<EOF
CRON_SECRET=<el mismo valor que en .env.production>
EOF

sudo tee /usr/local/bin/coach-ai-cleanup.sh > /dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source /etc/coach-ai-cron.env

LOG_TAG="coach-ai-cleanup"
URL="http://127.0.0.1:3000/api/cron/cleanup"

response=$(curl -sS -w '\n%{http_code}' \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  "${URL}")
body="$(echo "${response}" | head -n -1)"
code="$(echo "${response}" | tail -n 1)"

if [ "${code}" = "200" ]; then
  logger -t "${LOG_TAG}" "ok ${body}"
  exit 0
fi
logger -t "${LOG_TAG}" "fail code=${code} body=${body}"
exit 1
EOF
sudo chmod +x /usr/local/bin/coach-ai-cleanup.sh
```

Nótese que el `curl` apunta a **loopback**, no al dominio público: es
el mismo host. Evita TLS, DNS y pasa por encima del rate limit que
pueda tener el WAF.

### §8.2 Entrada en `/etc/cron.d`

`0 2 * * *` UTC = 03:00 CET invierno / 04:00 CEST verano, dentro de
la ventana 3:00-5:00 hora local que pide §6.3 de la spec.

```bash
sudo tee /etc/cron.d/coach-ai-cleanup > /dev/null <<'EOF'
# Borrado nocturno de sesiones cerradas y abandonadas (§6.3).
# Logs con `journalctl -t coach-ai-cleanup`.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

0 2 * * * root /usr/local/bin/coach-ai-cleanup.sh
EOF
sudo chmod 644 /etc/cron.d/coach-ai-cleanup
```

### §8.3 Prueba manual

Antes de esperar 24h, ejecutar el script a mano:

```bash
sudo /usr/local/bin/coach-ai-cleanup.sh
journalctl -t coach-ai-cleanup --since '5 minutes ago'
# Debe verse la línea JSON con los contadores.
```

Alternativa sin crontab, usando el fallback del Paso 9
(`npm run cron:cleanup`): ejecutar desde el container puntualmente.
No sustituye al crontab porque requiere que alguien lo dispare.

---

## §9 Stripe

El Paso 10 ya documenta el detalle conceptual (puente único por
`metadata.session_token`, idempotencia, endpoints involucrados). Aquí
se concreta el **orden operativo** de configuración en el dashboard
de Stripe. Se hace primero en **test mode** para cubrir toda la
validación del Paso 12 y, tras el *go*, se replica en **live mode**.

### §9.1 Stripe en test mode (staging)

1. Entrar al dashboard con el toggle superior en **"Test mode"**.
2. **Product + Price**:
   - Products → Add product → Name: "Sesión Coach AI".
   - Pricing → One-time → importe del MVP (p. ej. 149 €).
   - Guardar. Copiar el `price_test_...` resultante a
     `STRIPE_PRICE_ID` en `.env.production`.
3. **API key**:
   - Developers → API keys → "Secret key" (test).
   - Copiar el valor `sk_test_...` a `STRIPE_SECRET_KEY`.
4. **Webhook**:
   - Developers → Webhooks → Add endpoint.
   - URL: `https://coach.totalprofitjourney.com/api/stripe/webhook`
     (el dominio del staging con SSL ya configurado en §7).
   - Events: **únicamente** `checkout.session.completed`. No añadir
     otros; la ruta los ignora y sólo gastas llamadas de más.
   - Guardar. Copiar el **Signing secret** `whsec_...` a
     `STRIPE_WEBHOOK_SECRET` en `.env.production`.
   - **Nota sobre multi-producto**: el webhook puede apuntarse a nivel
     de cuenta aunque haya otros productos en Stripe. Las sesiones de
     checkout creadas por esta app llevan `metadata.app = 'coach-ai'`
     automáticamente; la ruta ignora las que no tengan esa marca.
5. **`NEXT_PUBLIC_SESSION_PRICE_DISPLAY`**: ajustar al mismo importe
   del Price (p. ej. `"149 €"`). Recordatorio: es inline en el
   bundle; aplicar con `docker compose ... build --no-cache` + `up -d`.

Recargar el container con la config nueva:

```bash
cd ~/coach-ai
docker compose -f docker-compose.prod.yml down
docker compose --env-file .env.production -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
```

Validación rápida del webhook con el dashboard:

- Developers → Webhooks → endpoint → "Send test webhook".
- Evento: `checkout.session.completed`.
- Debe devolver **200** en <1 s.
- En los logs del container (`docker compose logs app`) debe
  aparecer una línea JSON con `event='stripe_webhook'` y
  `outcome='ignored'` — esto es correcto: los eventos de prueba
  del dashboard no llevan `metadata.app='coach-ai'`, así que la
  ruta los descarta como si fueran de otro producto.
- Para validar el flujo completo (con `outcome='created'`), hacer
  un pago de prueba real a través de la app con una tarjeta de
  test de Stripe (p. ej. `4242 4242 4242 4242`).

### §9.2 Stripe en live mode (cutover)

**No se ejecuta hasta haber obtenido *go* en §11**. Una vez con el go:

1. Toggle del dashboard a **"Live mode"**.
2. Repetir los pasos 2-4 del §9.1 en live:
   - Crear el Product "Sesión Coach AI" y el Price live con el
     importe final. Copiar `price_live_...`.
   - API keys → Secret key live (`sk_live_...`).
   - Webhook: `https://<dominio-final>/api/stripe/webhook`,
     únicamente `checkout.session.completed`. Copiar el signing
     secret live (`whsec_...`, distinto del test).
   - Si la cuenta live tiene otros productos, no hace falta un
     webhook separado: la app ignora automáticamente los pagos
     que no vengan de su propio checkout (filtro por
     `metadata.app = 'coach-ai'`).
3. Sustituir en `.env.production`:
   - `STRIPE_SECRET_KEY` → `sk_live_...`
   - `STRIPE_WEBHOOK_SECRET` → el `whsec_...` del endpoint live
   - `STRIPE_PRICE_ID` → `price_live_...`
   - `NEXT_PUBLIC_SESSION_PRICE_DISPLAY` y `APP_PUBLIC_URL` si
     cambia el dominio (ver §12).
4. Rebuild + reinicio:

```bash
docker compose -f docker-compose.prod.yml down
docker compose --env-file .env.production -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
```

5. **Canary con 1 € real**. Comprar una sesión con una tarjeta real
   del operador por el importe mínimo configurable (o aprovechar el
   propio importe si se acepta). Validar el flujo completo
   hasta descargar el informe. Si algo falla, rollback (§15).

---

## §10 Validación en staging

Con §9.1 completado, el staging está listo para ejercitar las cadenas
LLM reales contra Stripe test.

### §10.1 Canary de rutas públicas

```bash
COACH_BASE_URL=https://coach.totalprofitjourney.com npm run healthcheck
```

Todas las probes deben salir **ok**. Si alguna falla, no tiene
sentido seguir: hay un problema de proxy, DNS o build. Resolver
antes.

### §10.2 Fase 1 completa contra el producto

Los seis slugs del Paso 12, aislados contra `/api/dev/fase1/*`:

```bash
SESSION_CREATE_SECRET=<el mismo que en .env.production> \
FASE1_BASE_URL=https://coach.totalprofitjourney.com \
npm run fase1:compare
```

El script persiste los 6 hand-offs en
`src/fixtures/handoffs-generados/{slug}.json` (gitignored). Tabla
resumen al final; `exit 1` si algún slug falla.

### §10.3 End-to-end completo

Flujo `create → form → phase1 → phase2 → close` por los 6 slugs:

```bash
SESSION_CREATE_SECRET=<...> \
COACH_BASE_URL=https://coach.totalprofitjourney.com \
npm run e2e:compare
```

Persiste las 6 transcripciones en
`src/fixtures/transcripts-generados/{slug}.md`. Cada slug tarda 2-4
minutos con thinking activo; el conjunto ~20 minutos. Coste: unos
pocos euros de Anthropic.

Ambos scripts se ejecutan desde una máquina con Node 20+ instalado
(el portátil del operador o el propio servidor; la clave
`SESSION_CREATE_SECRET` viaja sólo por HTTPS en las llamadas).

---

## §11 Rúbrica del Paso 12 — gate de go/no-go

Con los artefactos del §10 generados, aplicar la rúbrica:

- [ ] Abrir `docs/paso-12-rubrica.md` y recorrer §1, §2, §4 y §5 para
      los 6 slugs.
- [ ] Ejecutar §3.2 (sesión autoadministrada en staging hasta turno
      50). Este ítem es el único que requiere una run manual larga
      (~40-60 min). Recomendación del propio Paso 12: hacerlo con el
      fixture `lucia` por su tendencia a no decidir.

**Criterio**:

- **Go** → los 6 slugs pasan §1/§2/§4/§5 y la sesión
  autoadministrada cumple §3.2. El producto está listo para la
  transición a Stripe live (§9.2) y al cutover de DNS (§12).
- **No-go** → al menos un slug falla una línea de §1/§2/§3. Abrir un
  Paso 12bis (iteración de prompts) antes de seguir. Mantener el
  staging para iterar; **no** proceder al §9.2 ni al §12.

Fallos específicos en §4 (bloques faltantes, `parseStatus != ok`)
apuntan a código, no a prompts: se corrigen en el repo y se relanza
`e2e:compare` hasta que pasen.

---

## §12 Cutover de DNS y anuncio

**Precondición**: go en §11 + Stripe live completado en §9.2 + canary
del §9.2.5 exitoso.

### §12.1 DNS

El staging puede haber estado en un subdominio temporal
(`staging-coach.`, un dominio ad-hoc, etc.). El cutover apunta el
dominio final al servidor:

1. Panel DNS del operador → record `A` del dominio final apuntando a
   la IP del servidor (`A coach.totalprofitjourney.com → <IP>`).
   TTL corto (300 s) durante el cutover para permitir rollback
   rápido; subirlo a 3600 s tras 24 h estables.
2. Esperar propagación: `dig +short coach.totalprofitjourney.com`
   debe devolver la IP nueva desde varias redes.
3. Si el dominio final es distinto al de staging, emitir certificado
   adicional con certbot (§7.2) y reiniciar Nginx.

### §12.2 Ajuste de `APP_PUBLIC_URL`

Si el dominio cambia entre staging y producción, actualizar
`APP_PUBLIC_URL` en `.env.production` y **rebuild** (la variable es
consumida por `src/app/layout.tsx` como `metadataBase` y por
`/api/checkout/create` al construir `success_url`/`cancel_url`).
Recordatorio:

```bash
docker compose -f docker-compose.prod.yml down
docker compose --env-file .env.production -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
```

Acordarse de **actualizar la URL del webhook en Stripe live**
(dashboard → Webhooks → endpoint → Update) si cambia el dominio.

### §12.3 Validación post-cutover

```bash
COACH_BASE_URL=https://<dominio-final> npm run healthcheck
```

Y una compra real del operador con tarjeta live por el importe del
Price. El flujo debe terminar con informe descargable. Si algo
falla, rollback (§15).

### §12.4 Anuncio

Ya es seguro comunicar la URL a usuarios. El resto del Paso 13
(§13-§15) es régimen permanente del operador.

---

## §13 Backup de PostgreSQL

El TTL de las sesiones es 24-48 h (cron del §8 + §6.3 de la spec),
así que el riesgo de pérdida de datos de sesión es acotado. El valor
que hay que proteger es:

- El **schema completo** con todas las migraciones (ya versionado en
  `prisma/migrations/`, recuperable con `prisma migrate deploy`).
- La **tabla `_prisma_migrations`** (estado aplicado).
- Cualquier sesión en curso en el momento del backup (no crítico: el
  usuario puede relanzar una sesión nueva, es el modelo del producto).

### §13.1 `pg_dump` diario con retención 14 días

Script ejemplo `/usr/local/bin/coach-ai-backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR=/var/backups/coach-ai
DB=coach_ai_prod
USER=coach_app
RETAIN_DAYS=14

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

ts="$(date -u +%Y%m%dT%H%M%SZ)"
file="${BACKUP_DIR}/dump-${ts}.sql.gz"

# PGPASSWORD se toma de /etc/coach-ai-cron.env (añadir la línea
# PGPASSWORD=<...> al fichero del §8.1).
source /etc/coach-ai-cron.env

PGPASSWORD="${PGPASSWORD}" pg_dump \
  -h 127.0.0.1 -U "${USER}" -d "${DB}" \
  --no-owner --no-acl --format=plain | gzip -9 > "${file}"

# Rotación
find "${BACKUP_DIR}" -name 'dump-*.sql.gz' -mtime +${RETAIN_DAYS} -delete

logger -t coach-ai-backup "ok ${file} ($(du -h ${file} | cut -f1))"
```

Entrada adicional en `/etc/cron.d/coach-ai-cleanup` (o nuevo fichero):

```
# Backup diario a las 02:30 UTC, media hora tras el cleanup nocturno.
30 2 * * * root /usr/local/bin/coach-ai-backup.sh
```

### §13.2 Restore

Procedimiento a ojo, para testear una vez tras el primer backup:

```bash
gunzip -c /var/backups/coach-ai/dump-<ts>.sql.gz | \
  sudo -iu postgres psql coach_ai_prod_restore
```

Siempre restaurar a una DB **distinta** (`coach_ai_prod_restore`)
para comparar sin sobrescribir la de prod. Si hace falta, tras
validar, hacer swap por tabla con `pg_restore` o copiando manualmente.

### §13.3 Copia fuera del servidor (opcional recomendado)

`rsync` nocturno a un bucket S3-compat (Backblaze B2, Wasabi) o a
otro servidor del operador. Sin esto, un fallo de disco pierde los
backups. Fuera del alcance duro del Paso 13, pero es el siguiente
paso lógico.

---

## §14 Observabilidad operativa

La spec §7.3 pide métricas agregadas sin PII. En el Paso 13 se
cubre con los logs estructurados del cron y el webhook (Pasos 9 y
10). El Paso 14 amplía con `daily_stats`, 5 eventos de log de
negocio, el endpoint interno `GET /api/dev/stats` y el comando
`npm run metrics:show` — ver [`paso-14-metrics.md`](./paso-14-metrics.md)
para detalles.

### §14.1 Dónde están los logs

- **App**: `docker compose -f docker-compose.prod.yml logs -f app`.
  Cada endpoint emite una línea JSON por evento relevante:
  - `event=cron_cleanup` — ejecución del borrado nocturno (cuando
    se dispara vía HTTP; el script del §8 lo captura también con
    `logger -t coach-ai-cleanup`).
  - `event=daily_stats_collected` — stage previo al borrado desde
    el Paso 14. Contadores completos del día agregados en
    `daily_stats`. **Sin PII**.
  - `event=stripe_webhook` — recepción del webhook de Stripe con
    `outcome` (`ignored` / `idempotent` / `created`), `eventId` y
    `durationMs`. **Sin PII**: ni email ni nombre fiscal.
  - `event=session_created` / `form_submitted` / `phase1_completed`
    / `phase2_completed` / `report_downloaded` — eventos de
    negocio del Paso 14. Metadatos (durationMs, turnsCount,
    format) sin identificadores ni contenido.
  - `event=nightly_failed` — el cron del Paso 14 abortó en el
    stage `collect` o `cleanup`. Si aparece, mirar el `message`.
- **Crontab del host**: `journalctl -t coach-ai-cleanup` y
  `journalctl -t coach-ai-backup`. Mostrar la última semana con
  `journalctl -t coach-ai-cleanup --since '7 days ago'`.
- **Nginx**: `/var/log/nginx/access.log` y `/var/log/nginx/error.log`.
  El access.log tiene IP + User-Agent; si el operador quiere
  anonimizar, configurar `log_format` con `$remote_addr` hasheado o
  simplemente `'-'`.

### §14.2 Rotación de logs de Docker

Por defecto Docker no rota los logs del container y pueden llenar
disco. Config en `/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "20m",
    "max-file": "5"
  }
}
```

Aplicar con `sudo systemctl restart docker` (reinicia también el
container — hacerlo en mantenimiento, no en tráfico).

### §14.3 Indicadores mínimos a vigilar

Sin herramienta dedicada de APM, el operador puede revisar a mano:

- `journalctl -t coach-ai-cleanup` una vez al día para ver que el
  cron corre y los contadores son sensatos.
- `npm run metrics:show` (Paso 14) para ver la tabla
  `daily_stats` con sesiones creadas/completadas/abandonadas,
  descargas y duraciones por día UTC.
- `docker stats coach-ai` puntualmente para RAM/CPU del container.
- `sudo -iu postgres psql coach_ai_prod -c 'SELECT count(*) FROM sessions;'`
  para ver el volumen acumulado (debería quedarse bajo).

Sentry, Plausible, PostHog, etc. quedan fuera del MVP (§8). Si se
añaden después, no toca prompts ni schema: se integran en el
frontend o como middleware.

---

## §15 Rollback

Dos escenarios, dos procedimientos.

### §15.1 Rollback del deploy de app (código)

Si tras un `docker compose build && up -d` algo va mal (5xx,
comportamiento del coach distinto, etc.):

```bash
cd ~/coach-ai
git log --oneline -10        # identificar el commit previo estable
git checkout <sha-anterior>
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

Si se deployó por tags (`v1.0.0 → v1.0.1` con fallo), volver al tag
anterior con `git checkout v1.0.0`.

Tiempo estimado: 2-5 minutos. El usuario que esté a medias en una
sesión pierde el turno en curso pero el estado en BD se preserva
(las migraciones no cambiaron).

### §15.2 Rollback del schema

**Regla dura**: Prisma no ofrece migrate down automático. Si una
migración introdujo un cambio dañino:

1. **No aplicar más migraciones** hasta resolver.
2. Si la migración aún no está en producción, borrar la carpeta en
   `prisma/migrations/<timestamp>_<nombre>/` y recrearla corregida.
3. Si ya está en producción: escribir una **nueva** migración que
   revierta el cambio (`ALTER TABLE ... DROP COLUMN`, etc.) y
   aplicarla con `db:migrate:deploy`.
4. Restaurar del backup del §13 sólo en caso de corrupción
   irrecuperable.

En la práctica, con el Paso 13 recién salido, todas las tablas
existentes están estables desde los Pasos 1, 6, 8 y 9. Cualquier
cambio futuro debería pensarse con este rollback en mente.

### §15.3 Rollback de Stripe live → test

Si tras el §9.2 hay fallo grave:

1. En el dashboard de Stripe, **desactivar** el webhook live (no
   borrar — sólo pausar). Esto detiene la creación de sesiones al
   instante.
2. Revertir `.env.production` a los valores de test del §9.1.
3. Rebuild + up.
4. Avisar al usuario final a través del canal que proceda (la app
   sigue funcionando con test; los pagos reales quedan en pausa).

Los pagos ya cobrados en live se pueden reembolsar desde el propio
dashboard si hiciera falta.

---

## Apéndice A — Comandos de diagnóstico rápido

```bash
# Estado general
docker compose -f docker-compose.prod.yml ps
sudo systemctl status nginx postgresql

# Logs en vivo
docker compose -f docker-compose.prod.yml logs -f app
sudo tail -f /var/log/nginx/error.log
journalctl -t coach-ai-cleanup -f

# Conexión a la DB
sudo -iu postgres psql coach_ai_prod
\dt                                           # listar tablas
SELECT status, count(*) FROM sessions GROUP BY status;

# Estado del container
docker stats coach-ai
docker inspect coach-ai --format '{{.State.Health.Status}}'

# Probar el webhook de Stripe manualmente
curl -sSI https://<dominio>/api/stripe/webhook   # 405 (solo POST)

# Canary completo
COACH_BASE_URL=https://<dominio> npm run healthcheck
```

## Apéndice B — Plan B si no se usa Docker

El runbook asume Docker + Compose, pero el repo es autocontenido y
puede correr directamente con Node 20+ en el host:

```bash
cd ~/coach-ai
npm ci
npm run build
DATABASE_URL=... APP_PUBLIC_URL=... ANTHROPIC_API_KEY=... \
CRON_SECRET=... SESSION_CREATE_SECRET=... STRIPE_SECRET_KEY=... \
STRIPE_WEBHOOK_SECRET=... STRIPE_PRICE_ID=... \
NEXT_PUBLIC_SESSION_PRICE_DISPLAY=... \
node .next/standalone/server.js
```

Para mantenerlo como servicio, unit de systemd apuntando al comando
anterior. El resto del runbook (Nginx, SSL, cron, backup, rollback,
Stripe, DNS) se aplica igual. La única pérdida es la inmutabilidad
de la imagen — los rollbacks dependen más del `git checkout` y el
`npm run build` que de `docker compose build`.

