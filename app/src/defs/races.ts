import { Registry, type Def } from '../core/Registry';

/** Every registered race id — a template-literal union so unit defs get compile-time checking on `race`. */
export type RaceId = `race.${string}`;

/**
 * A RACE — a pure STAT modifier (the species biology), applied on top of a body's baseline. It carries NO
 * visual: a Human and a Giant can share the humanoid BODY (rig/draw); the race only scales the numbers.
 * This is the clean RimWorld split (docs/references/rimworld-simple/03-pawn-anatomy):
 *
 *   body (defs/bodies)→ RIG: draw fn + BASELINE size/reach/speed/mass + skin. The visual/anatomy.
 *   race (this file)  → STAT multipliers on that baseline (Giant 1.5× size, Fishman +reach). No visual.
 *   size (defs/sizes) → individual stature multiplier within the race.
 *   tier (PowerTier)  → combat magnitudes (hp/atk/def/atkSpeed).
 *
 * Physical trait = body.baseline × race.mult × size.mult. A 4-arm fishman = body.humanoid4arm × race.fishman
 * (same race bonuses as a 2-arm fishman, different rig). Multipliers, not absolutes, so "1.5× size" reads as
 * intent and every race composes onto any body.
 */
export interface RaceDef extends Def {
  name: string;
  /** Collision-radius multiplier vs the body baseline — the SIZE dial (also drives drawn size + hat scale). */
  sizeMul: number;
  /** Unarmed striking-reach multiplier (longarms/giants reach further than their size alone). */
  reachMul: number;
  /** Walk-speed multiplier (a dwarf isn't slower for being small; a giant lumbers). */
  speedMul: number;
  /** Body-mass multiplier for shove resolution — a giant shoves through a crowd; a dwarf gets jostled. */
  massMul: number;
}

// validated at boot: a non-positive multiplier is a spawn-a-zero-size-corpse bug, not a tuning choice
export const Races = new Registry<RaceDef>('Races', (rc) => {
  for (const k of ['sizeMul', 'reachMul', 'speedMul', 'massMul'] as const) {
    if (!(rc[k] > 0)) return `${k} must be > 0 (got ${rc[k]})`;
  }
  return null;
});

// Multipliers are ×1 for baseline humans; the non-1 races reproduce the old per-unit figures as bonuses on
// the body.humanoid baseline (r11/reach34/speed76/mass1) — a migration, not a rebalance.
Races.registerAll([
  // the reference species — all ×1, so a humanoid-body human resolves to exactly the body baseline
  { id: 'race.human', name: 'Human', sizeMul: 1, reachMul: 1, speedMul: 1, massMul: 1 },
  // the hero's slightly bigger/faster frame (old hero: r12/speed80/mass1.2 on the r11/76/1 baseline)
  { id: 'race.heroic', name: 'Human', sizeMul: 12 / 11, reachMul: 1, speedMul: 80 / 76, massMul: 1.2 },
  // a frailer, ambling civilian (old villager: reach30/speed62/mass0.9)
  { id: 'race.civilian', name: 'Human', sizeMul: 1, reachMul: 30 / 34, speedMul: 62 / 76, massMul: 0.9 },
  // Giant: towering — bigger, longer reach, lumbering, shoves through anything (Elbaf giants). Old boss
  // figures (r16/reach46/speed66/mass3) as multipliers on the humanoid baseline.
  { id: 'race.giant', name: 'Giant', sizeMul: 16 / 11, reachMul: 46 / 34, speedMul: 66 / 76, massMul: 3 },
  // Fishman: powerfully built + long-limbed, a touch heavier (Fishman Karate reach, human-ish size)
  { id: 'race.fishman', name: 'Fishman', sizeMul: 1.15, reachMul: 1.2, speedMul: 1, massMul: 1.4 },
  // Dwarf: tiny + quick, easily jostled (Tontatta) — the small end of the axis
  { id: 'race.dwarf', name: 'Dwarf', sizeMul: 0.7, reachMul: 0.8, speedMul: 1.05, massMul: 0.5 },
]);
