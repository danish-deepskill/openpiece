/** One key names both the body archetype and its draw fn (`draws` in draw/actorDraws keys off it).
 *  If a body ever reuses another's draw, split a DrawKey back out — until then one type, not two. */
export type BodyKey = 'hero' | 'grunt' | 'captain' | 'villager' | 'cow' | 'pig';

/**
 * A body archetype: the physical/visual identity of a unit (race/build) — size, natural striking reach,
 * walk speed, colors, and which draw fn to use. Combat magnitudes (hp/atk/def/attack-speed) do NOT live
 * here; they come from the unit's PowerTier (see defs/units.ts + combat/PowerTier.tierStats).
 */
export interface BodyDef {
  draw: BodyKey;
  r: number; // collision radius
  reach: number; // natural unarmed striking reach (weapons add length on top)
  speed: number; // walk speed (px/s) — a build/race trait, roughly equal among humans
  mass: number; // body weight for shove resolution — a heavy body shoves a light one and resists being pushed
  baseColor: number;
  /** Torso + shoulder (clothing) fill — the SECOND color channel of the humanoid anatomy, and the canvas
   *  chest armor will later recolor/cover. Distinct from `hatColor` (the dialogue-avatar ring). Omitted ⇒
   *  the draw falls back to a darkened baseColor. */
  garb?: number;
  hatColor?: number;
}

/** Human skin tone for the head/hands fill; faction identity is carried by the colored ring (hatColor). */
const SKIN = 0xe0a070;

export const Bodies: Record<BodyKey, BodyDef> = {
  // walk speeds are intentionally slow — a deliberate base pace, leaving headroom for fast late-game gear;
  // sprint (×1.5) is the quick gait, not the default
  hero: { draw: 'hero', r: 12, reach: 34, speed: 80, mass: 1.2, baseColor: SKIN, garb: 0xb5342a, hatColor: 0xf0c040 }, // red vest — the captain's icon
  grunt: { draw: 'grunt', r: 11, reach: 34, speed: 76, mass: 1, baseColor: SKIN, garb: 0x6b4a3a, hatColor: 0x2a0d0d }, // ragged bandit browns
  captain: { draw: 'captain', r: 16, reach: 46, speed: 66, mass: 3, baseColor: SKIN, garb: 0x3a2f4a, hatColor: 0x2a0d0d }, // dark boss coat
  villager: { draw: 'villager', r: 11, reach: 30, speed: 62, mass: 0.9, baseColor: SKIN, garb: 0x4a6a8a, hatColor: 0x2e5a35 }, // plain work shirt
  // passive wildlife — quadruped bodies (no garb: they use their own draw fns), no combat reach worth
  // speaking of; heavy + slow, they graze and flee
  cow: { draw: 'cow', r: 14, reach: 18, speed: 70, mass: 2.2, baseColor: 0xf2ece0 },
  pig: { draw: 'pig', r: 12, reach: 16, speed: 60, mass: 1.8, baseColor: 0xe79aa2 },
};
