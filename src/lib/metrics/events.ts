// Emisión de eventos de negocio como líneas JSON en stdout (§7.3).
//
// Mismo patrón que `event=stripe_webhook` (Paso 10) y
// `event=cron_cleanup` (Paso 9): una línea por transición relevante,
// con `event` + `timestamp` + metadatos no identificativos. El MVP no
// escribe a ningún sink externo — la agregación temporal la hace el
// recolector nocturno (`collectDailyStats`) sobre la BD, no sobre el
// stream de logs.
//
// Lo que NO va en estos eventos (§6.4, §7.3):
//   - Identificadores de sesión (ni el token, ni hash del token).
//   - Contenido conversacional (mensajes del coach/usuario, respuestas
//     del formulario, trigger, nombre, edad, familia, trigger…).
//   - Metadatos de Stripe del usuario (email, nombre fiscal, país).
//
// Sí van (metadatos de proceso, no identifican a nadie):
//   - `durationMs` desde una transición anterior conocida.
//   - `turnsCount` (contador agregado).
//   - `format` de descarga (pdf | docx).

export type BusinessEventName =
  | 'session_created'
  | 'form_submitted'
  | 'phase1_completed'
  | 'phase2_completed'
  | 'report_downloaded'
  | 'report_emailed';

interface BusinessEventPayload {
  [key: string]: string | number | boolean | null | undefined;
}

export function logBusinessEvent(
  name: BusinessEventName,
  payload: BusinessEventPayload = {},
): void {
  console.log(
    JSON.stringify({
      event: name,
      timestamp: new Date().toISOString(),
      ...payload,
    }),
  );
}
