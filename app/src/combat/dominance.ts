import type { Entity } from '../ecs/components';
import { letters, tierIndex } from './PowerTier';
import { DOMINANCE_STAT } from './stats';

/**
 * DOMINANCE — the tier-gap ladder (docs/design/COMBAT.md "The dominance ladder"; DESIGN_BACKLOG #16: "tier gaps
 * are REAL WALLS — the world does not scale to you"). The tier already scales every MAGNITUDE (hp / atk / def /
 * attack speed — combat/PowerTier); this ladder changes the QUALITY of a hit across a gap and never its
 * arithmetic — a damage multiplier here would double-count those curves (the "+20% vs ice" cheapness #16
 * refuses). What a gap changes: whether the higher body FLINCHES, whether a guard HOLDS, whether a windup can be
 * CLIPPED, whether a parry still DEFLECTS, whether the blade BOUNCES off. One lookup per hit, at the one chokepoint
 * every melee / ball / AoE hit already passes (StrikeResolver.hit) — the AI needs no new code to be dominated or
 * to dominate; it simply experiences the rungs.
 *
 * The gap is counted in BANDS (F- … X+, 3 per letter) of the EFFECTIVE tier: the nameplate tier + the
 * `dominance` stat (base 0). A coating adds bands through the normal modifier pipe — Armament is +3 (one letter),
 * so a C with haki up clashes as a B for as long as the effect lasts; later rows (Conqueror, advanced haki,
 * sea-stone on the victim) are more modifiers, no code. Deliberately NOT a tag table: stats stack, serialize, and
 * expire with their effect.
 */
export interface GapRule {
  /** Hitstun dealt to the defender × (0 = the higher body does not flinch — poise). */
  stunMul: number;
  /** Knockback dealt to the defender × (0 = it does not move him). */
  knockbackMul: number;
  /** Posture dealt to the defender's raised guard × (<1: your blows barely rattle it; >1: his crush yours). */
  postureMul: number;
  /** May this hit clip the defender's windup (or channel)? false = his commitment is beyond your weight class. */
  interrupts: boolean;
  /** May the DEFENDER's parry window still deflect this blow? false = the window merely BLOCKS it (the held key
   *  is a block already) — a parry can't turn steel from that far above. */
  parryDeflects: boolean;
  /** The ATTACKER staggers off the defender: 'block' = when the defender blocks (the counter opening), 'hit' =
   *  on ANY landed hit (striking stone). The swing is lost either way, as a parried one is. A CONTACT rule —
   *  melee delivery only (StrikeResolver): a shooter whose ball is blocked at range has nothing to bounce off. */
  rebound: 'never' | 'block' | 'hit';
}

/** The same-letter rule: nothing about the hit changes. Also the rule for anything without a tier (a ship). */
export const NEUTRAL_GAP: GapRule = Object.freeze({ stunMul: 1, knockbackMul: 1, postureMul: 1, interrupts: true, parryDeflects: true, rebound: 'never' });

/** One rung: the rules from `gap` bands onward, for a hit thrown UP the ladder (the attacker is the lower tier)
 *  and one thrown DOWN it (the attacker is the higher). Rows ascend by `gap`; the last row ≤ the gap applies. */
export interface DominanceRung {
  gap: number;
  up: GapRule;
  down: GapRule;
}

/**
 * THE LADDER — content, not code: tune a cell, add a rung. Today's rungs sit one LETTER apart (3 bands) — the
 * coarse default the developer asked for; finer rows (per band, per-pair exceptions) land as rows later.
 *  - one letter:    the higher flinches half as much; your hits half-rattle his guard; his stagger you longer
 *  - two letters:   POISE (no flinch, no shove); you can't clip his windup; your parry only BLOCKS his blows;
 *                   his blocks BOUNCE you (the counter opening); his hits crush your guard twice as fast
 *  - three letters: everything above, and any landed hit REBOUNDS — you stagger on contact, like striking
 *                   stone; his heavy breaks your guard outright (posture ×4)
 * The genius-survival floor still holds (#16): nothing here reduces DAMAGE — a trapped, cornered, outnumbered
 * higher tier still bleeds. Skill buys survival; the ladder is why it rarely buys victory.
 */
