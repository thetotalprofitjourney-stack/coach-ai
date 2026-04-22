# UX de Coach AI — recorrido del usuario

## Overview

Coach AI es una sesión anónima única de aproximadamente una hora, pensada como un recorrido lineal de tres fases encadenadas: un formulario inicial breve, una conversación de calibración en forma de test encubierto y, a continuación, una sesión de coaching abierta sobre una decisión concreta. El entregable final es un informe estructurado descargable en PDF y Word. El usuario no ve en ningún momento las palabras "DISC" ni los nombres de los modelos subyacentes (Haiku, Sonnet, Opus): percibe una primera conversación guiada con opciones, después una espera breve y por último un coach que le habla por su nombre y le devuelve preguntas. Toda la sesión vive bajo una única URL con un token UUID opaco; al cerrar, desaparece.

## 1. Landing (`/`)

Página pública sin cookies ni login. Un hero corto con el claim "Una sesión para trabajar una decisión" y una línea descriptiva honesta: IA entrenada para escuchar y preguntar, no para validar. Siguen las secciones "Qué es" (delimita frente a terapia y coaching humano), "Cómo funciona" (tres pasos: formulario breve, conversación inicial más sesión de coaching, informe final) y "Qué obtienes" (informe, anonimato, pago único, PDF y Word). A continuación, un bloque de vídeo que muestra "Vídeo próximamente" como fallback si falta `NEXT_PUBLIC_PROMO_VIDEO_URL`. El precio se inyecta desde `NEXT_PUBLIC_SESSION_PRICE_DISPLAY` y aparece junto a un "Pago único. Sin suscripción." Hay dos CTAs "Empezar mi sesión" (hero y pie de página), y un footer con enlace a `/privacidad`. Estado emocional esperado: curiosidad con cierta cautela ante una herramienta poco convencional. Tiempo previsto: entre uno y tres minutos.

## 2. Pago (Stripe Checkout hosted)

El CTA lleva al Checkout alojado de Stripe. El usuario introduce email, tarjeta y país en la UI propia de Stripe, totalmente fuera del dominio de la aplicación. Ese email no se vincula aún a ninguna sesión: la creación ocurre únicamente cuando el webhook de Stripe confirma el pago. El usuario percibe aquí el primer compromiso real (dinero + datos de pago). Tiempo previsto: entre uno y dos minutos. Si cancela desde Stripe, vuelve a `/pay/cancelled`, una pantalla con texto corto y un botón "Volver al inicio", sin penalizar ni persistir nada.

## 3. Aterrizaje post-pago (`/pay/success?cs=…`)

Tras el pago, Stripe redirige al dominio de la aplicación con un `checkout_session` en la query. El cliente hace polling cada segundo (hasta 30 intentos) contra el backend, esperando a que el webhook haya creado la fila de sesión y emitido su token. En la gran mayoría de los casos la respuesta llega en menos de tres segundos; el tope son 30 segundos. En cuanto hay token, el navegador redirige a `/session/{token}`. La pantalla intermedia es minimalista, con un spinner y un mensaje corto. Estado emocional: alivio breve, sensación de "ya está en marcha".

## 4. Formulario inicial (`/session/{token}` — status `created`)

La primera vez que el usuario entra a la URL de sesión, el router por status renderiza un formulario de seis campos: nombre (solo de pila), edad, composición familiar, zona geográfica amplia, momento profesional (un dropdown con opciones + un texto libre opcional) y disparador (campo narrativo donde describe qué le ha traído hoy). La validación es con Zod en cliente y servidor. No se pide email, ni apellido, ni teléfono, ni empresa: esa ausencia deliberada funciona como la primera señal fuerte de anonimato real. Tiempo previsto: dos a tres minutos. Como alternativas, el usuario puede abandonar aquí sin enviar el formulario; el cron lo borrará si pasan 24 horas sin actividad. Estado emocional: implicación creciente a medida que escribe el disparador, porque es la primera vez que formula el dilema en palabras.

## 5. Fase 1 — DISC contextualizado (`phase1_in_progress`)

Al enviar el formulario, la sesión entra en Fase 1 y el router muestra el chat de calibración. Son 16 ítems, ocho de contexto profesional y ocho de contexto personal, servidos uno a uno. Cada ítem plantea un escenario breve y cuatro opciones A, B, C y D, con la indicación explícita de que se puede responder "A a D, o ampliar con tus propias palabras". Entre ítem e ítem, un acuse breve valida la respuesta sin interpretarla. El usuario normalmente teclea una letra y, si quiere, matiza en lenguaje natural. Tiempo previsto: de 15 a 20 minutos, con algo menos de un minuto por ítem. Latencia por turno en torno a dos a cinco segundos, sostenida por Haiku. Estado emocional: concentración, sensación de "test pero no test", sin barras de progreso agresivas. El flujo es unidireccional: no hay vuelta atrás a ítems previos. Al completar el ítem 16, una despedida corta marca la transición a Fase 2.

## 6. Transición a Fase 2 (`phase1_completed` → bootstrap)

