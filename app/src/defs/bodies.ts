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
  hatColor?: number;
}

/** Human skin tone for the body fill; faction identity is carried by the colored ring (hatColor). */
const SKIN = 0xe0a070;

export const Bodies: Record<BodyKey, BodyDef> = {
  // walk speeds are intentionally slow — a deliberate base pace, leaving headroom for fast late-game gear;
  // sprint (×1.5) is the quick gait, not the default
  hero: { draw: 'hero', r: 12, reach: 34, speed: 80, mass: 1.2, baseColor: SKIN, hatColor: 0xf0c040 },
  grunt: { draw: 'grunt', r: 11, reach: 34, speed: 76, mass: 1, baseColor: SKIN, hatColor: 0x2a0d0d },
  captain: { draw: 'captain', r: 16, reach: 46, speed: 66, mass: 3, baseColor: SKIN, hatColor: 0x2a0d0d },
  villager: { draw: 'villager', r: 11, reach: 30, speed: 62, mass: 0.9, baseColor: SKIN, hatColor: 0x2e5a35 },
  // passive wildlife — quadruped bodies, no combat reach worth speaking of; heavy + slow, they graze and flee
  cow: { draw: 'cow', r: 14, reach: 18, speed: 70, mass: 2.2, baseColor: 0xf2ece0 },
  pig: { draw: 'pig', r: 12, reach: 16, speed: 60, mass: 1.8, baseColor: 0xe79aa2 },
};
