import { TAG_PUMPED } from '../combat/Effect';
import type { Entity } from '../ecs/components';

/**
 * HAND AURAS — a body-state visual on the FISTS, derived from a TAG (never authored per ability), the way combat/fxTheme
 * re-themes attack visuals from a tag. The pump (Ni Gorilla) is the first: swollen, heated arms read top-down as a warm
 * halo pulsing under each fist. The fists themselves keep their TRUE size — a drawn fist is the hitbox for an unarmed
 * strike, so a bigger fist would lie. A rage, a frost grip, a lightning hand is one more row here. Presentation-only.
 */
export interface HandAura {
  tag: string;
  color: number;
  /** Halo radius as a multiple of the fist's. */
  scale: number;
  /** Pulse period (s) — wall-clock, cosmetic (the swim stroke's precedent). */
  period: number;
}

export const HAND_AURA_BY_TAG: readonly HandAura[] = Object.freeze([{ tag: TAG_PUMPED, color: 0xe8702a, scale: 1.7, period: 0.7 }]);

/** The aura `e`'s fists carry right now (the first present tag wins), or undefined for plain hands. */
export function handAuraOf(e: Entity): HandAura | undefined {
  const tags = e.tags;
  if (!tags) return undefined;
  for (const row of HAND_AURA_BY_TAG) if (tags.has(row.tag)) return row;
  return undefined;
}
