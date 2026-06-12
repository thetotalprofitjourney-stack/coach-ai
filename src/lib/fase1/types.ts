import type { Handoff } from '@/lib/fase2/types';

export type DiscFactor = 'D' | 'I' | 'S' | 'C';
export type DiscLetter = 'A' | 'B' | 'C' | 'D';
export type RetoDominio = 'personal' | 'profesional' | 'general';

// §2.3 del doc maestro: lo que el usuario rellena antes del primer ítem.
export interface Fase1FormularioInicial {
  alias: string;
  edad: number;
  estado_civil_y_familia: string;
  momento_profesional: string;
  disparador: string;
  reto_dominio: RetoDominio;
}

// Una respuesta ya interpretada. La letra es la que el usuario eligió (o
// null si el servidor agotó las re-preguntas). El factor es el DISC al que
// mapea esa letra para ese ítem concreto (A/B/C/D no son el factor).
export interface Fase1Answer {
  itemId: number;
  chosenLetter: DiscLetter | null;
  chosenFactor: DiscFactor | null;
  freeText: string;
}

export type Fase1TurnRole = 'admin' | 'user';

export interface Fase1Turn {
  role: Fase1TurnRole;
  content: string;
  itemIndex: number; // 0..N-1 mientras se administra, N en la despedida (N=8 o 16)
}

// Estado vivo de un run en memoria. Un run es una ejecución completa del
// bucle de ítems más la síntesis final.
export interface Fase1RunState {
  runId: string;
  createdAt: Date;
  updatedAt: Date;
  fixtureSlug: string | null;
  formulario: Fase1FormularioInicial;
  currentItemIndex: number; // 0..N donde N = totalItems según reto_dominio
  answers: Fase1Answer[];
  turns: Fase1Turn[];
  reaskCountByItem: Record<number, number>;
  handoff: Handoff | null;
  synthesisError: string | null;
  closed: boolean;
}

export interface Fase1Fixture {
  slug: string;
  label: string;
  formulario: Fase1FormularioInicial;
  respuestas: Array<{ letter: DiscLetter; freeText?: string }>;
}
