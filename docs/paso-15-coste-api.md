# Paso 15 — Coste de API por sesión y latencia

Segundo paso post-MVP. Cierra las dos líneas de `proyecto-completo.md`
§7.3 que el Paso 14 dejó fuera:

- **Coste agregado de API por sesión** (literal: `total_cost_usd /
  sessions_phase2_completed`).
- **Tiempo medio de respuesta de cada llamada a Claude** (media por
  familia de modelo: Haiku, Sonnet, Opus).

Lo que **no** es este paso (§8): no añade analytics de terceros, no
añade dashboard web, no añade alertas de presupuesto, no expone coste
por sesión individual (imposible por diseño anti-PII — la sesión
concreta desaparece con el cron). Ver [§Fuera de
alcance](#fuera-de-alcance) al final para la lista explícita.

Requiere deploy con `db:migrate:deploy` — la migración
`20260421030000_add_llm_calls_and_cost_metrics` crea `llm_calls` y
añade 9 columnas a `daily_stats`.

---

## §1 Qué se recolecta

### §1.1 Tabla `llm_calls` (transitoria)

Una fila por llamada productiva a la API de Anthropic. Viven hasta el
cron nocturno: `collectDailyStats` agrega, y el cleanup las borra en
cascada junto con las sesiones. Consistente con §6.4 — ningún dato
concreto por sesión sobrevive al barrido diario.

| Columna | Qué guarda |
| --- | --- |
| `id` | UUID (PK) |
| `session_id` | FK a `sessions` con `ON DELETE CASCADE` |
| `model` | Etiqueta normalizada: `haiku-4-5` / `sonnet-4-6` / `opus-4-7` |
| `kind` | Cadena en `{fase1_admin, fase1_sintesis, fase2_auxiliar, fase2_coach_bootstrap, fase2_coach_turn}` |
| `input_tokens` | `response.usage.input_tokens` (uncached) |
| `output_tokens` | `response.usage.output_tokens` — incluye tokens de extended thinking |
| `cache_creation_input_tokens` | `response.usage.cache_creation_input_tokens` |
| `cache_read_input_tokens` | `response.usage.cache_read_input_tokens` |
| `duration_ms` | Latencia medida por el wrapper: `Date.now()` envuelto alrededor de `anthropic.messages.create` |
| `created_at` | Timestamp del insert |

Índices: `session_id` (cascade delete eficiente) y `created_at`
(bucket diario del recolector).

### §1.2 Columnas nuevas en `daily_stats`

Las 9 añade el `collectDailyStats` al final, agregando toda
`llm_calls` del día UTC por `model`. Todas **nullable**: un día sin
tráfico productivo no tiene valores y el upsert lo deja en `null`.

| Columna | Tipo | Qué cuenta |
| --- | --- | --- |
| `total_input_tokens` | BIGINT | Suma de `input_tokens` del día |
| `total_output_tokens` | BIGINT | Suma de `output_tokens` del día |
| `total_cache_creation_tokens` | BIGINT | Suma del cache write |
| `total_cache_read_tokens` | BIGINT | Suma del cache read |
| `total_cost_usd` | DOUBLE | Suma de `calculateCostUsd` por modelo (§2) |
| `avg_cost_usd_per_completed_session` | DOUBLE | `total_cost_usd / sessions_phase2_completed` si > 0, si no null |
| `avg_latency_ms_haiku` | INT | Media de `duration_ms` sobre filas con model `haiku-4-5` |
| `avg_latency_ms_sonnet` | INT | Media sobre `sonnet-4-6` |
| `avg_latency_ms_opus` | INT | Media sobre `opus-4-7` |

Tokens como `BIGINT` porque un día cargado acumula millones (el coach
Opus con thinking 10k escribe decenas de miles de tokens en la caché
por sesión × ~100 sesiones/día). Cost como `DOUBLE` en USD — la
alternativa de INT en céntimos es más exacta pero añade ruido al
formateo y el operador consume estas columnas para estimaciones, no
para conciliación contable (la fuente de verdad es el panel de
Anthropic).

---

## §2 Cómo se calcula el coste

La función pura `calculateCostUsd(modelLabel, usage)` en
`src/lib/metrics/pricing.ts`. Tarifas hardcoded por familia, cuatro
valores por familia (input, output, cache write, cache read),
expresados en **USD por Millón de tokens (MTok)**.

```
costeUsd =
  (inputTokens          * price.input      ) / 1_000_000 +
  (outputTokens         * price.output     ) / 1_000_000 +
  (cacheCreationTokens  * price.cacheWrite ) / 1_000_000 +
  (cacheReadTokens      * price.cacheRead  ) / 1_000_000
```

`total_cost_usd` del día se obtiene con un `prisma.llmCall.groupBy({
by: ['model'] })` que devuelve los tokens sumados por modelo; aplicamos
`calculateCostUsd` sobre cada fila del groupBy y sumamos. Una sola
ronda al DB.

### §2.1 Tarifas vigentes

Tabla consultada en **console.anthropic.com/pricing el 2026-04-21**.
Todos los valores están en USD por MTok.

| Modelo | input | output | cache write | cache read |
| --- | --- | --- | --- | --- |
| `haiku-4-5` | $1 | $5 | $1.25 | $0.1 |
| `sonnet-4-6` | $3 | $15 | $3.75 | $0.3 |
| `opus-4-7` | $15 | $75 | $18.75 | $1.5 |

### §2.2 Actualizar tarifas cuando Anthropic cambie precios

1. Editar el objeto `PRICING` en `src/lib/metrics/pricing.ts` con los
   nuevos valores.
2. Actualizar la constante `PRICING_SOURCE_DATE` al día de la
   consulta.
3. Actualizar la tabla §2.1 de este documento con los nuevos valores
   y fecha.
4. PR + merge + redeploy. **No requiere migración**: el coste de los
   días anteriores ya está consolidado en `daily_stats` y no se
   recalcula retroactivamente (los datos crudos en `llm_calls` ya no
   existen tras el cron).

Consecuencia: en el día del cambio, si hay tráfico entre el cambio de
tarifa y el cron siguiente, el coste real puede desviarse del
calculado por la franja pre-redeploy. Irrelevante para estimación
operativa; si importara, el operador concilia con la factura de
Anthropic.

### §2.3 Zonas grises

- **Cache write vs read.** El SDK devuelve `cache_creation_input_tokens`
  (primera llamada del run, pagada a tarifa de write) y
  `cache_read_input_tokens` (llamadas siguientes con el mismo prefijo,
  pagadas a tarifa de read, típicamente 10% del input normal). Ambas
  se contabilizan por separado.
- **Extended thinking.** Se factura como `output_tokens` en el SDK y
  así lo refleja `calculateCostUsd`. Verificado en la doc de Anthropic
  al 2026-04-21; si cambia, se ajusta `calculateCostUsd`. El coach de
  Fase 2 usa thinking 10k, la síntesis del hand-off thinking 5k.
- **Modelo desconocido.** Si Anthropic introduce un identificador
  nuevo y la aplicación lo empieza a devolver, `calculateCostUsd`
  emite un `console.warn` con `event=pricing_unknown_model` y devuelve
  0. Los tokens se siguen sumando en `total_*_tokens`, pero el coste
  del modelo desconocido no entra en `total_cost_usd`. La solución
  operativa es editar `PRICING` y redesplegar. La tabla `llm_calls` no
  necesita migración — el string del `model` ya se persiste tal cual.
- **Redondeo.** Se mantiene toda la precisión de `number` (IEEE 754)
  durante el cálculo. `metrics:show` formatea a 4 decimales cuando
  coste < $1 (para que el céntimo sea visible en volúmenes bajos) y a
  2 decimales en el resto.

---

## §3 Cómo interpretar `avgCostUsdPerCompletedSession`

Es la métrica literal de §7.3 "coste agregado de API por sesión". Se
define así:

```
avg_cost_usd_per_completed_session = total_cost_usd / sessions_phase2_completed
  cuando sessions_phase2_completed > 0
  null  cuando sessions_phase2_completed = 0
```

Dos matices importantes:

1. **El divisor son sesiones completadas en Fase 2 *del día*.** Si un
   usuario inicia una sesión el 20 y la completa el 21, entra en el
   divisor del 21 — `sessions_phase2_completed` particiona por
   `DATE(created_at)` (igual criterio que el Paso 14). El numerador
   agrega `llm_calls` por `DATE(created_at)` también. Ambos son
   consistentes salvo en sesiones que cruzan medianoche UTC: el coste
   se divide entre los dos días según qué llamadas caigan en cada
   bucket. En la práctica, a escala de muestras >50 sesiones/día, el
   ruido es <1%.

2. **El numerador incluye también llamadas de sesiones abandonadas.**
   Si un usuario completa Fase 1 y abandona, las ~16 llamadas del
   administrador ya se hicieron. Esas llamadas contribuyen a
   `total_cost_usd` pero la sesión no contribuye a
   `sessions_phase2_completed`. Consecuencia: la métrica sobrestima
   un poco el coste real por sesión útil. Tirando de SQL ad-hoc sobre
   `llm_calls` antes del cron, el operador puede separar coste por
   kind; a nivel agregado mensual el sesgo es estable y útil como
   señal de regresión.

**Nota ponderada.** El endpoint y el CLI exponen también
`weighted_avg_cost_usd_per_completed_session`, que es
`SUM(total_cost_usd) / SUM(sessions_phase2_completed)` sobre el
rango solicitado. No es la media de la columna diaria — es la media
ponderada por volumen, que es la cifra que interesa cuando el rango
cubre días con tráfico muy distinto.

---

## §4 Latencia

Una columna por familia: `avg_latency_ms_haiku`,
`avg_latency_ms_sonnet`, `avg_latency_ms_opus`. Se calcula como `AVG(
duration_ms )` sobre los `llm_calls` del día cuyo `model` empieza
por `haiku-`, `sonnet-` o `opus-` respectivamente.

`duration_ms` se mide en el wrapper con `Date.now()` envolviendo a
`anthropic.messages.create`: incluye red + tiempo de Anthropic, no
incluye el pre/post-procesado del handler (parsing de JSON,
validación Zod, upsert en DB). En la práctica el wrapper domina por
órdenes de magnitud.

### §4.1 ¿Por qué sólo media, no p50/p95?

Consistente con el Paso 14 para duración de sesión: allí sí llevamos
p50/p95 porque la distribución importa (el usuario que tarda 4h es
muy distinto del que tarda 40min). Aquí la distribución de latencia
por llamada es mucho más estrecha; la media detecta regresiones con
sensibilidad suficiente. Si en el futuro se quisieran p50/p95, el
operador puede sacarlos con SQL directo sobre `llm_calls` antes del
cron, o se añaden columnas nuevas en un paso posterior.

### §4.2 Extended thinking infla la latencia del Opus

El coach de Fase 2 usa `thinking.budget_tokens: 10_000`. Una llamada
productiva típica del coach tarda **20-60s** (sin incluir la primera,
que escribe la caché y tarda algo más). El `avg_latency_ms_opus`
refleja esa magnitud — no es una regresión, es la forma del producto.
El operador usa esta columna para detectar picos relativos, no para
perseguir un objetivo absoluto de "latencia baja".

---

## §5 Cómo consultar

Tres vías, heredadas del Paso 14 e idénticas en auth. Los tres
reflejan los campos nuevos automáticamente:

### §5.1 CLI (`npm run metrics:show`)

Añade tres columnas: `coste $`, `p/sesión $`, `lat Opus ms`. Si el
día no tiene datos, `—`.

```bash
npm run metrics:show                # últimos 30 días
npm run metrics:show -- --days 7    # última semana
```

Al final de la tabla, la línea de totales añade el coste total del
rango y el coste ponderado por sesión completada sobre el rango.

### §5.2 Endpoint (`GET /api/dev/stats`)

Cada fila de `rows[]` incluye los 9 campos nuevos. `totals` añade
`sumTotalInputTokens`, `sumTotalOutputTokens`,
`sumTotalCacheCreationTokens`, `sumTotalCacheReadTokens`,
`sumTotalCostUsd` y `weightedAvgCostUsdPerCompletedSession`. Auth y
formato de fechas idénticos al Paso 14.

### §5.3 SQL directo sobre `daily_stats` y `llm_calls`

Mientras la tabla `llm_calls` viva (antes del cron nocturno), el
operador puede preguntar cosas que no caben en las columnas
agregadas. Ejemplos:

```sql
-- coste del día en curso, desglosado por kind (sesiones aún vivas)
SELECT
  kind,
  COUNT(*) AS calls,
  SUM(input_tokens) AS in_tok,
  SUM(output_tokens) AS out_tok,
  AVG(duration_ms)::int AS avg_ms
FROM llm_calls
WHERE created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')
GROUP BY kind
ORDER BY kind;

-- ¿cuál es el coste medio por sesión-útil (p2c) en los últimos 30 días?
SELECT
  SUM(total_cost_usd)                  AS coste_total_usd,
  SUM(sessions_phase2_completed)       AS sesiones_completadas,
  SUM(total_cost_usd)::float
    / NULLIF(SUM(sessions_phase2_completed), 0) AS usd_por_sesion
FROM daily_stats
WHERE date >= current_date - INTERVAL '30 days';

-- latencia media del coach (Opus) por semana
SELECT
  date_trunc('week', date)::date AS semana,
  AVG(avg_latency_ms_opus)::int  AS opus_ms
FROM daily_stats
WHERE avg_latency_ms_opus IS NOT NULL
  AND date >= current_date - INTERVAL '12 weeks'
GROUP BY 1
ORDER BY 1;
```

---

## §6 Caveats conocidos

- **Modelo nuevo sin redeploy.** Si Anthropic introduce un modelo
  nuevo (p. ej. `opus-4-8`) antes de que el operador redespliegue con
  tarifas actualizadas, `calculateCostUsd` devolverá 0 para las
  llamadas de ese modelo durante el intervalo. Los tokens sí se
  cuentan (en `total_*_tokens`); el coste queda subestimado. El log
  `event=pricing_unknown_model` en stderr avisa.
- **Frontera del día (tokens y coste).** `llm_calls.created_at` usa
  el timestamp del insert (que ocurre segundos después del inicio de
  la request). Para llamadas largas del coach (20-60s con thinking)
  una minoría puede cambiar de bucket diario si cruza medianoche UTC.
  Efecto <0.1% a escala de muestreo diario.
- **Re-ejecuciones del cron.** `collectDailyStats` sigue siendo
  idempotente: re-ejecutar con la misma fecha UTC recalcula y pisa
  los 9 campos nuevos con los mismos números. Pero si el cron
  re-ejecuta **después** del cleanup (no pasa hoy — el cleanup borra
  las sesiones y con ellas las `llm_calls`), el recalculo devolvería
  0 en todas las columnas de coste. El diseño del `runNightly` ya
  evita esto: collect corre antes de cleanup y si collect falla, el
  cleanup no corre.
- **`recordLlmCall` silencioso.** Si el insert en `llm_calls` falla
  (DB caída, constraint, lo que sea), la llamada emite
  `event=llm_call_record_failed` en stderr y la request de usuario
  continúa sin rastro en la métrica. El agregado diario sigue
  funcionando con lo que haya persistido. Consecuencia: si hay un
  fallo masivo de métricas durante un día, ese día sale subestimado
  pero los usuarios no ven error.
- **`/api/dev/*` no cuenta.** Las rutas de validación del operador
  (`/api/dev/coach/run`, `/api/dev/coach/:runId/turn`,
  `/api/dev/fase1/run`, `/api/dev/fase1/:runId/answer`,
  `/api/dev/anthropic-ping`) **no** llaman a `recordLlmCall`. Por
  construcción: no son tráfico real y distorsionarían los agregados.
  El coste de ejercitar los fixtures piloto del Paso 12 **no** se ve
  en `daily_stats`.

---

## <a id="fuera-de-alcance"></a>§7 Fuera de alcance (por decisión)

Lista explícita para evitar scope creep en un Paso 16:

- **Alertas de presupuesto.** "Si `total_cost_usd > N`, avísame."
  Requiere un sink (email, Slack, webhook) que el MVP no tiene. El
  operador monitorea con `metrics:show` cada cierto tiempo.
- **Desglose por kind en `daily_stats`.** `total_cost_usd` es único
  por día. Si el operador quiere saber "cuánto gastó hoy el coach vs
  el administrador", usa SQL directo sobre `llm_calls` antes del
  cron (§5.3).
- **Coste por sesión individual.** Imposible por diseño anti-PII: la
  sesión concreta desaparece con el cron. `avgCostUsdPerCompletedSession`
  es el único coste "por sesión" que sobrevive.
- **Conversión a EUR.** La factura de Anthropic viene en USD; el
  operador convierte mentalmente cuando le interesa.
- **Latencia p50/p95.** Sólo media (§4.1).
- **Instrumentación de `/api/dev/*`.**
- **Dashboard web.**
- **Cambios en los prompts.** Este paso no toca prompts ni wrappers
  más allá de leer el `usage` que ya devolvían.

---

## §8 Migración y deploy

La migración `20260421030000_add_llm_calls_and_cost_metrics` crea la
tabla `llm_calls` con dos índices (`session_id`, `created_at`) y la
FK con `ON DELETE CASCADE` a `sessions`, y hace `ALTER TABLE
daily_stats` para añadir las 9 columnas nuevas (todas nullable).

En prod:

```bash
# dentro del directorio del proyecto en el servidor
docker compose --env-file .env.production -f docker-compose.prod.yml \
  run --rm app npx prisma migrate deploy
```

Detalles completos (usuario, permisos, rollback) en
[`paso-13-deploy.md`](./paso-13-deploy.md) §4.

**Primer cron tras el deploy.** La tabla `llm_calls` arranca vacía;
las sesiones vivas en ese momento no tienen llamadas registradas. El
recolector nocturno siguiente ve pocas filas (sólo las llamadas hechas
entre deploy y cron). A partir del segundo cron, la cifra es
completa. No hay backfill posible: las llamadas previas al deploy no
se persistieron y no se pueden reconstruir.

**Downtime.** La migración es puramente aditiva (tabla nueva +
columnas nullable). Postgres la aplica sin bloqueo significativo
sobre `sessions` (sólo añade una FK). El operador puede aplicarla con
la app corriendo.
