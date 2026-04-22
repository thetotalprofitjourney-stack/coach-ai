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
públicos (un atacante puede forzar creaciones de Checkout Session), la
falta de streaming en las respuestas del coach (spinners de 20-60 s que
van a doler en Fase 2), la ausencia de retry automático ante caídas
transitorias de Anthropic, y la inexistencia de tests automatizados
(aunque esté declarado fuera de alcance MVP, es deuda conocida).

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
5. **Fricción de la espera.** 60-120 s de transición a Fase 2 y 20-60 s
   por turno en Fase 2, sin streaming, es abandono asegurado para un
   porcentaje no trivial de usuarios si no hay un framing claro de "el
   coach está pensando".
6. **Sin soporte post-sesión.** Si el usuario tiene un problema técnico
   en mitad de Fase 2 (caída de wifi, navegador cerrado por error) la
   ventana de recuperación es corta, y pasadas 24-48h pierde la sesión
   pagada. Para un producto de pago único, eso es caldo de disputa en
   Stripe.

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
satisfacción.

1. **Streaming de respuesta del coach.** Mostrar tokens según llegan de
   Opus convierte 30-60 s de spinner en "lo veo pensar, sigo aquí".
   Cambio técnico medio, impacto UX enorme. Es la mejora número uno
   sin discusión.
2. **Preview gratuito de 5 minutos.** Un mini-ejercicio sin pago con
   Haiku (2-3 preguntas con el mismo tono no-directivo) para que el
   visitante pruebe la experiencia antes de comprometer el precio.
   Baja drásticamente la barrera de confianza fría.
3. **Reenvío del informe por email opt-in.** Si el usuario marca
   "envíame copia", se envía y luego se borra del servidor según la
   política actual. Cierra el riesgo de perder el informe durante el
   timer de 10 min. El opt-in preserva el alma anónima del producto.
4. **Pausa y reanudación en 48h con enlace temporal.** Extender el TTL
   y permitir retomar con el mismo token firmado mitiga el caso wifi
   caído y reduce disputas Stripe. El anonimato se preserva: el enlace
   es el único identificador.
5. **Testimonios y caso de estudio anónimos en landing.** Dos o tres
   narrativas reales (con permiso explícito) de los pilotos,
   convertidas en prosa breve. Es el remedio clásico a la confianza
   fría y cuesta poco producirlo.
6. **Copy más explícito sobre la estructura de la sesión.** Marcar en
   la landing que hay un cuestionario conversacional de 15-20 min
   ANTES del coaching, no después. Gestionar expectativa reduce
   abandono en Fase 1.
7. **Voz opcional (roadmap, no MVP).** Input y output por voz (Whisper
   + TTS) para público que no escribe con fluidez. Cambio grande, pero
   es la siguiente frontera natural del producto.

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

