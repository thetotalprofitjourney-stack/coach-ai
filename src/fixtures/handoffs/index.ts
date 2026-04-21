import type { HandoffFixture } from '@/lib/fase2/types';
import { carmenFixture } from './carmen';
import { danielFixture } from './daniel';
import { tomasFixture } from './tomas';

export const HANDOFF_FIXTURES: readonly HandoffFixture[] = [
  danielFixture,
  carmenFixture,
  tomasFixture,
] as const;

const FIXTURES_BY_SLUG: Record<string, HandoffFixture> = Object.fromEntries(
  HANDOFF_FIXTURES.map((fixture) => [fixture.slug, fixture]),
);

export function getHandoffFixture(slug: string): HandoffFixture | null {
  return FIXTURES_BY_SLUG[slug] ?? null;
}

export const HANDOFF_FIXTURE_SLUGS = HANDOFF_FIXTURES.map(
  (fixture) => fixture.slug,
) as readonly string[];
