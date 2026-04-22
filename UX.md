# UX de Coach AI — recorrido del usuario

## Overview

Coach AI es una sesión anónima única de aproximadamente una hora, pensada como un recorrido lineal de tres fases encadenadas: un formulario inicial breve, una conversación de calibración en forma de test encubierto y, a continuación, una sesión de coaching abierta sobre una decisión concreta. El entregable final es un informe estructurado descargable en PDF y Word. El usuario no ve en ningún momento las palabras "DISC" ni los nombres de los modelos subyacentes (Haiku, Sonnet, Opus): percibe una primera conversación guiada con opciones, después una espera breve y por último un coach que le habla por su nombre y le devuelve preguntas. Toda la sesión vive bajo una única URL con un token UUID opaco; al cerrar, desaparece.

## 1. Landing (`/`)

Página pública sin cookies ni login. Un hero corto con el claim "Una sesión para trabajar una decisión" y una línea descriptiva honesta: IA entrenada para escuchar y preguntar, no para validar. Siguen las secciones "Qué es" (delimita frente a terapia y coaching humano), "Cómo funciona" (tres pasos: formulario breve, conversación inicial más sesión de coaching, informe final) y "Qué obtienes" (informe, anonimato, pago único, PDF y Word). A continuación, un bloque de vídeo que muestra "Vídeo próximamente" como fallback si falta `NEXT_PUBLIC_PROMO_VIDEO_URL`. El precio se inyecta desde `NEXT_PUBLIC_SESSION_PRICE_DISPLAY` y aparece junto a un "Pago único. Sin suscripción." Hay dos CTAs "Empezar mi sesión" (hero y pie de página). Junto al CTA principal aparece además un botón secundario "Prueba la conversación (3 turnos)" que abre la demo gratuita descrita abajo, y un footer con enlace a `/privacidad`. Estado emocional esperado: curiosidad con cierta cautela ante una herramienta poco convencional. Tiempo previsto: entre uno y tres minutos.

## 1b. Demo gratuita (`/preview/{token}`)

Entry alternativo: el visitante puede probar la conversación antes de pagar. Tres turnos con Haiku 4.5 usando un prompt comprimido pero no-directivo (sin sugerencias, sin validación emocional, sin muletillas; la única herramienta es la pregunta). Al arrancar, un banner ámbar persistente avisa "Demo · coach ligero (Haiku) · N/3 turnos. La sesión completa son 50 turnos con Opus detrás, tras un cuestionario de 15-20 min.", para que el visitante entienda desde el primer segundo que esto es una muestra, no el producto. Tras el turno 3 el coach cierra con una devolución breve y la pantalla sustituye el input por una CTA a la sesión completa y un enlace de vuelta a la portada. Coste acotado por diseño: max 3 turnos × max 400 tokens de Haiku, con cupo diario por IP hasheada (default 3 previews/día). Tiempo previsto: tres a cinco minutos. Estado emocional: curiosidad-de-prueba, y en los mejores casos la sorpresa de que el tono realmente no valida.

## 2. Pago (Stripe Checkout hosted)

El CTA lleva al Checkout alojado de Stripe. El usuario introduce email, tarjeta y país en la UI propia de Stripe, totalmente fuera del dominio de la aplicación. Ese email no se vincula aún a ninguna sesión: la creación ocurre únicamente cuando el webhook de Stripe confirma el pago. El usuario percibe aquí el primer compromiso real (dinero + datos de pago). Tiempo previsto: entre uno y dos minutos. Si cancela desde Stripe, vuelve a `/pay/cancelled`, una pantalla con texto corto y un botón "Volver al inicio", sin penalizar ni persistir nada.

## 3. Aterrizaje post-pago (`/pay/success?cs=…`)

Tras el pago, Stripe redirige al dominio de la aplicación con un `checkout_session` en la query. El cliente hace polling cada segundo (hasta 30 intentos) contra el backend, esperando a que el webhook haya creado la fila de sesión y emitido su token. En la gran mayoría de los casos la respuesta llega en menos de tres segundos; el tope son 30 segundos. En cuanto hay token, el navegador redirige a `/session/{token}`. La pantalla intermedia es minimalista, con un spinner y un mensaje corto. Estado emocional: alivio breve, sensación de "ya está en marcha".

