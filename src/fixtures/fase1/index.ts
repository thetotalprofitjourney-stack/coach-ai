import type { Fase1Fixture } from '@/lib/fase1/types';
import { fixtureCarmen } from './carmen';
import { fixtureDaniel } from './daniel';
import { fixtureTomas } from './tomas';

export const FASE1_FIXTURES: readonly Fase1Fixture[] = Object.freeze([
  fixtureDaniel,
  fixtureCarmen,
  fixtureTomas,
]);

export const FASE1_FIXTURE_SLUGS: readonly string[] = Object.freeze(
  FASE1_FIXTURES.map((f) => f.slug),
);

export function getFase1Fixture(slug: string): Fase1Fixture | null {
  return FASE1_FIXTURES.find((f) => f.slug === slug) ?? null;
}
