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
docker compose -f docker-compose.prod.yml build
```

La primera vez tarda 2-5 minutos. Cachea `node_modules` contra
`package-lock.json`; deploys posteriores sin cambio de deps bajan a
<1 minuto.

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
docker compose -f docker-compose.prod.yml build
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