## 4. Formulario inicial (`/session/{token}` — status `created`)

La primera vez que el usuario entra a la URL de sesión, el router por status renderiza un formulario de seis campos: nombre (solo de pila), edad, composición familiar, zona geográfica amplia, momento profesional (un dropdown con opciones + un texto libre opcional) y disparador (campo narrativo donde describe qué le ha traído hoy). La validación es con Zod en cliente y servidor. No se pide email, ni apellido, ni teléfono, ni empresa: esa ausencia deliberada funciona como la primera señal fuerte de anonimato real. Tiempo previsto: dos a tres minutos. Encima del formulario aparece el enlace de la propia sesión con un botón de copia y el recordatorio de que puede retomarla en las próximas 48 horas; esto cubre caídas de WiFi, cierres de pestaña y cambios de dispositivo sin romper el modelo anónimo. Los seis campos se autoguardan en `localStorage` a medida que el usuario teclea: si el navegador crashea o el usuario cierra la pestaña antes de enviar, al volver al mismo enlace los campos siguen ahí; el borrador se borra sólo tras un POST al formulario con éxito. Como alternativa, el usuario puede abandonar aquí sin enviar el formulario; el cron lo borrará si pasan 48 horas sin actividad. Estado emocional: implicación creciente a medida que escribe el disparador, porque es la primera vez que formula el dilema en palabras.

## 5. Fase 1 — DISC contextualizado (`phase1_in_progress`)

Al enviar el formulario, la sesión entra en Fase 1 y el router muestra el chat de calibración. Son 16 ítems, ocho de contexto profesional y ocho de contexto personal, servidos uno a uno. Cada ítem plantea un escenario breve y cuatro opciones A, B, C y D, con la indicación explícita de que se puede responder "A a D, o ampliar con tus propias palabras". Entre ítem e ítem, un acuse breve valida la respuesta sin interpretarla. El usuario normalmente teclea una letra y, si quiere, matiza en lenguaje natural. Tiempo previsto: de 15 a 20 minutos, con algo menos de un minuto por ítem. Latencia por turno en torno a dos a cinco segundos, sostenida por Haiku. Estado emocional: concentración, sensación de "test pero no test", sin barras de progreso agresivas. El flujo es unidireccional: no hay vuelta atrás a ítems previos. El input autoguarda el texto que el usuario está tecleando; si el envío falla (timeout, 5xx), el turno queda marcado como "pendiente de reintento" con botones "Reintentar" y "Descartar y editar", y un banner discreto avisa si el navegador pierde conexión. Al completar el ítem 16, una despedida corta marca la transición a Fase 2.

## 6. Transición a Fase 2 (`phase1_completed` → bootstrap)

Entre Fase 1 y Fase 2 hay un estado intermedio en el que el servidor consolida el perfil DISC contextualizado y prepara el prompt de arranque para el coach. El usuario ve una pantalla sencilla con un spinner y el texto "Preparando tu sesión de coaching…". La espera real va de 60 a 120 segundos, porque por debajo corre Sonnet 4.6 con un presupuesto de thinking de aproximadamente 5.000 tokens. Es la primera espera larga del recorrido, y el copy tiene que sostenerla sin entrar en detalles técnicos. El hand-off entre IAs es totalmente interno, invisible al usuario. Estado emocional: anticipación más una leve impaciencia, especialmente si no ha leído de antemano que este paso existe.

## 7. Fase 2 — Coaching (`phase2_in_progress`)

