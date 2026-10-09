import { letters } from './PowerTier';
import { swingWeight, type CombatWeight } from './phases';
import { tierGap } from './dominance';
import { Abilities } from './Ability';
import { TAG_ARMAMENT } from './Effect';
import type { Rng } from '../core/Rng';
import type { Entity } from '../ecs/components';

/**
 * THE CLASH — steel meets steel: two live blade cuts whose drawn segments overlap in the same tick (MeleeSystem finds the
 * geometry; this decides it). The walls never roll; equals roll once, seeded: every outcome is readable from what was on screen.
 *   1. the LADDER — a letter or more apart (coating included): the dominant blade powers through ('overpower');
 *   2. COMMITMENT — same letter: the heavier weight class wins, then the blow further into its cut (the momentum);
 *   3. a true tie — the BIND: both cancel, both shoved, both pay posture (the clang two coated masters produce).
 * TWO detections, both geometric (MeleeSystem.clashes): the blades TOUCH (segment overlap), or BOTH live blades are landing on
 * each other's bodies in the same tick — the mutual blow. Blades sit on each fighter's lead side, so two straight cuts
 * run ~18px apart and rarely touch; but two cuts arriving together are the duel's commonest moment, and steel meeting
 * steel in the middle is what that IS. No dice in the DETECTION: blades either visibly cross or they don't; a roll on crossed
 * blades reads as a bug four times in five, and the rarity is already there — it takes both swinging in the same beat. The
 * dice live in ONE place, the equals verdict (rule 3), seeded.
 */
export type ClashVerdict = { kind: 'bind' } | { kind: 'overpower'; winner: Entity; loser: Entity };

/** STEEL RINGS ONLY BETWEEN HAKI: a clash needs BOTH blades COATED (this tag on both bodies) — the lock is something two haki
 *  users do to each other, not a fodder trade. A coated blade meeting a plain one is an ordinary exchange (the coating just
 *  hits harder and the ladder shoves); two plain blades trade as they always did. One constant: a future "any haki" rule is
 *  one edit here. */
export const CLASH_REQUIRES_TAG = TAG_ARMAMENT;
export function canClash(a: Entity, b: Entity): boolean {
  return a.tags?.has(CLASH_REQUIRES_TAG) === true && b.tags?.has(CLASH_REQUIRES_TAG) === true;
}

/** EQUALS (same letter, same weight) are settled by a seeded ROLL, not a knife-edge: first the BIND chance (the lock two
 *  equals produce), else a win roll TILTED by commitment — the blow that went live earlier is favoured by CLASH_COMMIT_SLOPE
 *  per second of lead, capped at CLASH_WIN_CAP so the later blade always keeps a chance. One roll per clash on the combat
 *  stream (replays and the headless server agree). "A tick earlier wins" was invisible and made binds between equals rare. */
export const CLASH_BIND_CHANCE = 0.35; // about one equal clash in three locks as a bind
export const CLASH_COMMIT_SLOPE = 3; // per second of lead: 50ms earlier ≈ 65/35, 150ms ≈ 85/15 (capped by CLASH_WIN_CAP)
export const CLASH_WIN_CAP = 0.9;
/** How hard a BIND throws each body back (px/s) and what it costs in posture — a tie is a stumble for both. */
export const CLASH_SHOVE = 180;
export const CLASH_POSTURE = 8;
/** An OVERPOWERED blade's owner is FLUNG: a ragdoll along the line away from the contact (combat/ragdoll — flight, sprawled,
 *  the get-up). Losing a bind must LOOK like losing; the old half-step stagger read as "nobody lost". */
export const CLASH_FLING = { force: 950, airTime: 0.45, downed: 1.0 } as const; // ~430px of flight — across the arena floor; a wall ends it with the slam (combat/ragdoll.WALL_THUD_DOWN_BONUS)
/** The ragdoll row the loser wears — labelled OVERPOWERED, so who lost is never in doubt. */
export const EFFECT_OVERPOWERED = 'effect.overpowered';
/** Extra reach (px) added to the two blade widths for the overlap test — steel that nearly touches rings too. */
export const CLASH_PAD = 6;
/** THE BLADE LOCK: how long (s) the two hold with blades crossed before the verdict lands. A bind holds long enough to read
 *  as a lock; an overpower holds a few frames — the HITSTOP that makes the stronger blade feel heavy — before the loser is
 *  thrown. The lock effect runs LOCK_GRACE longer than the hold so the melee tick, not the effect clock, ends it (no race). */
export const CLASH_BIND_HOLD = 2; // the lock two equals produce — long enough to read the crossed blades and the struggle
export const CLASH_OVERPOWER_HOLD = 2; // the hold before the loser is thrown (the developer's call: a real beat, not a 0.08s hitstop)
export const LOCK_GRACE = 0.05;
/** Seconds between the small sparks that keep popping from the crossing while a lock holds (presentation cue, sim-timed). */
export const CLASH_SPARK_EVERY = 0.08;
/** The effect row a locked body wears (its label and its freeze). */
export const EFFECT_BLADE_LOCK = 'effect.bladeLock';

const WEIGHT_RANK: Record<CombatWeight, number> = { light: 0, medium: 1, heavy: 2, ranged: 1 };

/** How long (s) a swing has been CUTTING — its clock past the start of its active phase. The commitment tiebreak. */
export function cutTime(e: Entity): number {
  const m = e.melee!; // callers pass swinging bodies
  return m.t - m.phases.windup * m.dur;
}

/** The verdict. Rules 1 (ladder) and 2 (weight) are WALLS — a coated or heavier blade never loses a bind to a coin. Rule 3,
 *  equals, is the seeded roll above. `rng` is the combat stream (MeleeSystem holds it). */
export function judgeClash(a: Entity, b: Entity, rng: Rng): ClashVerdict {
  const gap = tierGap(a, b) ?? 0;
  if (gap >= letters(1)) return { kind: 'overpower', winner: a, loser: b };
  if (gap <= -letters(1)) return { kind: 'overpower', winner: b, loser: a };
  const wa = WEIGHT_RANK[swingWeight(a, Abilities.get(a.melee!.ability))]; // `!`: callers pass two SWINGING bodies (the clash pass found their live blades)
  const wb = WEIGHT_RANK[swingWeight(b, Abilities.get(b.melee!.ability))];
  if (wa !== wb) return wa > wb ? { kind: 'overpower', winner: a, loser: b } : { kind: 'overpower', winner: b, loser: a };
  if (CLASH_BIND_CHANCE > 0 && rng.chance(CLASH_BIND_CHANCE)) return { kind: 'bind' };
  const lead = cutTime(a) - cutTime(b); // seconds a has been cutting longer than b (negative: b led)
  const pA = Math.min(CLASH_WIN_CAP, Math.max(1 - CLASH_WIN_CAP, 0.5 + lead * CLASH_COMMIT_SLOPE));
  return rng.chance(pA) ? { kind: 'overpower', winner: a, loser: b } : { kind: 'overpower', winner: b, loser: a };
}
