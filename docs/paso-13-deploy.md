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
