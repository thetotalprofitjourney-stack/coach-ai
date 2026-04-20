# Proyecto — Coach AI (nombre provisional)

Documento técnico y funcional de referencia para desarrollo de la aplicación. Contiene el flujo completo del usuario, la arquitectura técnica, los prompts de las distintas IAs que intervienen, y las decisiones de producto ya cerradas que no deben reabrirse durante la implementación salvo que haya un bloqueo técnico real.

---

## 1. Visión y posicionamiento

Aplicación web que ofrece una sesión única de coaching profesional, asistida por IA, completamente anónima, sin registro de usuario y sin persistencia de datos personales. El usuario paga una sesión, realiza un perfil conductual DISC contextualizado, entra en una conversación de coaching sobre una decisión importante de su vida personal o profesional, y al terminar descarga un informe estructurado de cierre.

El producto se define por tres elecciones deliberadas que lo diferencian de cualquier asistente conversacional genérico:

- **Coach no-directivo, provocativo y honesto.** La IA no sugiere caminos, no valida emocionalmente de forma automática, no alaba la formulación del usuario. Su único instrumento es la pregunta. La conclusión sale del usuario.
- **Sesión acotada.** Tiene principio, desarrollo y cierre. Produce un entregable. La Fase 2 (la parte conversacional con el coach) se limita a un máximo de 50 turnos, lo que en la práctica equivale aproximadamente a una hora de conversación, aunque el límite real es el número de turnos, no el tiempo.
- **Anonimato real.** No hay cuenta, no hay login, no hay persistencia. El sistema de pago y el sistema de sesión están desacoplados. Al finalizar, se borra todo.

No es un coach de seguimiento. Cada sesión es un universo cerrado. Si el usuario quiere volver en el futuro, inicia otra sesión completa desde cero.

---

## 2. Flujo completo del usuario

### 2.1 Landing

Página pública accesible sin registro. Contiene:

- Explicación clara de qué es el producto, qué lo distingue y qué obtiene el usuario.
- Vídeo promocional.
- Mensajes clave sobre anonimato, duración, formato de entrega.
- Precio.
- Botón principal: "Empezar mi sesión".

Al pulsar el botón, se redirige a Stripe Checkout.

### 2.2 Pago

Stripe Checkout recibe el pago. Incluye los datos fiscales mínimos para que el ERP del operador pueda emitir la factura. Esos datos permanecen exclusivamente en el sistema de facturación y no se relacionan nunca con la sesión.

Al confirmarse el pago, la aplicación genera un **token de sesión** anónimo (UUID v4) y redirige al usuario a la aplicación con ese token en la URL.

El token es la única identificación de la sesión. No está asociado al email, al nombre de facturación, ni a ningún dato personal dentro del sistema de sesiones.

### 2.3 Formulario breve

Pantalla única, mínima fricción. Tiempo estimado: 2-3 minutos. Campos:

- Nombre (solo para que el coach le llame por su nombre durante la sesión; no se almacena más allá de la sesión).
- Edad.
- Estado civil y situación familiar (una línea de texto libre — por ejemplo "casado, dos hijos de 10 y 13").
- Zona geográfica (ciudad o área).
- Momento profesional actual (opciones: en activo por cuenta ajena / autónomo / emprendedor / desempleado / próximo a jubilarse / otro, con caja de texto libre).
- **Pregunta del disparador:** "¿Qué decisión o dilema quieres trabajar hoy? Cuéntalo en dos o tres frases, ábrete y cuéntamela, es la mejor manera de ayudarte." — texto libre.

Al enviar, se inicia la Fase 1.

### 2.4 Fase 1 — DISC contextualizado

Sesión conversacional con IA dedicada a esta fase. Duración estimada: 15-20 minutos.

El usuario ve un interfaz de chat donde va recibiendo 16 ítems en formato de dilema con cuatro opciones. Cada ítem presenta un escenario (8 profesionales y 8 familiares/personales) y cuatro alternativas de respuesta, cada una mapeada internamente a uno de los cuatro factores DISC (dominancia, influencia, estabilidad, cumplimiento).

El mensaje del coach para cada ítem tiene una estructura fija:

```
[Frase del escenario]
¿Qué harías?
A) [opción mapeada a D]
B) [opción mapeada a I]
C) [opción mapeada a S]
D) [opción mapeada a C]

(Puedes responder A, B, C o D, o ampliar la respuesta si lo necesitas.)
```

