# Paso 14 — Métricas agregadas sin PII

Primer paso post-MVP. Implementa la observabilidad operativa pedida
por `proyecto-completo.md` §7.3: contadores agregados sin datos
personales, accesibles al operador sin herramientas de terceros.

Lo que **no** es este paso (§8): Plausible, PostHog, GA, Sentry,
cookies de analítica, dashboards web, tracking del visitante,
cohortes o retención, A/B testing, alertas, medición de coste por
llamada de Anthropic (esa queda para un Paso 15 — requiere persistir
`usage` en cada ruta, fuera del alcance aquí).

---

## §1 Qué se recolecta

Todo lo que sigue se persiste en la tabla `daily_stats` una vez al
día, indexado por fecha **UTC**. Ninguna columna identifica a un
usuario concreto — son contadores por día.

| Columna | Tipo | Qué cuenta |
| --- | --- | --- |
| `date` | DATE (PK) | Día UTC al que corresponden los contadores |
| `sessions_created` | INT | Sesiones creadas ese día (creadas = fila nueva en `sessions`, por Stripe o por `/api/session/create`) |
| `sessions_form_submitted` | INT | Subset anterior que salió del estado `created` (≡ formulario enviado, §2.3) |
| `sessions_phase1_completed` | INT | Subset que alcanzó al menos `phase1_completed` (incluye phase2_in_progress / phase2_completed / closed) |
| `sessions_phase2_completed` | INT | Subset que alcanzó al menos `phase2_completed` (incluye closed) |
| `sessions_closed` | INT | Sesiones con `closed_at` en ese día (independiente de `created_at`) |
| `sessions_abandoned` | INT | Subset de `sessions_created` con `status != closed` y creadas ≥24h antes del `collect` (mismo criterio que el cron, §6.3) |
| `reports_downloaded` | INT | Sesiones con primera descarga (`downloaded_at`) en ese día. Segunda y siguientes descargas de la misma sesión NO cuentan |
| `avg_phase2_turns` | DOUBLE | Media de turnos del coach por sesión creada ese día, sobre sesiones con al menos 1 turno |
| `avg_duration_seconds` | DOUBLE | Media de `closed_at - created_at` sobre sesiones cerradas ese día |
| `p50_duration_seconds` | INT | Mediana de duración sobre el mismo subset |
| `p95_duration_seconds` | INT | Percentil 95 de duración sobre el mismo subset |
| `created_at` / `updated_at` | TIMESTAMP | Metadatos de la fila (upsert) |

**Sobre la duración.** La duración **no corta ninguna sesión en
producción**. Lo que corta la sesión es (a) los 50 turnos del coach
de Fase 2 (§5.2), (b) el timer de 10 min post-primera-descarga
(§2.6), (c) el cierre explícito vía `POST /api/session/{token}/close`
o (d) el barrido nocturno de abandonadas (≥24h, §6.3). La duración
se persiste como métrica observacional derivada (§7.3 la lista
como "Duración media de sesión"), no como palanca de control.

**Zona horaria.** UTC en todo. El cron nocturno corre a las 02:00 UTC
(= 03:00 CET / 04:00 CEST) y agrega "ayer UTC". Consecuencia práctica
para el operador: una sesión española creada el 21 de abril a las
01:30 CEST (= 20 de abril 23:30 UTC) cuenta como sesión del **20 de
abril**. Es menos intuitivo, pero es la única forma limpia de evitar
huecos/solapes por DST.

---

## §2 Cómo se recolecta

El cron nocturno del Paso 9 (`src/lib/cron/cleanup.ts`) se ha
refactorizado a `runNightly({ dryRun, collectDate })`, que ejecuta
dos stages en este orden:

1. **collect** — `collectDailyStats({ date: collectDate })` agrega
   los contadores del día y los `upsert`ea en `daily_stats`. Corre
   **antes** del borrado porque después los datos ya no existen.
2. **cleanup** — hard delete de sesiones `closed` y abandonadas
   (mismo comportamiento que antes del Paso 14).

Si `collect` falla, el cron aborta antes del borrado: los datos de la
DB quedan intactos para una re-ejecución. Emite una línea JSON
`event=nightly_failed` con el stage (`collect` o `cleanup`).

Si el mismo día se recolecta dos veces (re-ejecución manual), el
upsert pisa la fila anterior con los mismos números — idempotente.

**`collectDate` por defecto.** `now - 24h`, que es "ayer UTC"
respecto al instante del cron. El operador puede forzar otra fecha
desde REPL o desde un script, pero el cron productivo no toma
parámetros.

