# Rúbrica de revisión humana — Paso 12

Este documento describe la checklist que el operador ejecuta antes de dar
el go al Paso 13 (producción). El producto es no supervisado (§6.4): no
se lee ninguna sesión real de usuario. La validación se hace sobre
artefactos generados por los fixtures de prueba y sobre una sesión
autoadministrada del operador contra staging.

## Artefactos a revisar

Antes de abrir esta rúbrica, lanzar los dos scripts contra un despliegue
con `ANTHROPIC_API_KEY` configurada:

```bash
SESSION_CREATE_SECRET=... FASE1_BASE_URL=https://... npm run fase1:compare
SESSION_CREATE_SECRET=... COACH_BASE_URL=https://... npm run e2e:compare
```

Al terminar cada script, revisar la tabla resumen de stdout y los
ficheros generados:

- `src/fixtures/handoffs-generados/{slug}.json` — 6 hand-offs (uno por
  perfil piloto). Gitignored.
- `src/fixtures/transcripts-generados/{slug}.md` — 6 transcripciones de
  Fase 2 con metadatos (turnos, duración, parseStatus). Gitignored.
- BD de la instancia: `final_reports`, `phase1_handoff`, `phase2_state`
  y `phase2_turns` persistidos (inspeccionables con `npm run db:studio`).

Los 6 slugs cubren los perfiles piloto: `daniel` (D-C), `carmen` (S-D),
`elena` (I-S), `javier` (D-C), `lucia` (C-D), `tomas` (I-D).

## §1 Hand-off generado

Para cada `src/fixtures/handoffs-generados/{slug}.json` contrastado con
`docs/handoff-0{N}-{slug}.md`:

- [ ] Parsea con `HandoffSchema` (el script aborta si no; si ha escrito
  el fichero es que parseó).
- [ ] `contexto_personal.nombre`, `edad`, `estado_civil_y_familia`,
  `zona_geografica`, `momento_profesional` coinciden textualmente con el
  formulario inicial del fixture.
- [ ] `perfil_disc.puntuaciones` refleja la dominancia esperada por el
  piloto (Daniel y Javier altos en D, Carmen alta en S, Elena alta en I
  y S, Lucía alta en C, Tomás alto en I). No se exige puntuación
  idéntica; se exige direccionalidad correcta.
- [ ] `perfil_disc.lectura_conductual` está en lenguaje llano, sin citar
  puntuaciones ni usar la jerga «D/I/S/C». Describe comportamiento, no
  rasgos. §5.1.3.
- [ ] `patron_personal_familiar` y `patron_profesional` son dos párrafos
  breves, en tercera persona, sin invenciones fuera del texto libre del
  fixture.
- [ ] `terminos_subjetivos` contiene entre 3 y 6 entradas. Para cada
  slug, deben aparecer términos recuperables del freetext del fixture o
  del disparador: daniel → «listo», «dar el salto»; carmen → «legado»,
  «buenas manos»; elena → «volver a ser yo», «cambio»; javier → «el
  siguiente nivel», «lo que haga falta»; lucia → «algo mío», «propósito»;
  tomas → «oportunidad única», «bueno para todos».
- [ ] `observaciones_y_tensiones` tiene exactamente 3 hipótesis con ids
  `H1`/`H2`/`H3`, concretas y sondeables por preguntas, marcadas como
  hipótesis (no como diagnóstico). Contienen orientación al coach sobre
  cómo sondear sin afirmar.
- [ ] `disparador_fase2` es el texto literal del formulario inicial del
  fixture, sin reescribir.

## §2 Transcripción de Fase 2

Para cada `src/fixtures/transcripts-generados/{slug}.md`:

- [ ] El coach nunca cita el hand-off textualmente. §5.2.
- [ ] El coach formula **preguntas abiertas**. No sugiere respuestas, no
  da ejemplos, no opina. §5.2.
- [ ] El coach **no valida emocionalmente** («entiendo cómo te sientes»),
  **no alaba** («qué buena reflexión»), **no predice**, **no aconseja**.
  Si aparece alguna de estas construcciones, marcar el slug como falla.
- [ ] El coach **desambigua términos subjetivos** del hand-off con
  preguntas de escena: preguntas sobre un lunes cualquiera, qué haría
  concretamente, ejemplos. Verificar que al menos un término del listado
  `terminos_subjetivos` del hand-off se toca en la transcripción.
- [ ] El coach **tolera el «no sé»** sin rellenarlo. Especialmente
  esperable en Elena («no lo tengo claro», «depende») y Lucía («no
  avanzo»). Si el coach cierra el hueco con una sugerencia en lugar de
  otra pregunta, marcar falla.
- [ ] El coach **sondea al menos 1 de las 3 hipótesis** `H1`/`H2`/`H3`
  del hand-off. La transcripción es corta (~10 turnos de usuario) — no
  se exigen las tres, pero sí que alguna aparezca.
