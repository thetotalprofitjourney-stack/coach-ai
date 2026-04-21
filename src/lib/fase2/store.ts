import { randomUUID } from 'node:crypto';
import type { AuxiliarOutput } from '@/lib/anthropic/prompts/fase2-auxiliar';
import type { HandoffFixture, RunState } from '@/lib/fase2/types';

// Store en memoria del proceso. Aislado por runId. No persiste entre
// reinicios del servidor — es deliberadamente mínimo para el Paso 5
// (validación aislada del coach de Fase 2). El modelado definitivo
// vivirá en Prisma cuando el flujo Fase 1 → Fase 2 se integre de extremo
// a extremo (Paso 7).
const runs = new Map<string, RunState>();

export function createRun(fixture: HandoffFixture): RunState {
  const runId = randomUUID();
  const now = new Date();
  const state: RunState = {
    runId,
    fixtureSlug: fixture.slug,
    handoff: fixture.handoff,
    turns: [],
    coachTurnNumber: 0,
    runningSummary: '',
    hypothesesExplored: [],
    hypothesesPending: fixture.handoff.observaciones_y_tensiones.map((h) => h.id),
    subjectiveTermsResolved: [],
    subjectiveTermsPending: [...fixture.handoff.terminos_subjetivos],
    estimatedLevel: 1,
    closed: false,
    createdAt: now,
    updatedAt: now,
  };
  runs.set(runId, state);
  return state;
}

export function getRun(runId: string): RunState | null {
  return runs.get(runId) ?? null;
}

export function appendCoachTurn(runId: string, content: string): RunState {
  const state = mustGet(runId);
  const turnNumber = state.coachTurnNumber + 1;
  state.coachTurnNumber = turnNumber;
  state.turns.push({ role: 'coach', content, turnNumber });
  state.updatedAt = new Date();
  return state;
}

export function appendUserTurn(runId: string, content: string): RunState {
  const state = mustGet(runId);
  state.turns.push({ role: 'user', content, turnNumber: state.coachTurnNumber });
  state.updatedAt = new Date();
  return state;
}

export function applyAuxiliarOutput(
  runId: string,
  output: AuxiliarOutput,
): RunState {
  const state = mustGet(runId);

  state.runningSummary = output.nuevo_resumen;
  state.estimatedLevel = output.nivel_estimado;

  for (const id of output.hipotesis_tocadas) {
    if (state.hypothesesPending.includes(id)) {
      state.hypothesesPending = state.hypothesesPending.filter((x) => x !== id);
    }
    if (!state.hypothesesExplored.includes(id)) {
      state.hypothesesExplored.push(id);
    }
  }

  for (const term of output.nuevos_terminos_subjetivos) {
    if (
      !state.subjectiveTermsPending.includes(term) &&
      !state.subjectiveTermsResolved.includes(term)
    ) {
      state.subjectiveTermsPending.push(term);
    }
  }

  state.updatedAt = new Date();
  return state;
}

export function markClosed(runId: string): RunState {
  const state = mustGet(runId);
  state.closed = true;
  state.updatedAt = new Date();
  return state;
}

function mustGet(runId: string): RunState {
  const state = runs.get(runId);
  if (!state) {
    throw new Error(`fase2 store: run ${runId} no encontrado`);
  }
  return state;
}
