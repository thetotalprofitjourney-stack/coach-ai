import type { Fase1RunState } from './types';

// Vista serializable del estado del run. Omite timestamps crudos y
// redundancias; expone lo suficiente para que el operador vea en qué
// ítem va, qué letras ha ido registrando y si la síntesis ya disparó.
export interface Fase1RunStateView {
  runId: string;
  fixtureSlug: string | null;
  currentItemIndex: number;
  totalItems: 16;
  answersCount: number;
  turnsCount: number;
  reaskCountByItem: Record<number, number>;
  handoffReady: boolean;
  synthesisError: string | null;
  closed: boolean;
  createdAt: string;
  updatedAt: string;
}

export function serializeFase1StateView(
  state: Fase1RunState,
): Fase1RunStateView {
  return {
    runId: state.runId,
    fixtureSlug: state.fixtureSlug,
    currentItemIndex: state.currentItemIndex,
    totalItems: 16,
    answersCount: state.answers.length,
    turnsCount: state.turns.length,
    reaskCountByItem: { ...state.reaskCountByItem },
    handoffReady: state.handoff !== null,
    synthesisError: state.synthesisError,
    closed: state.closed,
    createdAt: state.createdAt.toISOString(),
    updatedAt: state.updatedAt.toISOString(),
  };
}