La pantalla cambia a un chat más sobrio, sin opciones predefinidas: solo campo de texto libre. El coach saluda por el nombre de pila, reconoce implícitamente lo trabajado en Fase 1 y pregunta qué quiere sacar el usuario de la sesión. A partir de ahí, solo preguntas abiertas: no sugiere caminos, no valida emociones, no premia respuestas fáciles. La latencia bruta por turno sigue siendo de 20 a 60 segundos (Opus 4.7 con thinking de unos 10.000 tokens), pero el endpoint ahora stream-ea los tokens según llegan mediante NDJSON; tras un spinner "Pensando…" inicial de pocos segundos, el coach pasa a "Escribiendo…" y el texto aparece palabra a palabra. La fricción del spinner largo queda resuelta en la práctica. Tiempo total: entre 40 y 50 minutos, con un tope aproximado de 50 turnos. El estado emocional oscila entre la incomodidad (preguntas que empujan) y momentos de claridad. Si un turno falla (timeout de Anthropic, stream roto, 5xx), el mensaje del usuario queda en la timeline marcado como pendiente con opacidad reducida y aparecen los botones "Reintentar" y "Descartar y editar"; tras 30 s sin resolverse, aparece además un botón para abrir un ticket de soporte con email y descripción corta (ver más abajo). Alternativas del usuario: pedir el cierre explícitamente ("creo que hemos terminado…") o cerrar la pestaña, en cuyo caso el cron borrará la sesión si pasan 48 horas sin actividad.

### Avisos progresivos hacia el cierre

El sistema inyecta marcadores invisibles al coach (`[[QUEDAN 10 PREGUNTAS]]` en el turno 40, `[[QUEDAN 5 PREGUNTAS]]` en el 45 y `[[CIERRA YA]]` en el 50) para que module el ritmo. El usuario no los ve nunca: percibe, simplemente, que el coach empieza a concretar, a pedir compromisos y a cerrar el arco de preguntas abiertas. Es un guardarraíl duro disfrazado de cambio conversacional natural.

## 8. Informe final (`phase2_completed`)

Al cerrar la conversación, el router muestra el informe estructurado en 11 bloques titulados: objetivo inicial, razón de peso, términos clave, objetivo reformulado, capacidades, carencias, riesgos, decisión, primer paso, señales de revisión y preguntas abiertas. Todos los bloques reflejan lo que el usuario ha dicho, sin opinión añadida. Debajo, dos botones primarios: "Descargar PDF" y "Descargar Word". Si el operador tiene SMTP configurado, aparece además un formulario opcional "Envíame una copia por email" con un único campo de email y un botón "Enviarme copia"; al enviar, el servidor genera el PDF y el DOCX en memoria, los adjunta y los manda vía SMTP al destinatario. La dirección no se persiste — sólo queda una marca técnica `emailed_at` para impedir reenvíos múltiples. Hay un botón secundario "Cerrar sesión" para quien quiera cerrar antes. La primera descarga (cualquiera de las dos) arranca un temporizador visible "La sesión se cerrará en 10:00" que cuenta hacia atrás; durante esos 10 minutos el usuario puede volver a descargar tantas veces como quiera, incluido el otro formato. El envío por email no arranca el timer ni lo detiene. Estado emocional: cierre, a menudo con la emoción propia de tener algo tangible sobre una decisión que hasta entonces era nebulosa.

## 9. Pantalla final (`closed`)

Cuando vence el temporizador, o cuando el usuario pulsa "Cerrar sesión", el router renderiza la pantalla final: "Sesión cerrada. Toda la información ha sido eliminada." No hay CTA para reintentar, ni para contactar, ni para comprar otra sesión desde esa misma vista; una sesión equivale a un pago y a un token, y ese token ya no vale para nada. Estado emocional: cierre limpio y, sobre todo, refuerzo explícito del compromiso de anonimato.

## Dimensiones transversales

### Anonimato percibido

- Landing y formulario sin email, teléfono ni creación de cuenta.
- URL de sesión con UUID opaco, sin slug identificable.
- Informe generado sin identificadores de tracking ni marcas temporales externas.
- Pantalla final con mención explícita al borrado de la información.
- Política detallada disponible en `/privacidad`, enlazada desde el footer.

### Timings resumidos