El usuario responde escribiendo en el campo de texto libre. Puede:

- Escribir "A", "B", "C" o "D" si una de las opciones le representa sin más.
- Escribir una respuesta libre que matice o amplíe — por ejemplo "la A, aunque también la C me pasa a veces, depende del momento", o incluso "ninguna me representa exactamente, más bien haría X".

La indicación que aparece bajo cada ítem ("Puedes responder A, B, C o D, o ampliar la respuesta si lo necesitas") es deliberada: sin ella, el usuario asumiría que sólo caben las cuatro letras. Con ella, se le abre explícitamente la puerta a la textura. El interfaz no debe mostrar botones clicables con las opciones, porque los botones empujan al usuario a la respuesta cerrada y neutralizan el valor del texto libre.

La aplicación registra internamente la opción principal elegida, cualquier opción secundaria mencionada, y el texto libre completo.

Entre ítems, el coach de Fase 1 puede devolver brevemente un acuse de recibo neutro (una o dos palabras) pero no debe comentar ni interpretar. El ritmo importa.

Al terminar los 16 ítems, una IA auxiliar lee todas las respuestas, calcula las puntuaciones DISC, cruza los patrones observados con el texto libre del formulario inicial y con cualquier texto libre adicional que haya aparecido durante los ítems, y produce el **hand-off estructurado** que alimenta la Fase 2.

El usuario ve una pantalla de transición breve ("Preparando tu sesión de coaching...") durante los segundos que la IA auxiliar tarda en producir el hand-off. No se le muestra el hand-off — es contexto interno de la Fase 2.

### 2.5 Fase 2 — Sesión de coaching

Sesión conversacional con el coach principal. Duración estimada: 40-50 minutos.

El coach recibe internamente el hand-off, saluda al usuario por su nombre, reconoce en una frase que viene de la Fase 1, y formula la primera pregunta invitándole a verbalizar en sus palabras qué quiere sacar de la sesión.

A partir de ahí, la conversación progresa a través de seis niveles de profundización (ver sección 5.3). El coach sigue los comportamientos obligatorios y prohibidos definidos en su prompt (ver sección 5.2).

El reloj de sesión se mide en **turnos conversacionales**, no en tiempo real. Un turno es un par (pregunta del coach, respuesta del usuario). Tope duro: 50 turnos. A partir del turno 40, la aplicación inyecta al coach avisos progresivos (`[[QUEDAN 10 PREGUNTAS]]`, `[[QUEDAN 5 PREGUNTAS]]`) para que empiece a preparar el aterrizaje de la decisión con margen, no para que corte en seco al llegar al 50.

El coach puede cerrar la sesión por tres disparadores:

1. El usuario pide explícitamente terminar ("hemos terminado, cerramos aquí, haz el informe").
2. El coach detecta claridad suficiente y propone al usuario pasar al informe.
3. Se alcanza el turno 50.

### 2.6 Informe final

Al activarse el cierre, el coach genera en su respuesta el **informe estructurado** (11 bloques, ver sección 5.4) como texto en el propio chat.

Inmediatamente después, la aplicación genera un fichero descargable en formato PDF.

El usuario ve en pantalla el informe con el botones de descarga. La sesión queda viva con un timer de 10 minutos tras la descarga, durante los cuales el usuario puede:

- Descargar de nuevo en caso de fallo.
- Pulsar explícitamente "Cerrar sesión".

Transcurridos los 10 minutos o al pulsar "Cerrar sesión", la sesión pasa a estado "cerrada" y el usuario es redirigido a una pantalla final de agradecimiento, en la que se le informa que toda la sesión ha sido eliminada de la base de datos. No puede volver a acceder.

Los datos de la sesión permanecen en base de datos hasta el cron nocturno, que los borra (ver sección 6.4).

---

## 3. Arquitectura general

### 3.1 Sistemas separados

La aplicación se compone de dos sistemas lógicamente separados, con un único puente entre ellos (Stripe):

**Sistema de facturación.**
- Gestiona el cobro a través de Stripe.
- No tiene acceso al sistema de sesiones.
- No conoce los tokens de sesión.

