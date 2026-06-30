export type DrawKey = 'hero' | 'grunt' | 'captain' | 'villager' | 'pirate' | 'crew';

/**
 * A body archetype: the physical/visual identity of a unit (race/build) — size, natural striking reach,
 * walk speed, colors, and which draw fn to use. Combat magnitudes (hp/atk/def/attack-speed) do NOT live
 * here; they come from the unit's PowerTier (see defs/units.ts + combat/PowerTier.tierStats).
 */
export interface BodyDef {
  draw: DrawKey;
  r: number; // collision radius
  reach: number; // natural unarmed striking reach (weapons add length on top)
  speed: number; // walk speed (px/s) — a build/race trait, roughly equal among humans
  baseColor: number;
  hatColor?: number;
}

export const Bodies = {
  // walk speeds are intentionally modest — sprint (×1.5) is the fast gait, not the default
  hero: { draw: 'hero', r: 12, reach: 34, speed: 110, baseColor: 0xc94f3d, hatColor: 0xf0c040 },
  grunt: { draw: 'grunt', r: 11, reach: 34, speed: 105, baseColor: 0xb5483a, hatColor: 0x2a0d0d },
  captain: { draw: 'captain', r: 16, reach: 46, speed: 92, baseColor: 0x7a1f1f, hatColor: 0x2a0d0d },
  villager: { draw: 'villager', r: 11, reach: 30, speed: 88, baseColor: 0x3f7f4a, hatColor: 0x2e5a35 },
  pirate: { draw: 'pirate', r: 11, reach: 30, speed: 88, baseColor: 0x2f6fae, hatColor: 0x1f3f6e },
  crew: { draw: 'crew', r: 11, reach: 34, speed: 106, baseColor: 0x2f6fae, hatColor: 0x102a4a },
} as const satisfies Record<DrawKey, BodyDef>;

export type BodyKey = keyof typeof Bodies;