- [ ] El coach **resume periódicamente** lo que el usuario ha dicho, en
  palabras del usuario. No se exige cadencia fija.
- [ ] Los niveles estimados (visibles en la cabecera de cada turno del
  coach en la transcripción) progresan hacia arriba a medida que avanza
  la conversación. No es lineal, pero no debería quedarse fijo en 1 los
  10 turnos.

## §3 Avisos progresivos de cierre — verificación estática y sesión real

El script del Paso 12 no alcanza el turno 40 (envía ~10 mensajes). Los
avisos `[[QUEDAN 10 PREGUNTAS]]` / `[[QUEDAN 5 PREGUNTAS]]` /
`[[CIERRA YA]]` requieren verificación por dos vías:

### §3.1 Revisión estática

- [ ] `src/lib/fase2/render-state.ts:4` — la constante `MAX_COACH_TURNS`
  sigue valiendo `50`.
- [ ] `src/lib/fase2/render-state.ts:57-59` — los umbrales de los avisos
  se inyectan en `nextTurn === 40`, `nextTurn === 45` y
  `nextTurn >= MAX_COACH_TURNS`.
- [ ] `docs/prompt-fase2.md` — las líneas del bloque «Aproximación al
  tope de turnos» y «comandos en corchetes dobles» siguen coherentes
  con los marcadores que inyecta `render-state.ts`.

### §3.2 Sesión autoadministrada en staging

El operador (no un usuario real) completa **una** sesión de prueba
contra staging poniéndose él mismo como usuario. Esto no viola §6.4: no
hay usuario tercero.

- [ ] La sesión se genera con un token de test y el operador responde
  al chat sin usar respuestas copy-paste del fixture (respuestas
  plausibles propias, para llegar al turno 40+).
- [ ] Al turno **40** el coach empieza a orientar la conversación hacia
  decisión + primer paso. No introduce temas nuevos; consolida.
- [ ] Al turno **45** el coach acelera: pregunta concreta sobre la
  decisión, sobre el primer paso, sobre señales de revisión.
- [ ] Al turno **50** se emite el informe final. Ocurre aunque la
  exploración no haya llegado al nivel 6.

Este ítem es **el único de la rúbrica que consume una run manual larga**
(~40-60 min). Si la rúbrica §1 y §2 se han cumplido en los 6 slugs, se
puede hacer una única vez con un slug escogido a mano (recomendado:
Lucía, por su tendencia declarada a no decidir).

## §4 Informe final (11 bloques)

Para cada sesión cerrada, abrir el PDF o el DOCX desde los endpoints
`GET /api/session/{token}/report/{pdf,docx}` (o leer `final_reports` de
la BD con `npm run db:studio`) y comprobar:

- [ ] Presentes los 11 bloques del §5.4:
  1. Objetivo inicial expresado.
  2. Razón de peso identificada.
  3. Significado concreto de los términos clave.
  4. Objetivo reformulado.
  5. Capacidades y recursos reconocidos.
  6. Carencias y puntos ciegos admitidos.
  7. Riesgos y renuncias identificados.
  8. Decisión tomada.
  9. Primer paso comprometido.
  10. Señales de revisión.
  11. Preguntas abiertas.
- [ ] Todos los bloques están rellenos **en palabras del usuario**, no
  reformulados por el coach.
- [ ] No hay consejos, ni afirmaciones nuevas introducidas por el coach
  en el informe.
- [ ] `parseStatus === 'ok'` en el resumen del script. Si es distinto,
  mirar qué bloque falta.

## §5 Tiempos agregados

- [ ] La tabla resumen del `e2e:compare` es coherente: 6 slugs, todos en
  `status=ok`, `coachTurns` ~11 cada uno, `userTurns=10`, duraciones en
  el orden de 2-4 minutos por slug con extended thinking. Si algún slug
  tarda >10 min o falla, revisar el log.

## Criterio go/no-go hacia el Paso 13

- **Go**: los 6 slugs pasan las rúbricas §1, §2, §4, §5 y la sesión
  autoadministrada §3.2 cumple los avisos de cierre. El producto está
  listo para producción.
- **No-go**: si al menos **uno** falla una línea de §1, §2 o §3 — abrir
  una iteración de prompts (nuevo paso 12bis) antes de seguir. No hay
  auto-rollback ni re-ejecución automática; la decisión es del operador.
- Fallos en §4 (bloques faltantes) con `parseStatus != ok` apuntan
  específicamente al parser del informe o al prompt de cierre; se
  arregla en código, no en prompts.
- Fallos en §5 (tiempos) no son criterio de go/no-go salvo que reflejen
  error (timeout, 500) en algún endpoint.