**Sistema de sesión.**
- Se activa al recibir la confirmación de pago desde Stripe vía webhook.
- Genera un token UUID anónimo que devuelve a Stripe como metadata del pago.
- Stripe redirige al usuario a la URL de la aplicación con ese token como parámetro.
- A partir de ese momento, todo lo que ocurre está asociado exclusivamente al token, nunca a datos de facturación.
- No almacena IPs, user-agents identificables, ni emails.

El puente entre ambos sistemas es exclusivamente Stripe. Si alguien quisiera relacionar un pago con una sesión desde dentro de la aplicación, no podría, porque la información de unión vive sólo en Stripe.

### 3.2 Stack tecnológico recomendado

Recomendado, no obligatorio. Si hay razones para desviarse, documentarlas.

- **Frontend:** Next.js + React + TailwindCSS. Diseño responsive (mobile-first) que funcione bien tanto en móvil como en escritorio. Tipografía legible, espaciado generoso, interfaz sobria sin distracciones.
- **Backend:** Next.js API routes o un backend ligero en Node (Fastify / Express). Node es la elección natural por compatibilidad con el frontend y con el SDK oficial de Anthropic.
- **Base de datos:** PostgreSQL. Suficiente para el caso de uso y facilita las operaciones de borrado programado.
- **Pagos:** Stripe Checkout (modo hosted) para minimizar compliance PCI.
- **IA:** API de Anthropic (Claude). Ver sección 5 para modelos concretos.
- **Generación de PDF:** biblioteca tipo `pdfkit` o `puppeteer` a partir de HTML.
- **Hosting:** Vercel para el frontend, Render/Fly.io/Railway para el backend con base de datos. Cualquier proveedor que permita cron jobs nocturnos vale.

### 3.3 Modelo de datos

Tablas principales del sistema de sesión:

**`sessions`**
- `id` (UUID, primary key — es el token del usuario).
- `status` (`created`, `phase1_in_progress`, `phase1_completed`, `phase2_in_progress`, `phase2_completed`, `closed`).
- `created_at` (timestamp).
- `closed_at` (timestamp, nullable).
- `user_name` (string, se borra al cerrar).
- `user_age` (int).
- `user_family_context` (string).
- `user_location` (string).
- `user_professional_moment` (string).
- `user_trigger` (string — la frase del disparador).

**`phase1_responses`**
- `id` (UUID).
- `session_id` (FK).
- `item_number` (int 1-16).
- `item_content` (JSON — escenario y opciones tal como se presentaron).
- `chosen_option` (char — A, B, C, D, o null si respuesta libre).
- `secondary_options` (array de chars, opcional).
- `free_text` (string, nullable).
- `created_at` (timestamp).

**`phase1_handoff`**
- `session_id` (FK, primary key).
- `handoff_content` (JSON estructurado — ver sección 5.1.3).
- `created_at` (timestamp).

**`phase2_turns`**
- `id` (UUID).
- `session_id` (FK).
- `turn_number` (int).
- `role` (`coach` o `user`).
- `content` (text).
- `created_at` (timestamp).

**`phase2_state`**
- `session_id` (FK, primary key).
- `current_level` (int 1-6).
- `hypotheses_explored` (array de strings — ids de hipótesis tocadas).
- `running_summary` (text — resumen estructurado actualizado por la IA auxiliar).
- `updated_at` (timestamp).

**`final_reports`**
- `session_id` (FK, primary key).
- `report_content` (JSON estructurado — los 11 bloques).
- `pdf_path` (string).
- `docx_path` (string).
- `downloaded_at` (timestamp, nullable).
- `created_at` (timestamp).

Todas las tablas tienen `session_id` como clave de borrado. El cron nocturno borra en cascada todo lo asociado a sesiones cuyo `closed_at` sea anterior a medianoche, y también las sesiones que lleven más de 24 horas en estado activo sin completarse (sesiones abandonadas).

---

## 4. Arquitectura de IAs

La aplicación emplea tres roles de IA, que pueden implementarse con dos o tres modelos distintos según coste y calidad:

### 4.1 IA de Fase 1 — administrador del DISC

Función: recibe el contexto del formulario, presenta los 16-18 ítems del DISC contextualizado, recoge respuestas, y al final redacta el hand-off estructurado.

Se puede implementar como un único agente que hace todo, o desacoplarse en dos partes: una que gestiona el flujo conversacional (muy ligero, prácticamente scripted) y otra que produce la síntesis final (más exigente). Recomendación: usar un modelo ligero (Haiku) para el flujo conversacional del DISC porque no requiere creatividad y usar un modelo intermedio (Sonnet) para la síntesis del hand-off, que sí requiere interpretación cruzada.

