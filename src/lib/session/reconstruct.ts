import type { Phase1Response, Phase2State, Phase2Turn, Session } from '@prisma/client';

import { HandoffSchema } from '@/lib/anthropic/prompts/fase1-sintesis';
import { factorOf } from '@/lib/fase1/banco';
import type {
  DiscFactor,
  DiscLetter,
  Fase1Answer,
  Fase1FormularioInicial,
  Fase1RunState,
} from '@/lib/fase1/types';
import type { Handoff, RunState, Turn } from '@/lib/fase2/types';

// Re-valida el hand-off tras leerlo del JSONB de Postgres. Zod re-ordena
// las claves según el schema, garantizando byte-estabilidad al re-stringify
// en el prompt del coach (necesario para que el prompt caching no se
// invalide en turnos sucesivos).
export function canonicalHandoff(raw: unknown): Handoff {
  return HandoffSchema.parse(raw);
}

// Reconstruye el formulario inicial a partir de los campos de `Session`.
// Los endpoints reales garantizan que existen al entrar en Fase 1 (porque
// /form ya ha transicionado). Si alguno falta, lanzamos: el estado es
// inconsistente.
export function formularioFromSession(session: Session): Fase1FormularioInicial {
  const {
    userName,
    userAge,
    userFamilyContext,
    userLocation,
    userProfessionalMoment,
    userTrigger,
  } = session;
  if (
    !userName ||
    userAge === null ||
    !userFamilyContext ||
    !userLocation ||
    !userProfessionalMoment ||
    !userTrigger
  ) {
    throw new Error(
      `session ${session.id}: datos del formulario incompletos en estado ${session.status}`,
    );
  }
  return {
    nombre: userName,
    edad: userAge,
    estado_civil_y_familia: userFamilyContext,
    zona_geografica: userLocation,
    momento_profesional: userProfessionalMoment,
    disparador: userTrigger,
  };
}

// Convierte una fila Phase1Response (BD) a Fase1Answer (dominio). La letra
// puede ser null si se forzó avance sin respuesta válida (decisión abierta
// en el endpoint real, pero el modelo lo soporta).
function answerFromRow(row: Phase1Response): Fase1Answer {
  const letter = row.chosenOption as DiscLetter | null;
  const factor: DiscFactor | null = letter ? factorOf(row.itemNumber, letter) : null;
  return {
    itemId: row.itemNumber,
    chosenLetter: letter,
    chosenFactor: factor,
    freeText: row.freeText ?? '',
  };
}

// Reconstruye un Fase1RunState minimal suficiente para callAdministrador.
// No persistimos turnos de Fase 1 ni reaskCount: el administrador usa
// `lastUserMessage` + directiva y el historial reciente ("últimos N turnos")
// queda vacío, que es un caso ya contemplado en el prompt.
export function reconstructFase1RunState(
  session: Session,
  responses: Phase1Response[],
): Fase1RunState {
  const ordered = [...responses].sort((a, b) => a.itemNumber - b.itemNumber);
  const answers = ordered.map(answerFromRow);
  return {
    runId: session.id,
    createdAt: session.createdAt,
    updatedAt: session.createdAt,
    fixtureSlug: null,
    formulario: formularioFromSession(session),
    currentItemIndex: answers.length, // 0..16
    answers,
    turns: [],
    reaskCountByItem: {},
    handoff: null,
    synthesisError: null,
    closed: false,
  };
}

// Reconstruye un RunState de Fase 2 desde BD. Deriva hypothesesPending del
// hand-off (- hypothesesExplored) y mantiene subjectiveTerms resolved y
// pending tal cual se persistieron (el auxiliar puede añadir términos
// nuevos durante la conversación que no estaban en el hand-off, por eso
// no son derivables).
export function reconstructFase2RunState(
  session: Session,
  handoff: Handoff,
  turnRows: Phase2Turn[],
  state: Phase2State | null,
): RunState {
  const turns: Turn[] = [...turnRows]
    .sort((a, b) => {
      if (a.turnNumber !== b.turnNumber) return a.turnNumber - b.turnNumber;
      // Mismo turnNumber: el coach siempre habla antes que el user.
      if (a.role === b.role) return 0;
      return a.role === 'coach' ? -1 : 1;
    })
    .map((t) => ({
      role: t.role,
      content: t.content,
      turnNumber: t.turnNumber,
    }));

  const coachTurnNumber = turns
    .filter((t) => t.role === 'coach')
    .reduce((max, t) => Math.max(max, t.turnNumber), 0);

  const explored = state?.hypothesesExplored ?? [];
  const allHypothesisIds = handoff.observaciones_y_tensiones.map((h) => h.id);
  const hypothesesPending = allHypothesisIds.filter((id) => !explored.includes(id));

  return {
    runId: session.id,
    fixtureSlug: '',
    handoff,
    turns,
    coachTurnNumber,
    runningSummary: state?.runningSummary ?? '',
    hypothesesExplored: explored,
    hypothesesPending,
    subjectiveTermsResolved: state?.subjectiveTermsResolved ?? [],
    subjectiveTermsPending:
      state?.subjectiveTermsPending ?? [...handoff.terminos_subjetivos],
    estimatedLevel: state?.currentLevel ?? 1,
    closed: false,
    createdAt: session.createdAt,
    updatedAt: state?.updatedAt ?? session.createdAt,
  };
}
