import type { DiscLetter } from './types';

export interface ParsedAnswer {
  letter: DiscLetter | null;
  freeText: string;
}

// Extrae la primera letra A/B/C/D del mensaje del usuario como token
// fuerte. Tolera mayúsculas/minúsculas, punto, paréntesis y comillas
// alrededor. Si el mensaje empieza con algo que no sea una letra clara,
// devuelve letter: null para que el caller dispare la re-pregunta.
//
// Todo lo que no sea la letra identificada se devuelve como freeText
// (incluyendo matizaciones después de la letra, que el prompt del
// administrador pide registrar aunque no las use para avanzar).
export function parseUserAnswer(text: string): ParsedAnswer {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { letter: null, freeText: '' };
  }

  // Patrón: opcionalmente "opción", "la", "es", "elijo", etc. antes,
  // luego la letra A/B/C/D entre delimitadores o al inicio de palabra.
  // Priorizamos las primeras 40 caracteres — si la letra no aparece ahí,
  // probablemente el usuario está respondiendo en prosa sin elegir.
  const head = trimmed.slice(0, 60);
  const match = head.match(
    /(?:^|[\s("'¿¡«"])([ABCDabcd])(?=[\s.,;:)"'»".!?]|$)/,
  );

  if (!match) {
    return { letter: null, freeText: trimmed };
  }

  const letter = match[1].toUpperCase() as DiscLetter;

  // freeText: el mensaje completo sin la letra aislada. Mantiene la
  // matización que pueda acompañar a la elección. Si el mensaje era solo
  // la letra, freeText queda vacío.
  const letterPos = match.index ?? 0;
  const letterEndOffset =
    letterPos + match[0].length; // incluye el delimitador previo si lo hubo
  const remainder = (trimmed.slice(0, letterPos) + trimmed.slice(letterEndOffset))
    .trim()
    .replace(/^[.,;:\s]+/, '')
    .trim();

  return { letter, freeText: remainder };
}
