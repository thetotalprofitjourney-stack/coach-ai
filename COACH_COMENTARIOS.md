# Coach AI — comentarios del revisor

Valoración independiente. Opinión honesta de revisor externo, no material de
marketing. El tono es directo; si algo no convence, se dice. Si algo
convence, también.

## Puntuaciones

### Idea del producto: 8/10

Concepto acotado y diferenciado: coaching no-directivo, sesión única real,
anonimato sin registro y un entregable tangible (informe en 11 bloques). La
apuesta editorial del "una sesión = una decisión" y el anti-seguimiento
deliberado es atípica y tiene cuerpo. Penaliza que el mercado está educado
hacia chatbots conversacionales baratos o gratis, y que la barrera de pagar
antes de probar es alta para una marca que aún no existe en la cabeza del
usuario.

### Funcionamiento técnico: 8.5/10

Arquitectura limpia y disciplinada: separación pago/sesión por diseño,
higiene anti-PII en logs y agregados, prompt caching activo, migraciones
ordenadas, cron de borrado real, tres modelos Anthropic con roles bien
diferenciados, y una orquestación auxiliar+coach con estado reconstruible
que aguanta recargas. Penaliza la ausencia de rate limiting en endpoints
públicos productivos (la demo `/preview` sí tiene cupo diario por IP
hasheada; el Checkout sigue sin límite), la ausencia de retry automático
visible ante caídas transitorias de Anthropic (el SDK hace 2 retries
internos pero no hay backoff explícito en el código propio), y la
inexistencia de tests automatizados (aunque esté declarado fuera de
alcance MVP, es deuda conocida). La crítica original al spinner largo
de Fase 2 queda obsoleta: desde la primera iteración post-revisión las
rutas del coach emiten tokens via NDJSON streaming.

## Punto fuerte principal

El rol no-directivo validado por prompt más la arquitectura que lo
sostiene. El coach nunca valida emocionalmente ni sugiere caminos, sólo
pregunta; combinado con el cierre forzado a 50 turnos y el informe
estructurado, el producto cierra un arco emocional completo en una sola
sentada. Eso un ChatGPT genérico no lo hace por defecto — tiende a
simpatizar, reencuadrar, ofrecer listas — y un coach humano tarda
semanas en establecerlo con un cliente nuevo. Esa consistencia editorial
sostenida durante toda la sesión es el activo real del producto.

## Debilidades y riesgos de producto

Las debilidades técnicas están documentadas en otro sitio. Aquí las de
producto, que son las que pueden hundir la conversión.

1. **Dependencia absoluta de la calidad del LLM en un único turno
   difícil.** Si el coach resbala a validación emocional en el turno 5,
   no hay recuperación manual. No hay supervisor humano por diseño, y la
   promesa se rompe en ese turno.
2. **Confianza fría.** Pedir 120-150 € por una sesión con una IA anónima
   exige mucha fe inicial. Sin testimonios, sin caso de estudio visible,
   la conversión del primer millar de visitantes va a ser dura.
3. **No re-capturabilidad.** Al no haber historial, el usuario que
   vuelve dentro de un mes empieza de cero y paga otra vez. Puede
   sentirse como pérdida en vez de como feature si el copy no lo
   posiciona bien desde la landing.
4. **Expectativa vs. realidad.** La palabra "coaching" evoca terapia
   para mucha gente, y la Fase 1 con 16 ítems tipo test puede romper la
   promesa para quien esperaba entrar directamente al problema. El copy
   debe explicitar el arco antes del pago.
5. ~~**Fricción de la espera.**~~ **Atenuada.** La Fase 2 ya stream-ea
   tokens en vivo; el "coach está pensando" ahora es visible como
   texto apareciendo, no como spinner opaco. La transición inicial a
   Fase 2 (Sonnet + thinking 5k) sigue siendo de 60-120 s y es ahora
   la espera larga dominante.