### 4.2 IA coach de Fase 2 — conversacional

Función: mantiene la sesión de coaching, hace preguntas, sostiene el rol no-directivo, detecta incoherencias, desambigua términos subjetivos, y cierra con el informe.

Esta es la pieza crítica del producto. Requiere el modelo más capaz disponible por dos razones: mantener el rol no-directivo es difícil y un modelo débil resbala hacia validación y sugerencia; generar preguntas de calidad que empujen al usuario a su propia claridad requiere finura.

Recomendación: Claude Opus 4.7 (o el modelo de máxima capacidad disponible en el momento del despliegue). Ha sido validado en pruebas.

### 4.3 IA auxiliar de análisis y resumen

Función: corre en paralelo durante la Fase 2. Tras cada turno, hace tres cosas:

1. Actualiza un **resumen estructurado** de lo que el usuario ha dicho hasta ahora (no lo que el coach ha dicho). Este resumen se inyecta en el prompt del coach en la siguiente llamada, para evitar enviar todo el historial literal.
2. Detecta si el turno reciente ha tocado alguna de las **hipótesis del hand-off** y actualiza la lista de hipótesis exploradas.
3. Detecta si han aparecido **nuevos términos subjetivos** en el lenguaje del usuario y los añade al listado de términos a desambiguar.

Esta IA no habla con el usuario. Sólo procesa y actualiza el estado de la sesión.

Recomendación: Claude Haiku 4.5. Es suficiente para la tarea, tiene latencia baja y coste mínimo.

### 4.4 Intercambio de datos con las IAs

Cada llamada al coach de Fase 2 contiene en el prompt del sistema:

```
[Prompt estático del coach]  
+
[Hand-off completo del usuario]  
+
[Estado dinámico de la sesión]:
  - Turno actual: N
  - Turnos restantes hasta el cierre: M
  - Nivel de profundización estimado: X
  - Hipótesis del hand-off exploradas: [...]
  - Hipótesis pendientes: [...]
  - Términos subjetivos desambiguados: [...]
  - Términos subjetivos pendientes: [...]
  - Resumen estructurado de lo dicho por el usuario: [texto]
```

En el array de mensajes se envían únicamente los **últimos 3-4 turnos literales** más el nuevo mensaje del usuario. Todo lo anterior vive en el resumen estructurado, no en los mensajes literales.

Caché de prompt activado: el prompt estático y el hand-off se cachean al inicio de la sesión y se leen al 10% del coste en cada llamada siguiente.

La aplicación inyecta avisos progresivos en el estado dinámico del coach según se acerca al tope:

Cuando `turno_actual == 40` (quedan 10 turnos):

```
[[QUEDAN 10 PREGUNTAS]]
```

Cuando `turno_actual == 45` (quedan 5 turnos — disparador de aterrizaje):

```
[[QUEDAN 5 PREGUNTAS]]
```

A partir de recibir `[[QUEDAN 5 PREGUNTAS]]`, el coach debe abandonar la exploración abierta y dedicar los turnos restantes exclusivamente a aterrizar: nombrar la decisión (aunque sea provisional), concretar el primer paso, definir señales de revisión.

En el turno 50, si el coach aún no ha propuesto pasar al informe, la aplicación inyecta:

```
[[CIERRA YA]]
```

El informe se genera entonces con la decisión tal como haya quedado aterrizada en los últimos turnos. La clave del diseño es que el cierre sea progresivo (5 turnos de aterrizaje, no corte súbito) para que el usuario salga siempre con al menos una decisión formulada, aunque la exploración previa haya sido menos profunda de lo ideal.

---

## 5. Prompts y especificaciones de las IAs

### 5.1 IA de Fase 1

#### 5.1.1 Banco de ítems DISC

El banco consta de **16 ítems fijos y únicos**, con reparto 8/8 entre dominio profesional y dominio personal/familiar. Los mismos 16 ítems se usan en todas las sesiones de todos los usuarios, sin rotación, sin variación, sin selección dinámica. Esto es deliberado: la comparabilidad y fiabilidad del DISC depende de que el instrumento sea estable. Si los ítems cambian entre sesiones, las puntuaciones no son interpretables y los patrones observados pierden significado.