---

## §3 Eventos de log (complemento en tiempo real)

Antes del Paso 14 el sistema emitía dos líneas JSON estructuradas
por stdout: `event=stripe_webhook` (Paso 10) y `event=cron_cleanup`
(Paso 9). El Paso 14 añade **cinco eventos de negocio** en el mismo
formato, sin PII, emitidos desde el punto donde la transición ocurre.
Los logs son el stream en tiempo real; `daily_stats` es el agregado
persistente que los resume.

| Evento | Punto de emisión | Payload |
| --- | --- | --- |
| `session_created` | `createSessionRow()` | `timestamp` |
| `form_submitted` | `POST /api/session/{token}/form` (tras persistir) | `timestamp`, `durationMs` desde `created_at` |
| `phase1_completed` | `POST /api/session/{token}/phase1/finish` (tras síntesis) | `timestamp`, `durationMs`, `turnsCount: 16` |
| `phase2_completed` | `POST /api/session/{token}/phase2/finish` (tras persistir) | `timestamp`, `durationMs`, `turnsCount` (coach) |
| `report_downloaded` | `markReportDownloadedOnce()` (solo primera descarga) | `timestamp`, `format` (`pdf` \| `docx`) |
| `daily_stats_collected` | Stage `collect` del cron | contadores completos del día |
| `nightly_failed` | Stage fallido del cron | `stage`, `message` |

**Lo que NO va en los logs** (§6.4 y §7.3):
- Identificadores de sesión (ni el token, ni hash del token).
- Contenido conversacional (mensajes, respuestas del formulario,
  trigger, nombre, edad, familia).
- Datos del pago (email, nombre fiscal, país).

No hay correlación entre eventos: no se puede reconstruir el
timeline de una sesión concreta desde los logs. Si hace falta debug
de una sesión en vivo, se hace con `docker compose logs` antes del
cron nocturno y con acceso a la DB — no por correlación cruzada de
líneas de log.

---

## §4 Cómo consultar los datos

Hay tres vías, todas no-interactivas y sin frontend:

### §4.1 CLI (`npm run metrics:show`)

La vía más cómoda para el operador en la shell del servidor. Habla
directo con `DATABASE_URL`:

```bash
npm run metrics:show                # últimos 30 días
npm run metrics:show -- --days 7    # última semana
npm run metrics:show -- --days 90   # último trimestre
```

Imprime una tabla ASCII con fecha + contadores + totales al final.
Si la tabla está vacía (fresh install, antes del primer cron),
imprime `(sin datos)` y sale con 0.

### §4.2 Endpoint (`GET /api/dev/stats`)

Misma información, formato JSON, accesible por HTTP con el header
`X-Session-Create-Secret` (mismo patrón que los otros endpoints
`/api/dev/*`). Útil cuando la shell no está a mano pero sí un
`curl`:

```bash
SECRET="..."   # SESSION_CREATE_SECRET del servidor
HOST="https://app.totalprofitjourney.com"

# Default: últimos 30 días
curl -sS "$HOST/api/dev/stats" \
  -H "X-Session-Create-Secret: $SECRET" | jq

# Rango explícito (ambos inclusive, UTC)
curl -sS "$HOST/api/dev/stats?from=2026-04-01&to=2026-04-30" \
  -H "X-Session-Create-Secret: $SECRET" | jq
```

Respuesta (abreviada):

```json
{
  "from": "2026-04-01",
  "to": "2026-04-30",
  "rows": [
    {
      "date": "2026-04-20",
      "sessionsCreated": 7,
      "sessionsFormSubmitted": 6,
      "sessionsPhase1Completed": 5,
      "sessionsPhase2Completed": 4,
      "sessionsClosed": 4,
      "sessionsAbandoned": 1,
      "reportsDownloaded": 4,
      "avgPhase2Turns": 10.5,
      "avgDurationSeconds": 3240,
      "p50DurationSeconds": 3100,
      "p95DurationSeconds": 5400
    }
  ],
  "totals": {
    "days": 1,
    "sessionsCreated": 7,
    "sessionsFormSubmitted": 6,
    "sessionsPhase1Completed": 5,
    "sessionsPhase2Completed": 4,
    "sessionsClosed": 4,
    "sessionsAbandoned": 1,
    "reportsDownloaded": 4
  }
}
```

| Caso | Respuesta |
| --- | --- |
| Sin header `X-Session-Create-Secret` | 401 `UNAUTHORIZED` |
| `from` o `to` con formato distinto de `YYYY-MM-DD` | 400 `INVALID_INPUT` |
| `from > to` | 400 `INVALID_INPUT` |