6. ~~**Sin soporte post-sesión.**~~ **Resuelta en parte.** La ventana
   de reanudación pasa a 48 h (configurable 12-168). Las pantallas de
   entrada muestran el enlace con botón de copia. Tras 30 s de error
   persistente aparece un botón para abrir ticket con email del
   usuario; llega al operador vía SMTP con el token para que pueda
   reembolsar desde Stripe si procede. Sigue faltando un canal de
   soporte cuando el usuario cierra la sesión sin ticket y quiere
   volver días después.

## A quién puede ayudar de verdad

### Perfiles donde brilla

- **Profesional en cambio de carrera con exceso de input consultivo
  familiar y de pares**: la red social opina demasiado y el sujeto
  necesita un espacio sin opinión externa para formular él mismo qué
  quiere. El "todo el mundo me dice qué hacer y yo sigo igual" encaja
  exacto con lo que el producto ofrece.
- **Autónomo rumiando una decisión de negocio** (cerrar, pivotar,
  contratar, despedir) sin sparring apropiado. El valor es convertir la
  rumia solitaria en discurso estructurado; el informe final funciona
  como documento de decisión para releer al día siguiente.
- **Directivo con tema personal que no puede hablar con su red
  profesional**: salud familiar, valoración de mudanza con pareja en
  contra, conflicto con socio, salida del armario en entorno
  conservador. Aquí el anonimato radical es feature core, no adorno: no
  puede usar coach conocido, no quiere terapeuta en el historial médico.

### Perfiles donde NO brilla

- **Problemas clínicos o de salud mental**: ansiedad significativa,
  depresión, duelo, ideación suicida. El copy ya dice que no es
  terapia, pero una parte del tráfico lo confundirá igual. Hace falta
  un filtro conversacional temprano, no sólo un disclaimer legal.
