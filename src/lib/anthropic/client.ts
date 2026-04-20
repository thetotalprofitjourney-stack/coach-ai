import Anthropic from '@anthropic-ai/sdk';

// Cliente singleton del SDK de Anthropic. Server-only por convención: este
// módulo solo debe importarse desde route handlers (src/app/api/**) o desde
// otros módulos de src/lib que ya lo sean. El SDK lee ANTHROPIC_API_KEY del
// entorno automáticamente; §6.4 del doc exige que sea la clave del operador
// y que nunca viaje al cliente.
//
// Si ANTHROPIC_API_KEY falta, el SDK lanza AuthenticationError en la primera
// llamada. El route handler de turno captura el error y devuelve un 500
// semántico — no validamos aquí para no duplicar el mensaje.

export const anthropic = new Anthropic();