La landing se consume en uno a tres minutos. El pago en Stripe añade uno a dos minutos. El aterrizaje post-pago, con polling, rara vez supera los treinta segundos. El formulario inicial cuesta dos a tres minutos. La Fase 1 ocupa de 15 a 20 minutos. La transición a Fase 2 es la primera espera larga, de 60 a 120 segundos. La Fase 2 de coaching dura entre 40 y 50 minutos. Leer y descargar el informe lleva otros tres a cinco minutos, y sobre ese punto empieza la cuenta atrás automática de 10 minutos hasta el cierre. En total, un recorrido realista va de 60 a 90 minutos desde el CTA inicial hasta la pantalla de sesión cerrada.

### Fricciones conocidas

1. ~~Latencia de Opus con thinking entre 20 y 60 segundos por turno en Fase 2, sin streaming: solo spinner.~~ **Resuelta** por el streaming NDJSON de `/phase2/message` y `/phase2/bootstrap`: tras un spinner breve, el coach emite tokens en vivo ("Pensando…" → "Escribiendo…").
2. La transición a Fase 2 es la primera espera larga (60 a 120 segundos, Sonnet con thinking de 5k). La pantalla de espera pinta el enlace de retomar por si el usuario pierde conexión durante la síntesis; aun así, si algo falla silenciosamente en el bootstrap el feedback sigue siendo pobre.
3. ~~La ventana de reanudación es de 24 horas.~~ **Ampliada** a 48 horas (configurable por `SESSION_TTL_HOURS`, rango 12-168). Las pantallas de entrada muestran el enlace con botón de copia. Sigue pendiente: el enlace no se envía por email en ningún punto del flujo.
4. ~~El formulario inicial no tiene guardado local.~~ **Resuelta**: los seis campos se autoguardan en `localStorage` y se borran sólo tras envío con éxito. Los inputs de Fase 1 y Fase 2 llevan la misma mecánica.
5. ~~Si las dos descargas fallan dentro de los 10 minutos del informe, el usuario pierde acceso al entregable.~~ **Resuelta** por el envío opt-in por email (si SMTP está configurado). Sigue pendiente: no hay un canal de rescate post-cierre si el usuario no optó por el email.
6. El temporizador de 10 minutos post-descarga es duro: una distracción puntual puede significar cierre automático sin aviso adicional.
7. Si el coach o el administrador fallan de forma persistente (rate limit de Anthropic, timeout repetido), el usuario queda parado con su mensaje en estado pending. Mitigación actual: tras 30 s sin resolverse aparece un botón "Generar ticket" que envía email al operador con token + fase + error técnico, con la dirección del usuario como Reply-To para que el operador pueda contactar o iniciar un reembolso desde Stripe.

### Decisiones que el usuario puede tomar

- Cancelar el pago desde Stripe y volver a la landing sin coste.
- Abandonar en cualquier fase y retomar desde el mismo enlace dentro de las 48 horas siguientes; pasado ese plazo la sesión se borra por el cron.
- En Fase 1, responder con una letra o escribir texto libre para matizar cada ítem.
- En Fase 2, pedir explícitamente el cierre al coach cuando considere que ha terminado.
- En el informe, descargar PDF y Word varias veces durante la ventana de 10 minutos.
- Cerrar manualmente la sesión con el botón secundario en la pantalla del informe.

## Referencias en código

- Landing: `src/app/page.tsx` (incluye `PreviewButton` y `BuyButton`)
- Router sesión: `src/app/session/[token]/page.tsx`
- Formulario: `src/app/session/[token]/InitialForm.tsx`
- Chat Fase 1: `src/app/session/[token]/Phase1Chat.tsx`
- Transición: `src/app/session/[token]/Phase2Bootstrap.tsx`
- Chat Fase 2: `src/app/session/[token]/Phase2Chat.tsx`
- Informe: `src/app/session/[token]/ReportView.tsx`
- Cerrada: `src/app/session/[token]/ClosedScreen.tsx`
- Post-pago: `src/app/pay/success/success-client.tsx`
- Demo: `src/app/preview/[token]/PreviewChat.tsx`
- Aviso retomar: `src/app/session/[token]/ResumeLinkNotice.tsx`
- Banner offline: `src/app/session/[token]/OfflineBanner.tsx`
- Ticket soporte: `src/app/session/[token]/SupportTicket.tsx`
