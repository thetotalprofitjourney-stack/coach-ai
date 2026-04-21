import type { Handoff, RunState } from '@/lib/fase2/types';

// Tope absoluto de preguntas del coach por §4.4 / §5.3 del doc de proyecto.
export const MAX_COACH_TURNS = 50;

// Bloque dinámico del system prompt del coach. Cambia cada turno, por lo que
// NO se marca con cache_control. Incluye el turno que el coach va a emitir,
// los turnos restantes, el nivel de profundización estimado por la auxiliar,
// las hipótesis exploradas y pendientes, los términos subjetivos, el resumen
// estructurado y los comandos progresivos de cierre (§5.3).
export function renderDynamicState(state: RunState): string {
  const nextTurn = state.coachTurnNumber + 1;
  const remaining = Math.max(0, MAX_COACH_TURNS - nextTurn);
  const injection = progressiveInjection(nextTurn);

  const lines: string[] = [
    'ESTADO DINÁMICO DE LA SESIÓN',
    '',
    `Turno actual: ${nextTurn}`,
    `Turnos restantes hasta el cierre: ${remaining}`,
    `Nivel de profundización estimado: ${state.estimatedLevel}`,
    '',
    `Hipótesis del hand-off exploradas: ${formatList(state.hypothesesExplored)}`,
    `Hipótesis pendientes: ${formatList(state.hypothesesPending)}`,
    '',
    `Términos subjetivos desambiguados: ${formatList(state.subjectiveTermsResolved)}`,
    `Términos subjetivos pendientes: ${formatList(state.subjectiveTermsPending)}`,
    '',
    'Resumen estructurado de lo dicho por el usuario:',
    state.runningSummary.length > 0
      ? state.runningSummary
      : '(todavía vacío — el usuario aún no ha respondido)',
  ];

  if (injection) {
    lines.push('', injection);
  }

  return lines.join('\n');
}

// Bloque cacheable con el hand-off completo del usuario. Estable durante toda
// la run: se sitúa como segundo bloque del array `system` con cache_control.
export function renderHandoffBlock(handoff: Handoff): string {
  return [
    'HAND-OFF DEL USUARIO (contexto producido por Fase 1):',
    '',
    JSON.stringify(handoff, null, 2),
  ].join('\n');
}

function formatList(items: string[]): string {
  return items.length === 0 ? '(ninguna)' : items.join(', ');
}

function progressiveInjection(nextTurn: number): string | null {
  if (nextTurn === 40) return '[[QUEDAN 10 PREGUNTAS]]';
  if (nextTurn === 45) return '[[QUEDAN 5 PREGUNTAS]]';
  if (nextTurn >= MAX_COACH_TURNS) return '[[CIERRA YA]]';
  return null;
}
