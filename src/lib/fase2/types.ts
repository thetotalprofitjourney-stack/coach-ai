export type DiscScores = {
  D: number;
  I: number;
  S: number;
  C: number;
};

export type HandoffContextoPersonal = {
  nombre: string;
  edad: number;
  estado_civil_y_familia: string;
  zona_geografica: string;
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
