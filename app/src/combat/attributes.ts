import { MAX_STAM } from '../config/constants';
import { tierIndex, tierStats, type PowerTier } from './PowerTier';
import type { Modifier } from './Modifier';
import type { StatBlock } from './StatBlock';
import type { Entity } from '../ecs/components';

/**
 * The six allocatable ATTRIBUTES (docs/design/PROGRESSION.md "Stat Points") and how they derive the combat
 * stats systems actually read. Attributes are the progression-facing layer: tier seeds them for NPCs,
 * stat-point allocation will bump them for the player, races/gear/haki modify them — and the derived stats
 * (maxHp, maxStam, def) recompute FROM them, so "invest in Health" and "spawn at a higher tier" move the
 * same numbers through the same pipe.
 *
 * Deliberately NOT a stats-as-defs Registry (RimWorld ch 04 clamps/curves-in-data) — the atlas verdict
 * (rimworld-simple/adoption-tiers.md #21) defers that machinery until the next stat-heavy layer (Haki).
 * A typed union + linear factors is the smallest shape that is still a foundation.
 */
export type AttributeId = 'health' | 'endurance' | 'defense' | 'willpower' | 'luck' | 'spiritual';

export const ATTRIBUTE_IDS: readonly AttributeId[] = ['health', 'endurance', 'defense', 'willpower', 'luck', 'spiritual'];

/** maxHp per point of `health`. 1 keeps the pre-attribute tier numbers byte-identical; raise it to make
 *  Health allocation swingier without retuning every tier curve. */
export const HP_PER_HEALTH = 1;
/** maxStam per point of `endurance` — same identity-factor reasoning as HP_PER_HEALTH. */
export const STAM_PER_ENDURANCE = 1;
/** Flat damage reduction (`def`) per point of `defense` — same identity-factor reasoning. */
export const DEF_PER_DEFENSE = 1;
/** maxPosture (guard capacity, combat/guard) per point of `willpower`. 0.5 = a guard breaks in ~half the
 *  blocked hits; the per-unit spread is preserved (each role's cap still scales from its own willpower). */
export const POSTURE_PER_WILLPOWER = 0.5;

/** One source for every attribute-derived modifier so a re-derive can wipe-and-replace them wholesale. */
const DERIVED_SOURCE = 'derived:attributes';

/**
 * Tier → attribute seed for spawns: the tier curve (PowerTier.tierStats) restated in attribute language.
 * `health`/`defense` carry the hp/def curves; `endurance` is FLAT across tiers (stamina is fitness, not
 * rank — a brute doesn't sprint longer than a thug). `willpower` seeds the POSTURE pool (combat/guard):
 * a gentle linear climb, so higher ranks take a couple more blocked hits to break but never turtle forever.
 * luck/spiritual still seed 0: their consumers (crit/drop rolls, the haki pool) don't exist yet, and
 * curving an unread stat is fake balancing — they gain tier curves when their systems land.
 */
export function tierAttributes(t: PowerTier): Record<AttributeId, number> {
  const ts = tierStats(t);
  return { health: ts.hp, endurance: MAX_STAM, defense: ts.def, willpower: 20 + 2 * tierIndex(t), luck: 0, spiritual: 0 };
}

/**
 * (Re)compute the attribute-derived stats as source-tracked flat modifiers: maxHp ← health,
 * maxStam ← endurance, def ← defense. Reads each attribute's FINAL value (base + modifiers), so a race's
 * `health +10%` flows into maxHp — but only at derive time. syncDerivedResources() below re-runs this at
 * every modifier write path, so attribute-targeting gear/buffs stay live. Idempotent via removeBySource,
 * NOT reactive — a stat dependency graph inside StatBlock was rejected as machinery ahead of need.
 */
export function deriveAttributeStats(sb: StatBlock): void {
  sb.removeBySource(DERIVED_SOURCE);
  const derived: Modifier[] = [
    { stat: 'maxHp', op: 'flat', value: sb.get('health') * HP_PER_HEALTH, source: DERIVED_SOURCE },
    { stat: 'maxStam', op: 'flat', value: sb.get('endurance') * STAM_PER_ENDURANCE, source: DERIVED_SOURCE },
    { stat: 'def', op: 'flat', value: sb.get('defense') * DEF_PER_DEFENSE, source: DERIVED_SOURCE },
    { stat: 'maxPosture', op: 'flat', value: sb.get('willpower') * POSTURE_PER_WILLPOWER, source: DERIVED_SOURCE },
  ];
  sb.addAll(derived);
}

/**
 * Push the StatBlock's CURRENT maxHp/maxStam ceilings into the live resource pools (Health/Combatant hold
 * the pool, the StatBlock holds the ceiling). Every modifier WRITE PATH must call this — equip/unequip,
 * accessories, effect apply/expire — or the ceiling silently stays at its spawn-time snapshot and a
 * "+20% maxHp" buff does nothing (the exact bug this fixes). This is the explicit-invalidation half of the
 * "no reactive stat graph" decision above: sources notify, ceilings don't poll.
 * Policy: a RAISED ceiling does not heal (pool keeps its value); a LOWERED one clamps the pool down.
 */
export function syncDerivedResources(e: Entity): void {
  const sb = e.attributes;
  if (!sb) return;
  // re-derive FIRST: a modifier targeting an ATTRIBUTE ('health'/'endurance'/'defense') only reaches
  // maxHp/maxStam/def through this step — without it a '+20 health' item is silently inert (review find)
  deriveAttributeStats(sb);
  if (e.health) {
    e.health.maxHp = Math.round(sb.get('maxHp'));
    if (e.health.hp > e.health.maxHp) e.health.hp = e.health.maxHp;
  }
  if (e.combatant) {
    e.combatant.maxStam = Math.round(sb.get('maxStam'));
    if (e.combatant.stam > e.combatant.maxStam) e.combatant.stam = e.combatant.maxStam;
    e.combatant.maxPosture = Math.round(sb.get('maxPosture'));
    if (e.combatant.posture > e.combatant.maxPosture) e.combatant.posture = e.combatant.maxPosture;
  }
}