El banco ya está diseñado y entregado como recurso fijo del proyecto en el fichero `banco-items-disc.json`, junto a este documento. Claude Code debe integrarlo como asset estático del código de la Fase 1, sin modificarlo salvo corrección explícita documentada en un nuevo despliegue.

Cada ítem del fichero tiene la siguiente estructura:

```json
{
  "id": 1,
  "dominio": "profesional" | "personal_familiar",
  "escenario": "Texto del escenario (1-2 frases).",
  "pregunta": "Pregunta de respuesta (por ejemplo, '¿Qué haces?').",
  "opciones": {
    "A": { "texto": "...", "factor": "D" },
    "B": { "texto": "...", "factor": "I" },
    "C": { "texto": "...", "factor": "S" },
    "D": { "texto": "...", "factor": "C" }
  }
}
```

Nota importante sobre el mapeo: la clave en el objeto (`A`, `B`, `C`, `D`) es la letra que ve el usuario en la interfaz, y es independiente del factor DISC al que está mapeada esa opción. La IA administradora y la IA sintetizadora leen el campo `factor` del objeto, no la letra del usuario. Esto evita cualquier sesgo de correlación entre letra y factor (por ejemplo, que el usuario aprenda inconscientemente que "la D es siempre el perfil cumplidor" si se mantuviera el orden D=D en todos los ítems).

Cualquier modificación futura del banco (corrección de un ítem, cambio de mapeo) requiere un nuevo despliegue, no un cambio en tiempo de ejecución. La aplicación es no supervisada en producción: no hay revisión por sesión, no hay regeneración, no hay intervención humana en el flujo de usuario.

#### 5.1.2 Prompt del coach de Fase 1

```
Eres la IA de la Fase 1 de una sesión de coaching. Tu función es administrar un cuestionario DISC contextualizado de 16 ítems de forma conversacional.

Comportamiento:
- Presenta cada ítem con su escenario y sus cuatro opciones exactamente como se te entregan.
- Añade al final de cada ítem: "(Puedes responder A, B, C o D, o ampliar la respuesta si lo necesitas.)"
- Entre ítems, acusa recibo brevemente y en neutral (una o dos palabras: "Entendido.", "Siguiente.", "Vamos."). Nunca comentes ni interpretes la respuesta del usuario.
- Si el usuario responde con letra simple, avanza al siguiente ítem.
- Si el usuario responde con letra más matización, registra ambas cosas y avanza.
- Si el usuario no elige ninguna letra, pide amablemente que indique cuál de las cuatro opciones se aproxima más a lo que haría.
- No saludes extensamente. No des devoluciones ni interpretaciones. No hagas preguntas que no sean las del banco de ítems.
- El objetivo es cubrir los 16 ítems con el mínimo rodeo posible.

Cuando el usuario haya respondido a los 16 ítems, despídete brevemente informando de que su sesión de coaching va a comenzar a continuación.
```

#### 5.1.3 Prompt de la IA que redacta el hand-off

```
Eres la IA de síntesis de la Fase 1. Recibes las respuestas del usuario a un DISC contextualizado y a un formulario inicial breve. Tu función es producir un hand-off estructurado que servirá de contexto al coach de la Fase 2.

El hand-off debe tener exactamente esta estructura, en formato JSON:

{
  "contexto_personal": {
    "nombre": "...",
    "edad": ...,
    "estado_civil_y_familia": "...",
    "zona_geografica": "...",
    "momento_profesional": "..."
  },
  "perfil_disc": {
    "puntuaciones": {"D": ..., "I": ..., "S": ..., "C": ...},
    "lectura_conductual": "Dos o tres párrafos de lectura conductual en lenguaje llano. Describe cómo decide el usuario, cómo se comporta bajo tensión, qué estilo de comunicación prefiere, qué tolerancia al riesgo y qué apertura a la discrepancia muestra. No uses jerga DISC. No cites las puntuaciones. Describe comportamiento."
  },
  "patron_personal_familiar": "Uno o dos párrafos con los patrones observados en las respuestas a ítems de escenario personal-familiar. Orientación al cuidado, tendencia al conflicto o a la acomodación, autoexpresión de deseos propios, etc.",
  "patron_profesional": "Uno o dos párrafos con los patrones observados en las respuestas a ítems de escenario profesional. Tolerancia a la rotación, preferencia por estabilidad o cambio, apego al dominio técnico frente a transversalidad, etc.",
  "terminos_subjetivos": ["lista de palabras cargadas de significado propio detectadas en el texto libre del usuario — disparador, matizaciones en ítems, etc. — que requieren desambiguación en Fase 2"],
  "observaciones_y_tensiones": [
    {
      "id": "H1",
      "contenido": "Hipótesis de tensión: texto que describe una posible contradicción, punto ciego o zona sensible detectada al cruzar el perfil DISC, los patrones observados y el disparador. Marcada explícitamente como hipótesis, no como diagnóstico. Incluye orientación para el coach sobre cómo sondear sin afirmar."
    },
    ...
  ],
  "disparador_fase2": "La frase del usuario en el formulario inicial, sin modificar."
}

Principios de redacción:

- La lectura conductual debe ser accionable, no una lista de rasgos. Algo que un coach pueda usar para calibrar preguntas.
- Las hipótesis deben ser concretas y sondeables. No generalidades.
- Si el DISC del usuario no muestra un factor dominante claro, la lectura debe reflejar equilibrio, no forzar un perfil.
- Nunca inventes datos que no estén en las respuestas del usuario.
```

