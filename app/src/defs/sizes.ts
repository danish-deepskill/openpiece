import { Registry, type Def } from '../core/Registry';

/**
 * A SIZE band — INDIVIDUAL stature WITHIN a race, the fourth orthogonal axis of a unit's build:
 *
 *   race (defs/races) → species multipliers (Human 1×, Giant 1.5×, Fishman 1.15×…)
 *   size (this file)  → individual variation: a small vs an admiral-tall HUMAN are both `race.human`.
 *
 * They MULTIPLY: a large fishman = race.fishman × size.large. Named bands (not a raw number) so a def reads
 * as intent — `size: 'l'` like `tier: 'D-'` — and the set is FINITE, which keeps the widest-radius bound
 * (ai/brains.MAX_NEIGHBOR_R) and boot validation clean. Applies to size/reach/MASS; walk SPEED is a race
 * trait, not a stature one (a tall human isn't slower), so size leaves it alone (see Spawner).
 */
export type SizeId = `size.${string}`;

export interface SizeDef extends Def {
  name: string;
  mult: number; // stature multiplier vs the race baseline (medium = 1.0, the identity)
}

// validated at boot: a non-positive stature is a zero-size-corpse bug
export const Sizes = new Registry<SizeDef>('Sizes', (s) => (s.mult > 0 ? null : `mult must be > 0 (got ${s.mult})`));

Sizes.registerAll([
  { id: 'size.small', name: 'Small', mult: 0.8 }, // runts, youths
  { id: 'size.medium', name: 'Medium', mult: 1.0 }, // the reference stature — a unit with no `size` resolves here
  { id: 'size.large', name: 'Large', mult: 1.25 }, // broad, imposing
  { id: 'size.huge', name: 'Huge', mult: 1.6 }, // admiral-tall — the top of the human range
]);

/** The identity band a unit falls back to when its def names no `size`. */
export const DEFAULT_SIZE: SizeId = 'size.medium';