Solo JSON. Si el operador quiere CSV, lo convierte con una línea de
`jq`.

### §4.3 SQL directo sobre `daily_stats`

Útil cuando la pregunta no cabe en la tabla estándar (ej. "qué día
de la semana tiene más sesiones"). La tabla no tiene PII y es
pequeña (una fila por día), así que cualquier query se ejecuta en ms.

```bash
sudo -iu postgres psql coach_ai_prod <<'SQL'
-- sesiones por día de la semana (últimos 90 días)
SELECT
  to_char(date, 'Day') AS dow,
  SUM(sessions_created) AS created,
  SUM(sessions_phase2_completed) AS completed
FROM daily_stats
WHERE date >= current_date - INTERVAL '90 days'
GROUP BY to_char(date, 'Day'), EXTRACT(DOW FROM date)
ORDER BY EXTRACT(DOW FROM date);

-- tasa de finalización semanal
SELECT
  date_trunc('week', date)::date AS semana,
  SUM(sessions_phase2_completed)::float
    / NULLIF(SUM(sessions_created), 0) AS tasa_completadas
FROM daily_stats
WHERE date >= current_date - INTERVAL '90 days'
GROUP BY 1
ORDER BY 1;

-- tasa de descarga sobre sesiones completadas
SELECT
  date,
  reports_downloaded,
  sessions_phase2_completed,
  CASE
    WHEN sessions_phase2_completed = 0 THEN NULL
    ELSE reports_downloaded::float / sessions_phase2_completed
  END AS ratio
FROM daily_stats
ORDER BY date DESC
LIMIT 30;
SQL
```

La tabla sobrevive al barrido nocturno — es la única forma de tener
datos más allá del TTL de 24-48h de las sesiones.

---

## §5 Caveats conocidos

- **Frontera del día.** `sessions_abandoned` solo es estable para
  fechas ≥ 2 días antes del recolect. Una sesión creada ayer a las
  23:50 UTC no ha tenido 24h al momento del cron de hoy a las 02:00
  UTC; no entra en `sessions_abandoned` de ayer pero sí cuenta en
  `sessions_created` de ayer. Consecuencia: para el día más reciente
  de la tabla, `sessions_abandoned` puede estar subestimado durante
  las ~24h siguientes al primer recolect. Mañana lo vuelve a calcular
  y ya es definitivo (el upsert pisa la fila).
- **Duración desde `created_at`.** Los `durationMs` de
  `form_submitted`, `phase1_completed` y `phase2_completed` son
  diferencias contra `created_at`, no contra la transición anterior.
  No persistimos timestamps intermedios (no hay `form_submitted_at`
  en `sessions`); el gap "creación → formulario enviado" típico es
  de segundos, irrelevante a escala de observación de producto. Si
  en algún momento se quiere medir fases por separado, se añade una
  migración con `form_submitted_at` / `phase1_completed_at` y se
  computa desde ahí.
- **Re-ejecuciones del cron.** El upsert es idempotente: re-correr
  el cron en el mismo día UTC pisa los contadores con los mismos
  números. Dos `collect` para la misma fecha no duplican nada.
- **Coste Anthropic.** No se persiste `usage` (input/output/cache
  tokens) en ningún modelo: los endpoints descartan la respuesta
  del SDK tras usarla. Queda fuera del alcance del Paso 14. Para el
  primer mes post-deploy se estima a ojo con la factura del panel de
  Anthropic Console + volumen de sesiones de `daily_stats`.

---

## §6 Migración y deploy

La migración `20260421020000_paso_14_daily_stats` crea la tabla
`daily_stats` y un índice adicional sobre `sessions(created_at,
status)` para que las queries por rango de fecha del recolector no
hagan seq scan. El índice existente `(status, created_at)` se
mantiene (lo usa el cleanup).

En prod:

```bash
# dentro del directorio del proyecto en el servidor
docker compose --env-file .env.production -f docker-compose.prod.yml \
  run --rm app npx prisma migrate deploy
```

Detalles completos (usuario, permisos, rollback) en
[`paso-13-deploy.md`](./paso-13-deploy.md) §4.

El cron del host no necesita cambios: `GET /api/cron/cleanup` ahora
dispara `runNightly`, que internamente hace `collect + cleanup`. El
script `npm run cron:cleanup` del operador se comporta igual; el
dry-run (`--dry-run`) salta el collect además del borrado.