### 5.2 IA coach de Fase 2

El prompt completo del coach de Fase 2 está en el documento adjunto `prompt-fase2.md`. Debe cargarse íntegro como `system` en la primera llamada, y cachearse.

Resumen de comportamientos clave:

- Lee el hand-off completo pero nunca lo cita al usuario.
- Formula preguntas abiertas. Nunca sugiere respuestas.
- Detecta incoherencias y las explora con preguntas, no las afirma.
- Busca la razón de peso. No acepta listas planas de motivos.
- Confronta el autoengaño con preguntas de evidencia concreta.
- Desambigua términos subjetivos con preguntas de escena.
- Tolera el "no sé" sin rellenarlo.
- Sostiene la incomodidad.
- Resume periódicamente lo que el usuario ha dicho.
- No valida emocionalmente, no alaba, no predice, no aconseja.
- Responde a los comandos de operador en corchetes dobles si aparecen (ver prompt).

### 5.3 Estructura en seis niveles

El coach recorre internamente seis niveles de profundización. No los anuncia al usuario.

1. Objetivo declarado
2. Razón de peso
3. Concreción del objetivo
4. Evaluación de capacidades y recursos
5. Riesgos y renuncias
6. Decisión y primer paso

### 5.4 Informe de cierre

Estructura de 11 bloques. El informe es una sistematización de lo que el usuario ha dicho, no una síntesis del coach ni un consejo.

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

El coach genera este informe como texto estructurado. La aplicación lo parsea y produce PDF y Word a partir de él.

### 5.5 IA auxiliar

```
Eres la IA auxiliar de análisis de una sesión de coaching en curso. Recibes en cada llamada:

1. El hand-off estructurado del usuario.
2. El resumen estructurado actual de lo dicho por el usuario.
3. El último par de turnos (pregunta del coach + respuesta del usuario).

Tu tarea es devolver un JSON actualizado con:

{
  "nuevo_resumen": "Versión actualizada del resumen estructurado del usuario. Mantén el formato de hechos en viñetas cortas, siempre en palabras del usuario. No interpretes. No añadas emoción. Si el último turno no aporta nada nuevo, devuelve el resumen anterior sin cambios.",
  "hipotesis_tocadas": ["lista de ids de hipótesis del hand-off que se han sondeado en el último turno, si las hay"],
  "nuevos_terminos_subjetivos": ["lista de términos subjetivos que han aparecido en el último turno del usuario y que aún no estaban en el listado"],
  "nivel_estimado": "1-6, tu estimación del nivel de profundización actual basada en la conversación"
}

Sé rápido, breve y preciso. No expliques tus decisiones. Sólo devuelve el JSON.
```

---

## 6. Especificaciones técnicas detalladas

### 6.1 Frontend

- Responsive, mobile-first. Debe funcionar cómodamente en pantallas de 375px de ancho en adelante.
- Interfaz de chat con burbujas claras, alineadas izquierda (coach) y derecha (usuario).
- Tipografía legible, tamaño base 16px en móvil, 17-18px en escritorio.
- Paleta sobria: fondos neutros (blanco o crema), texto oscuro, un color de acento discreto para botones de acción.
- Sin emojis, sin iconos decorativos excesivos. La sobriedad es parte del producto.
- Indicador claro de "el coach está escribiendo..." durante las llamadas a la IA.
- Scroll automático al nuevo mensaje.
- El campo de texto debe permitir altura variable (crecer al escribir párrafos largos).
- Botón de envío claro. Enter envía en escritorio (Shift+Enter para salto de línea). En móvil, botón de envío explícito.
- Barra superior mínima con nombre del producto y un indicador discreto de la fase actual (sin distraer).