- **Decisiones con respuesta técnica conocida** ("¿acepto este
  contrato?" cuando lo que falta es información factual, no reflexión).
  El no-directivo no resuelve lo que se resuelve leyendo la cláusula.
- **Usuarios que buscan validación rápida**: el no-directivo les va a
  frustrar en los primeros turnos y abandonarán pidiendo reembolso.
- **Personas con dificultad para escribir textos largos**: baja
  alfabetización digital, lengua no nativa, discapacidad motora. El
  producto es 100% texto, sin voz, y eso excluye de facto a un
  segmento.

## Mejoras de producto sugeridas

Ordenadas de mayor a menor impacto estimado sobre conversión y
satisfacción. Las cuatro primeras están implementadas tras la primera
revisión; se conservan con tachado como histórico.

1. ~~**Streaming de respuesta del coach.**~~ **Hecho.** Rutas
   `/phase2/bootstrap` y `/phase2/message` emiten NDJSON con eventos
   `delta`/`done`/`error`; el cliente renderiza los tokens según llegan.
   El botón pasa de "Pensando…" (sending) a "Escribiendo…" (streaming).
2. ~~**Preview gratuito de 5 minutos.**~~ **Hecho.** `/preview/{token}`
   ofrece una mini-sesión de 3 turnos con Haiku 4.5 y un prompt
   comprimido no-directivo. Cupo diario de 3 previews/IP hasheada
   (config). Banner ámbar persistente "Demo · coach ligero (Haiku) ·
   N/3 turnos…" para gestionar expectativa.
3. ~~**Reenvío del informe por email opt-in.**~~ **Hecho.** En la
   pantalla del informe, campo opcional "Envíame una copia por email";
   al enviar, SMTP genérico manda PDF+DOCX adjuntos y marca `emailed_at`
   sin persistir la dirección. Un envío por sesión.
4. ~~**Pausa y reanudación en 48h con enlace temporal.**~~ **Hecho.**
   `SESSION_TTL_HOURS` (default 48, clamp 12-168) controla la ventana
   del cron. En las pantallas de entrada aparece un `ResumeLinkNotice`
   con la URL completa y botón de copia. El token sigue siendo un UUID
   v4 verificado vía lookup en BD (equivalente a HMAC).
5. **Testimonios y caso de estudio anónimos en landing.** Dos o tres
   narrativas reales (con permiso explícito) de los pilotos,
   convertidas en prosa breve. Es el remedio clásico a la confianza
   fría y cuesta poco producirlo. Pendiente.
6. **Copy más explícito sobre la estructura de la sesión.** Marcar en
   la landing que hay un cuestionario conversacional de 15-20 min
   ANTES del coaching, no después. Gestionar expectativa reduce
   abandono en Fase 1. Pendiente.
7. **Voz opcional (roadmap, no MVP).** Input y output por voz (Whisper
   + TTS) para público que no escribe con fluidez. Cambio grande, pero
   es la siguiente frontera natural del producto. Pendiente.

### Resiliencia añadida fuera de la lista original

Durante la implementación se añadió una capa de resiliencia que no
estaba en las sugerencias iniciales pero resuelve dolores reales: (a)
borradores autoguardados en `localStorage` del formulario inicial y
de los inputs de Fase 1/Fase 2 para que un crash de navegador o un
corte de luz no pierda lo escrito; (b) mensajes marcados "pending"
con botones "Reintentar" y "Descartar y editar" cuando un turno del
coach falla (timeout, 5xx); (c) banner de conexión que desactiva
Enviar cuando `navigator.onLine` dice false; (d) ticket de soporte
tras 30 s de error persistente — form inline con email del usuario
(Reply-To) y descripción corta, email al operador con el token para
que pueda investigar y reembolsar desde Stripe si procede.

## Precio sugerido

En `.env.example` la variable `NEXT_PUBLIC_SESSION_PRICE_DISPLAY` está
vacía y `STRIPE_PRICE_ID` también: el precio aún no está configurado
formalmente. Lo que sigue es recomendación para cuando se fije.

Benchmark del mercado relevante:

- Coaching humano certificado en España: 60-120 €/sesión de 60 min,
  con compromiso habitual de 3-6 sesiones (total 300-700 €).
- BetterHelp / Talkspace: 240-400 €/mes por acceso continuo a
  terapeuta vía chat. Modelo suscripción, no pago único.
- Terapia privada breve en España: 60-90 €/sesión, 4-8 sesiones,
  total 300-700 €.
- Asistentes AI conversacionales generalistas: ChatGPT Plus o Claude
  Pro rondan los 20 €/mes de acceso general ilimitado.

**Rango recomendado: 85-120 € para el MVP**, subiendo progresivamente
hacia 150 € una vez haya testimonios, caso de estudio y cierta huella
de marca. Razonamiento:

- El coste marginal por sesión es de unos 3-5 € a Anthropic, con
  margen holgado en cualquier punto del rango.
- Por debajo de 60 € el producto se canibaliza con ChatGPT Pro: el
  usuario sofisticado hará el cálculo y dirá "esto lo monto yo con
  GPT por 20 €/mes".
- Por encima de 150 € se compara directamente con una hora de coach
  humano acreditado, y pierde la comparación: humano con credenciales
  gana frente a IA anónima sin reputación.
- El sweet spot es "más que una consulta AI genérica, menos que un
  coach humano", justificado por la estructura forzada (DISC + 50
  turnos + informe) y el entregable tangible.

Cuando se configure el Price en Stripe, comparar con este rango. Si
el operador tiene pensado poner más de 150 €, recomiendo advertir del
riesgo de conversión baja al arranque. Si tiene pensado poner menos
de 70 €, recomiendo advertir de que se quema margen innecesario
porque el problema de ese producto no es el precio, es la confianza
inicial, y bajar el precio no la compra.

## Veredicto final

Producto con ángulo editorial fuerte y ejecución técnica sobria. La
duda no es si funciona, es si el operador sabrá encontrar y calentar
al segmento dispuesto a pagar 100-150 € por una sesión IA anónima
antes de probarla. El producto está bien construido; el reto está en
el marketing y el posicionamiento, no en el código.

