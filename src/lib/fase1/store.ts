import { randomUUID } from 'node:crypto';
import type { Handoff } from '@/lib/fase2/types';
import type {
  DiscFactor,
  DiscLetter,
  Fase1Answer,
  Fase1FormularioInicial,
  Fase1RunState,
  Fase1TurnRole,
} from './types';

// Store en memoria del proceso. Aislado por runId. No persiste entre
// reinicios — deliberado para el Paso 6 (validación aislada de la Fase 1
// antes de cablearla a Prisma en el Paso 7).
const runs = new Map<string, Fase1RunState>();

export interface CreateRunInput {
  formulario: Fase1FormularioInicial;
  fixtureSlug?: string | null;
}

export function createRun(input: CreateRunInput): Fase1RunState {
  const runId = randomUUID();
  const now = new Date();
  const state: Fase1RunState = {
    runId,
    createdAt: now,
    updatedAt: now,
    fixtureSlug: input.fixtureSlug ?? null,
    formulario: input.formulario,
    currentItemIndex: 0,
    answers: [],
    turns: [],
    reaskCountByItem: {},
    handoff: null,
    synthesisError: null,
    closed: false,
  };
  runs.set(runId, state);
  return state;
}

export function getRun(runId: string): Fase1RunState | null {
  return runs.get(runId) ?? null;
}

export function appendTurn(
  runId: string,
  role: Fase1TurnRole,
  content: string,
): Fase1RunState {
  const state = mustGet(runId);
  state.turns.push({ role, content, itemIndex: state.currentItemIndex });
  state.updatedAt = new Date();
  return state;
}

export function recordAnswer(
  runId: string,
  answer: {
    itemId: number;
    chosenLetter: DiscLetter | null;
    chosenFactor: DiscFactor | null;
    freeText: string;
  },
): Fase1RunState {
  const state = mustGet(runId);
  state.answers.push(answer as Fase1Answer);
  state.currentItemIndex += 1;
  state.updatedAt = new Date();
  return state;
}

// Incrementa el contador de re-preguntas del ítem actual. Devuelve el
// nuevo valor para que el caller decida si supera el tope (3) y fuerza
// avance con chosenLetter null.
export function bumpReask(runId: string): number {
  const state = mustGet(runId);
  const idx = state.currentItemIndex;
  const next = (state.reaskCountByItem[idx] ?? 0) + 1;
  state.reaskCountByItem[idx] = next;
  state.updatedAt = new Date();
  return next;
}

export function markSynthesized(runId: string, handoff: Handoff): Fase1RunState {
  const state = mustGet(runId);
  state.handoff = handoff;
  state.synthesisError = null;
  state.closed = true;
  state.updatedAt = new Date();
  return state;
}

export function markSynthesisError(
  runId: string,
  error: string,
): Fase1RunState {
  const state = mustGet(runId);
  state.synthesisError = error;
  state.updatedAt = new Date();
  return state;
}

function mustGet(runId: string): Fase1RunState {
  const state = runs.get(runId);
  if (!state) {
    throw new Error(`fase1 store: run ${runId} no encontrado`);
  }
  return state;
}