### 6.2 Backend y API

Endpoints principales:

- `POST /api/session/create` — llamado desde el webhook de Stripe al confirmarse el pago. Genera token y devuelve URL.
- `POST /api/session/{token}/form` — recibe los datos del formulario inicial.
- `POST /api/session/{token}/phase1/next` — envía la respuesta al ítem actual y recibe el siguiente.
- `POST /api/session/{token}/phase1/finish` — dispara la generación del hand-off.
- `POST /api/session/{token}/phase2/message` — envía un mensaje del usuario al coach y recibe la respuesta.
- `POST /api/session/{token}/phase2/finish` — fuerza el cierre y genera el informe.
- `GET /api/session/{token}/report/pdf` — descarga PDF.
- `GET /api/session/{token}/report/docx` — descarga Word.
- `POST /api/session/{token}/close` — cierra la sesión explícitamente.

Todos los endpoints validan que el token exista, esté en el estado adecuado para la operación solicitada, y no haya sido cerrado.

### 6.3 Borrado programado

Cron job nocturno (ejecutado entre las 3:00 y las 5:00 hora local del servidor). Tareas:

1. Borrar todas las sesiones con `status = 'closed'`.
2. Borrar todas las sesiones con `created_at` anterior a hace 24 horas y `status != 'closed'` (sesiones abandonadas).
3. Borrar todos los ficheros PDF y DOCX asociados a las sesiones borradas en el almacenamiento.
4. Registrar en un log de auditoría (sin datos personales) el número de sesiones borradas.

El borrado debe ser un hard delete, no soft delete. El objetivo es que no quede rastro.

### 6.4 Seguridad y privacidad

- HTTPS obligatorio.
- El token de sesión en la URL debe ser suficientemente aleatorio para no ser adivinable (UUID v4 es suficiente).
- No se almacena IP del usuario en el sistema de sesiones.
- No se almacenan cookies identificadoras. Sólo una cookie de sesión mínima con el token, que se borra al cerrar la pestaña.
- Política de privacidad pública que explique el modelo de anonimato, la ventana de 24 horas, y la separación entre facturación y sesión.
- Cumplimiento RGPD: al operar en España, el operador debe asegurarse de que el sistema de facturación cumple con los requisitos de almacenamiento fiscal (6 años, habitualmente), pero que el sistema de sesiones no está sujeto a esa obligación porque no contiene datos personales identificables una vez generado el token.
- Todas las llamadas a la API de Anthropic deben usar la clave del operador y no transmitir identificadores que permitan vincular al usuario final.

### 6.5 Generación de entregables

**PDF.** A partir del informe estructurado en JSON, se genera un HTML con estilos tipográficos cuidados (portada con fecha y nombre del usuario, 11 secciones con títulos claros) y se convierte a PDF. El resultado debe ser un documento legible, imprimible, con márgenes generosos.

El fichero debe llevar en el pie una marca sobria ("Informe generado por [nombre del producto] — [fecha]"), sin URLs promocionales.

---

## 7. Consideraciones de desarrollo

### 7.1 Orden de construcción sugerido

La Fase 1 y la Fase 2 son igualmente críticas. La Fase 1 produce el hand-off que es el contrato de entrada de la Fase 2; sin un hand-off de calidad, la Fase 2 no puede operar. La Fase 2 ejecuta el valor de producto principal sobre ese contrato. Ambas deben desarrollarse con el mismo nivel de cuidado.

El orden sugerido optimiza por: (a) poder probar cada pieza aislada antes de integrar, (b) construir primero lo más estándar y probado, (c) dejar lo crítico para cuando los fundamentos funcionan.