export const DOMINANCE_LADDER: readonly DominanceRung[] = Object.freeze([
  { gap: 0, up: NEUTRAL_GAP, down: NEUTRAL_GAP },
  {
    gap: letters(1),
    up: { stunMul: 0.5, knockbackMul: 0.5, postureMul: 0.5, interrupts: true, parryDeflects: true, rebound: 'never' },
    down: { stunMul: 1.25, knockbackMul: 1, postureMul: 1, interrupts: true, parryDeflects: true, rebound: 'never' },
  },
  {
    gap: letters(2),
    up: { stunMul: 0, knockbackMul: 0, postureMul: 0.25, interrupts: false, parryDeflects: true, rebound: 'block' },
    down: { stunMul: 1.5, knockbackMul: 1.25, postureMul: 2, interrupts: true, parryDeflects: false, rebound: 'never' },
  },
  {
    gap: letters(3),
    up: { stunMul: 0, knockbackMul: 0, postureMul: 0, interrupts: false, parryDeflects: true, rebound: 'hit' },
    down: { stunMul: 2, knockbackMul: 1.5, postureMul: 4, interrupts: true, parryDeflects: false, rebound: 'never' },
  },
]);

/** Stagger (s) on an attacker whose blade bounced off a dominant body or guard — the rebound's punish opening
 *  (a touch under the parry's PARRY_STUN: a wall is passive, a parry is a read). */
export const REBOUND_STUN = 0.4;

/** Bands a full Armament coating adds to the wearer's effective tier (effect.armament) — one letter. */
export const ARMAMENT_DOMINANCE = letters(1);

// the ladder is data, so it's VALIDATED at load like a registry row: a rung out of order would silently apply the
// wrong rule (the lookup walks the rows in order), a negative multiplier would heal
(function validateLadder(): void {
  let prev = -1;
  for (const r of DOMINANCE_LADDER) {
    if (!(r.gap > prev)) throw new Error(`dominance: rungs must ascend by gap (got ${r.gap} after ${prev})`);
    for (const side of [r.up, r.down]) {
      for (const k of ['stunMul', 'knockbackMul', 'postureMul'] as const) if (!(side[k] >= 0)) throw new Error(`dominance: rung ${r.gap} ${k} must be ≥ 0`);
    }
    prev = r.gap;
  }
  if (DOMINANCE_LADDER[0]?.gap !== 0) throw new Error('dominance: the first rung must start at gap 0'); // every gap finds a row
})();

/** The gap-0 rung — exists and sits first by the validation above (the lookup's starting row). */
const BASE_RUNG: DominanceRung = DOMINANCE_LADDER[0]!;

/** The band index the ladder judges `e` by: nameplate tier + the `dominance` stat. Undefined for anything that has
 *  no tier (a ship, a structure) — such a hit is judged NEUTRAL, never as "tier F-". */
export function effectiveTier(e: Entity): number | undefined {
  const tier = e.identity?.tier;
  if (tier === undefined) return undefined;
  const i = tierIndex(tier);
  if (i < 0) throw new Error(`dominance: '${tier}' is not a power tier`); // a unit's tier is boot-validated (defs/units) — only a corrupt snapshot reaches here; never judge it neutral
  return i + (e.attributes?.get(DOMINANCE_STAT) ?? 0);
}

/** Effective-tier gap of a hit, attacker − defender, in bands (positive = hitting DOWN). Undefined when either side
 *  has no tier (a ship, a structure) — such a hit is judged neutral. */
export function tierGap(attacker: Entity, defender: Entity): number | undefined {
  const a = effectiveTier(attacker);
  const d = effectiveTier(defender);
  return a === undefined || d === undefined ? undefined : a - d;
}

/** The rule at a given gap — the one array walk (rows ascend; the last row ≤ |gap| applies; the sign picks the side). */
export function ruleFor(gap: number): GapRule {
  const size = Math.abs(gap);
  let rung = BASE_RUNG;
  for (const r of DOMINANCE_LADDER) {
    if (r.gap > size) break;
    rung = r;
  }
  return gap < 0 ? rung.up : rung.down;
}

/** The rule for a hit from `attacker` on `defender` — pure, deterministic. `attackerShift` (bands) lets ONE question
 *  be asked as if the attacker stood higher — a technique's `parryShift` asks the parry question that way and nothing
 *  else (combat/Ability.AbilityDef.parryShift), so "unparryable" is tier-relative: beats equals, not masters. */
export function dominance(attacker: Entity, defender: Entity, attackerShift = 0): GapRule {
  const gap = tierGap(attacker, defender);
  return gap === undefined ? NEUTRAL_GAP : ruleFor(gap + attackerShift);
}
