import { Registry, type Def } from '../core/Registry';

/** Every registered body id — a template-literal union so unit defs get compile-time checking on `body`. */
export type BodyId = `body.${string}`;

/**
 * A BODY — the anatomical RIG of a creature (RimWorld's BodyDef): the part-plan that decides the DRAW fn
 * (silhouette / limb count), the baseline PHYSIQUE, and the default skin/hide. This is the "2-arm vs 4-arm
 * fishman" axis — same species (race), different body. It owns the ABSOLUTE baseline numbers; `race` then
 * multiplies them (a Giant is race.giant × this body), and `size` multiplies again for individual stature.
 *
 * The four axes (RimWorld-proven, docs/references/rimworld-simple/03-pawn-anatomy):
 *   body (this file) → RIG: draw fn + baseline size/reach/speed/mass + default skin. The VISUAL/anatomy.
 *   race (defs/races)→ STAT multipliers on that baseline (Giant 1.5× size, Fishman +reach). No visual.
 *   size (defs/sizes)→ individual stature multiplier within the race (S/M/L/Huge).
 *   unit (defs/units)→ spawn preset: OUTFIT (garb/hat) + gear + AI + tier.
 */
export interface BodyDef extends Def {
  name: string;
  /** Draw-registry key (draw fns in actorDraws): the SILHOUETTE/rig — 'actor' (2-arm humanoid), 'cow', 'pig'.
   *  A 4-arm rig would be a new body with its own draw fn; the race (stats) is unchanged. */
  draw: string;
  /** Default skin/hide tone (head + hands for humanoids, the whole hide for quadrupeds). */
  skin: number;
  r: number; // baseline collision radius (px) — race/size multiply this
  reach: number; // baseline unarmed striking reach (px)
  speed: number; // baseline walk speed (px/s)
  mass: number; // baseline body mass for shove resolution
}

/** Human skin tone (head/hands fill); faction identity rides the outfit + ring color, not the skin. */
const SKIN = 0xe0a070;

// validated at boot: a non-positive physical baseline is a spawn-a-zero-size-corpse bug
export const Bodies = new Registry<BodyDef>('Bodies', (b) => {
  for (const k of ['r', 'reach', 'speed', 'mass'] as const) {
    if (!(b[k] > 0)) return `${k} must be > 0 (got ${b[k]})`;
  }
  return null;
});

Bodies.registerAll([
  // the standard 2-arm humanoid rig — the baseline every human/giant/fishman UNIT uses (differing by race)
  { id: 'body.humanoid', name: 'Humanoid', draw: 'actor', skin: SKIN, r: 11, reach: 34, speed: 76, mass: 1 },
  // quadruped rigs — their own draw fns + hide colors + grazer physique
  { id: 'body.cow', name: 'Cattle', draw: 'cow', skin: 0xf2ece0, r: 14, reach: 18, speed: 70, mass: 2.2 },
  { id: 'body.pig', name: 'Swine', draw: 'pig', skin: 0xe79aa2, r: 12, reach: 16, speed: 60, mass: 1.8 },
  // NOTE: a future 4-ARM humanoid is just a new body row here (draw: 'actor4arm') — SAME races apply to it.
]);
