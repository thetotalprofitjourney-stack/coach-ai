import type { RunState, Turn } from '@/lib/fase2/types';

// Vista ligera del RunState para las respuestas del endpoint de validación.
// Omite el hand-off (pesado, estático, redundante en cada respuesta) y
// trunca el historial a los últimos 8 turnos para no saturar la salida del
// operador cuando depura con curl.
const HISTORY_LIMIT = 8;

export interface RunStateView {
  runId: string;
  fixtureSlug: string;
  coachTurnNumber: number;
  estimatedLevel: number;
  hypothesesExplored: string[];
  hypothesesPending: string[];
  subjectiveTermsResolved: string[];
  subjectiveTermsPending: string[];
  runningSummary: string;
  recentTurns: Turn[];
  closed: boolean;
  createdAt: string;
  updatedAt: string;
}

export function serializeRunStateView(state: RunState): RunStateView {
  return {
    runId: state.runId,
    fixtureSlug: state.fixtureSlug,
    coachTurnNumber: state.coachTurnNumber,
    estimatedLevel: state.estimatedLevel,
    hypothesesExplored: [...state.hypothesesExplored],
    hypothesesPending: [...state.hypothesesPending],
    subjectiveTermsResolved: [...state.subjectiveTermsResolved],
    subjectiveTermsPending: [...state.subjectiveTermsPending],
    runningSummary: state.runningSummary,
    recentTurns: state.turns.slice(-HISTORY_LIMIT),
    closed: state.closed,
    createdAt: state.createdAt.toISOString(),
    updatedAt: state.updatedAt.toISOString(),
  };
}
