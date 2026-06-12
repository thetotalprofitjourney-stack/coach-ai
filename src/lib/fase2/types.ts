export type DiscScores = {
  D: number;
  I: number;
  S: number;
  C: number;
};

export type HandoffContextoPersonal = {
  alias: string;
  edad: number;
  estado_civil_y_familia: string;
  momento_profesional: string;
};

export type HandoffPerfilDisc = {
  puntuaciones: DiscScores;
  lectura_conductual: string;
};

export type HandoffHipotesis = {
  id: string;
  contenido: string;
};

export type Handoff = {
  contexto_personal: HandoffContextoPersonal;
  perfil_disc: HandoffPerfilDisc;
  patron_personal_familiar: string;
  patron_profesional: string;
  terminos_subjetivos: string[];
  observaciones_y_tensiones: HandoffHipotesis[];
  disparador_fase2: string;
};

export type HandoffFixture = {
  slug: string;
  label: string;
  handoff: Handoff;
};

export type TurnRole = 'coach' | 'user';

export type Turn = {
  role: TurnRole;
  content: string;
  // Número de la pregunta del coach a la que pertenece el turno. La pregunta
  // del coach y la respuesta inmediata del usuario comparten turnNumber.
  turnNumber: number;
};

export type RunState = {
  runId: string;
  fixtureSlug: string;
  handoff: Handoff;
  turns: Turn[];
  // Contador de preguntas del coach ya emitidas (0 antes del primer turno).
  coachTurnNumber: number;
  runningSummary: string;
  hypothesesExplored: string[];
  hypothesesPending: string[];
  subjectiveTermsResolved: string[];
  subjectiveTermsPending: string[];
  estimatedLevel: number; // 1..6
  closed: boolean;
  createdAt: Date;
  updatedAt: Date;
};