Entre Fase 1 y Fase 2 hay un estado intermedio en el que el servidor consolida el perfil DISC contextualizado y prepara el prompt de arranque para el coach. El usuario ve una pantalla sencilla con un spinner y el texto "Preparando tu sesión de coaching…". La espera real va de 60 a 120 segundos, porque por debajo corre Sonnet 4.6 con un presupuesto de thinking de aproximadamente 5.000 tokens. Es la primera espera larga del recorrido, y el copy tiene que sostenerla sin entrar en detalles técnicos. El hand-off entre IAs es totalmente interno, invisible al usuario. Estado emocional: anticipación más una leve impaciencia, especialmente si no ha leído de antemano que este paso existe.

## 7. Fase 2 — Coaching (`phase2_in_progress`)

La pantalla cambia a un chat más sobrio, sin opciones predefinidas: solo campo de texto libre. El coach saluda por el nombre de pila, reconoce implícitamente lo trabajado en Fase 1 y pregunta qué quiere sacar el usuario de la sesión. A partir de ahí, solo preguntas abiertas: no sugiere caminos, no valida emociones, no premia respuestas fáciles. La latencia por turno oscila entre 20 y 60 segundos (Opus 4.7 con thinking de unos 10.000 tokens); es, con diferencia, la fricción más fuerte del recorrido, porque no hay streaming, solo un spinner. Tiempo total: entre 40 y 50 minutos, con un tope aproximado de 50 turnos. El estado emocional oscila entre la incomodidad (preguntas que empujan) y momentos de claridad. Alternativas del usuario: pedir el cierre explícitamente ("creo que hemos terminado…") o cerrar la pestaña, en cuyo caso el cron borrará la sesión si pasan 24 horas sin actividad.

### Avisos progresivos hacia el cierre

El sistema inyecta marcadores invisibles al coach (`[[QUEDAN 10 PREGUNTAS]]` en el turno 40, `[[QUEDAN 5 PREGUNTAS]]` en el 45 y `[[CIERRA YA]]` en el 50) para que module el ritmo. El usuario no los ve nunca: percibe, simplemente, que el coach empieza a concretar, a pedir compromisos y a cerrar el arco de preguntas abiertas. Es un guardarraíl duro disfrazado de cambio conversacional natural.

## 8. Informe final (`phase2_completed`)

Al cerrar la conversación, el router muestra el informe estructurado en 11 bloques titulados: objetivo inicial, razón de peso, términos clave, objetivo reformulado, capacidades, carencias, riesgos, decisión, primer paso, señales de revisión y preguntas abiertas. Todos los bloques reflejan lo que el usuario ha dicho, sin opinión añadida. Debajo, dos botones primarios: "Descargar PDF" y "Descargar Word". Hay un botón secundario "Cerrar sesión" para quien quiera cerrar antes. La primera descarga (cualquiera de las dos) arranca un temporizador visible "La sesión se cerrará en 10:00" que cuenta hacia atrás; durante esos 10 minutos el usuario puede volver a descargar tantas veces como quiera, incluido el otro formato. Estado emocional: cierre, a menudo con la emoción propia de tener algo tangible sobre una decisión que hasta entonces era nebulosa.

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

1. Latencia de Opus con thinking entre 20 y 60 segundos por turno en Fase 2, sin streaming: solo spinner. Es el punto con mayor riesgo de abandono.
2. La transición a Fase 2 es la primera espera larga (60 a 120 segundos) y no hay feedback detallado si algo falla silenciosamente en el bootstrap.
3. No hay mecanismo de pausar y retomar: un refresh después de 24 horas pierde la sesión por el cron de limpieza.
4. El formulario inicial no tiene guardado local: un refresh antes de enviar borra lo escrito, incluido el disparador.
5. Si las dos descargas fallan dentro de los 10 minutos del informe, el usuario pierde acceso al entregable, porque no existe envío por email ni rescate posterior.
6. El temporizador de 10 minutos post-descarga es duro: una distracción puntual puede significar cierre automático sin aviso adicional.

### Decisiones que el usuario puede tomar

- Cancelar el pago desde Stripe y volver a la landing sin coste.
- Abandonar en cualquier fase; la sesión se borra pasadas 24 horas de inactividad.
- En Fase 1, responder con una letra o escribir texto libre para matizar cada ítem.
- En Fase 2, pedir explícitamente el cierre al coach cuando considere que ha terminado.
- En el informe, descargar PDF y Word varias veces durante la ventana de 10 minutos.
- Cerrar manualmente la sesión con el botón secundario en la pantalla del informe.

## Referencias en código

- Landing: `src/app/page.tsx`
- Router sesión: `src/app/session/[token]/page.tsx`
- Formulario: `src/app/session/[token]/InitialForm.tsx`
- Chat Fase 1: `src/app/session/[token]/Phase1Chat.tsx`
- Transición: `src/app/session/[token]/Phase2Bootstrap.tsx`
- Chat Fase 2: `src/app/session/[token]/Phase2Chat.tsx`
- Informe: `src/app/session/[token]/ReportView.tsx`
- Cerrada: `src/app/session/[token]/ClosedScreen.tsx`
- Post-pago: `src/app/pay/success/success-client.tsx`