1. Modelo de datos y migraciones.
2. Endpoints básicos de creación de sesión y formulario inicial.
3. Frontend del formulario inicial.
4. Integración con Anthropic SDK — llamada básica funcionando con prompt caching.
5. **Fase 2 en modo validación aislada:** implementar el coach de Fase 2 cargando directamente uno de los seis hand-offs de prueba como fixture hardcodeado. Frontend del chat. Validar que el rol funciona como en las pruebas del proyecto piloto.
6. **Fase 1 completa:** integración del banco `banco-items-disc.json` como recurso estático, prompt de administración del DISC, lógica de registro de respuestas, prompt de síntesis del hand-off, validación de que el hand-off producido tiene la misma estructura y calidad que los hand-offs de prueba del piloto.
7. Integración end-to-end: Fase 1 → hand-off → Fase 2 → informe, usando datos reales de un usuario simulado completo.
8. Generación del informe final + descarga PDF
9. Borrado programado.
10. Stripe e integración de pago.
11. Landing pública.
12. Testing end-to-end con los seis perfiles de prueba.
13. Producción.

Razón del orden: los pasos 5 y 6 son los dos hitos de validación crítica del producto. El paso 5 valida la Fase 2 con hand-offs que sabemos que son de calidad (los del piloto). El paso 6 valida que la Fase 1 es capaz de producir hand-offs de esa misma calidad. Si cualquiera de los dos falla, el resto del producto no tiene sentido hasta que se corrija.

### 7.2 Testing

Tests manuales por cada fase del flujo:

- Formulario inicial con datos válidos e inválidos.
- Fase 1 completa con diferentes patrones de respuesta (todas las letras, mezclas, texto libre).
- Validación de que los hand-offs producidos por la Fase 1 son comparables en calidad a los hand-offs de prueba del piloto.
- Fase 2 con los seis perfiles de prueba ya redactados (Daniel, Carmen, Elena, Javier, Lucía, Tomás). Comprobar que el coach mantiene el rol en los seis.
- Cierre por los tres disparadores: explícito del usuario, detección del coach, aterrizaje progresivo en los últimos 5 turnos al aproximarse al tope de 50.
- Generación y descarga de PDF y Word.
- Borrado nocturno.
- Flujo completo desde pago hasta cierre.

No se requiere cobertura automatizada exhaustiva para el MVP, pero sí tests manuales documentados de cada flujo crítico.

### 7.3 Métricas y observabilidad

Sin datos personales. Sólo eventos agregados:

- Sesiones iniciadas / completadas / abandonadas por fase.
- Duración media de sesión.
- Número medio de turnos por sesión.
- Tasa de descarga de informe.
- Coste agregado de API por sesión.
- Tiempo medio de respuesta de cada llamada a Claude.

Los logs de aplicación no deben contener contenido conversacional, solo metadatos.

### 7.4 Internacionalización

Primera versión: solo español. Toda la interfaz, prompts, ítems DISC, e informes en español. El código debe estructurarse con los textos separados en ficheros de recursos para facilitar una futura versión en otros idiomas, pero la versión MVP es monolingüe.

---

## 8. Qué no está en el alcance del MVP

Para evitar scope creep:

- No hay login, ni cuenta de usuario, ni historial de sesiones.
- No hay seguimiento, re-sesión, ni conexión con sesiones pasadas.
- No hay compartir informe, ni enviar por email desde la aplicación.
- No hay integración con calendarios, CRMs, o herramientas externas.
- No hay dashboards de administración para el operador (más allá de métricas agregadas básicas).
- No hay A/B testing de prompts.
- No hay cupones, planes, suscripciones. Una sesión = un pago.
- No hay multi-idioma.
- No hay versiones corporativas ni cuentas compartidas.

Cualquiera de estas funcionalidades puede añadirse después. No deben construirse anticipadamente.

---

## 9. Documentos anexos

Junto a este documento principal deben estar disponibles para el desarrollo:

- `prompt-fase2.md` — prompt completo y validado del coach de Fase 2.
- `banco-items-disc.json` — banco fijo de 16 ítems DISC contextualizados, recurso estático que integra la Fase 1.
- Los seis hand-offs de prueba: `handoff-01-daniel.md`, `handoff-02-carmen.md`, `handoff-03-elena.md`, `handoff-04-javier.md`, `handoff-05-lucia.md`, `handoff-06-tomas.md` — como fixtures de test para la Fase 2.

Los prompts de la IA de Fase 1 (administración y síntesis) y de la IA auxiliar de Fase 2 están especificados en este documento (secciones 5.1.2, 5.1.3 y 5.5) y deben materializarse como archivos independientes durante el desarrollo.
