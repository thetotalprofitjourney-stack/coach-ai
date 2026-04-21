// Barrel de los 6 fixtures piloto de Fase 1 (§9 del doc maestro). Cada
// fixture es el reverse-engineering de un hand-off piloto: formulario
// inicial coherente con el contexto del piloto + 16 respuestas al banco
// DISC cuyo perfil neto, al pasar por la Fase 1 real, produce un
// hand-off netamente comparable al de referencia.
//
// Slugs cubiertos: daniel (D-C), carmen (S-D), elena (I-S), javier (D-C),
// lucia (C-D), tomas (I-D). El Paso 12 amplía a los 6; en los Pasos 6-7
// sólo existían daniel/carmen/tomas.
import type { Fase1Fixture } from '@/lib/fase1/types';
import { fixtureCarmen } from './carmen';
import { fixtureDaniel } from './daniel';
import { fixtureElena } from './elena';
import { fixtureJavier } from './javier';
import { fixtureLucia } from './lucia';
import { fixtureTomas } from './tomas';

export const FASE1_FIXTURES: readonly Fase1Fixture[] = Object.freeze([
  fixtureDaniel,
  fixtureCarmen,
  fixtureElena,
  fixtureJavier,
  fixtureLucia,
  fixtureTomas,
]);

export const FASE1_FIXTURE_SLUGS: readonly string[] = Object.freeze(
  FASE1_FIXTURES.map((f) => f.slug),
);

export function getFase1Fixture(slug: string): Fase1Fixture | null {
  return FASE1_FIXTURES.find((f) => f.slug === slug) ?? null;
}
