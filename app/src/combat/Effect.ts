import { Registry, type ContentId, type Def } from '../core/Registry';
import { modifierProblem, type Modifier } from './Modifier';
import { syncDerivedResources } from './attributes';
import type { ActiveEffect, Entity } from '../ecs/components';
import { ARMAMENT_DOMINANCE } from './dominance';
import { COMBO_RECOVERY_STAT, DAMAGE_TAKEN_STAT, DEFLECT_STAT, DOMINANCE_STAT, KNOCKBACK_STAT, MOVE_SPEED_STAT, SHOT_RANGE_STAT, SHOT_SCALE_STAT, STAM_COST_STAT, STAM_REGEN_DELAY_STAT, STAM_REGEN_STAT, VIGOR_RECOVER_STAT, VIGOR_WEAR_STAT, WILL_REGEN_STAT } from './stats';

/**
 * A timed (or instant) gameplay effect: a bundle of Modifiers and/or Tags applied to a target for a
 * duration, then removed. The generic vehicle for buffs, debuffs, DoTs, and states (i-frames, fear, …).
 * Effects are data — the EffectSystem applies/expires them; no per-effect code branches.
 *
 * CROWD CONTROL is effects too (the backlog #16 contract: "reactions EMIT existing Effects — GAS-lite rows,
 * never a second combat engine"): a stagger/freeze is an effect granting `state.slowed`/`state.stunned`, and
 * every consumer (movement roots/slows, ability + guard gates, the overhead label) reads the TAG — no bespoke
 * per-state timer fields on Combatant. A future burn/chill/fear is one row here, zero new plumbing.
 */
export interface EffectDef extends Def {
  name: string;
  /** Seconds the effect lasts — the DEFAULT; an apply() may override per application (hitstun scales per hit). */
  durationSec: number;
  /**
   * Reapply semantics while an instance is already active (merge-rules-as-data, RimWorld TryMergeWith):
   *  - 'refresh' (default) — reset the existing instance's clock; no second copy of the modifiers/tags.
   *  - 'stack' — instances co-exist independently (each carries a UNIQUE source, so expiries can't collide).
   * A 'sum' rule (severity ramps) arrives with the severity/stages upgrade (adoption-tiers S#3).
   */
  stackRule?: 'refresh' | 'stack';
  /** STAMINA DRAIN per second while active (the Geppo-hover model): the bearer pays every tick (regen pauses, one rule —
   *  combat/stamina.spendStamina) and the effect ENDS EARLY the moment the pool is empty. `durationSec` becomes a CAP;
   *  the budget is the pool. For a sustained state you switch on and hold (a haki coating), not a timed buff. */
  drainStamPerSec?: number;
  /** WILL drain per second while active — a held HAKI state (the coating): the same rule on the haki pool. */
  drainWillPerSec?: number;
  /** Active for the duration; sourced to this effect instance so removal is clean. */
  modifiers?: Modifier[];
  /** Gameplay tags granted for the duration (e.g. 'state.invuln'). */
  grantTags?: string[];
  /** Overhead STATUS readout while active — the label + theme color the StunIndicator floats over the unit.
   *  Presentation-only data (the sim never reads it); unset ⇒ the effect is invisible (i-frames, auras). This
   *  is also the ONE home for an effect's theme color (the electric cyan) — FX/draw read it from here. */
  status?: { label: string; color: number };
}

// validated at boot: a negative duration or NaN modifier is a content bug, not a mid-game mystery
export const Effects = new Registry<EffectDef>('Effects', (d) => {
  if (!(d.durationSec >= 0)) return `durationSec must be ≥ 0 (got ${d.durationSec})`;
  if (d.drainStamPerSec !== undefined && !(d.drainStamPerSec > 0)) return `drainStamPerSec must be > 0 (got ${d.drainStamPerSec}; omit it for a timed effect)`;
  if (d.drainWillPerSec !== undefined && !(d.drainWillPerSec > 0)) return `drainWillPerSec must be > 0 (got ${d.drainWillPerSec})`;
  return modifierProblem(d.modifiers);
});

/**
 * Apply an effect to an entity — the ONE application path. A standalone function (not an EffectSystem method)
 * because effects are applied from services and sim helpers too (StrikeResolver's hitstun, guard breaks, the
 * wall-slam) — injecting the system everywhere just to reach this logic was the wrong coupling; the system
 * owns TICKING/expiry, not application. `dur` overrides the def's durationSec (per-hit stagger lengths).
 */
export function applyEffect(e: Entity, effectId: ContentId, by: string, dur?: number): void {
  if (!e.effects) return; // an effect-less body (a projectile, a prop) can't carry states
  const d = Effects.get(effectId);
  const remaining = dur ?? d.durationSec;
  // merge rule ('refresh' default): reapplying resets the existing instance's clock — its modifiers/tags
  // are already in place, so pushing a second copy would double them. Keep the LONGER clock (a fresh short
  // stagger must not cut an active long pin short).
  if ((d.stackRule ?? 'refresh') === 'refresh') {
    const existing = e.effects.active.find((a) => a.id === effectId);
    if (existing) {
      existing.remaining = Math.max(existing.remaining, remaining);
      return;
    }
  }
  // '#seq' makes every instance's source UNIQUE — two stacked instances sharing a source meant the first
  // expiry's removeBySource stripped the survivor's modifiers too (`by` stays purely for explain()/debug)
  const source = `effect:${effectId}:${by}#${e.effects.seq++}`;
  e.effects.active.push({ id: effectId, remaining, source });
  if (d.modifiers && e.attributes) e.attributes.addAll(d.modifiers.map((m) => ({ ...m, source })));
  if (d.grantTags && e.tags) for (const t of d.grantTags) e.tags.add(t);
  syncDerivedResources(e); // an effect may move maxHp/maxStam — the pools must see the new ceiling now
}

/** Release one ended instance: its modifiers by source, its tags unless another live instance still grants them, the
 *  derived pools re-clamped. applyEffect's mirror — EffectSystem's expiry and endEffect both come through here. */
export function releaseEffect(e: Entity, a: ActiveEffect, remaining: ActiveEffect[]): void {
  const d = Effects.get(a.id);
  if (d.modifiers && e.attributes) e.attributes.removeBySource(a.source);
  if (d.grantTags && e.tags) {
    for (const t of d.grantTags) {
      const stillGranted = remaining.some((o) => Effects.get(o.id).grantTags?.includes(t));
      if (!stillGranted) e.tags.remove(t);
    }
  }
  syncDerivedResources(e); // a maxHp/maxStam buff just ended — clamp the pools to the restored ceiling
}

/** End an effect NOW (a held state switched off, a lock that broke) — the first active instance of `effectId`. Pure, so
 *  sim code without the EffectSystem in hand (MeleeSystem's blade lock) can end what it started. False if none was active. */
export function endEffect(e: Entity, effectId: ContentId): boolean {
  const arr = e.effects?.active;
  if (!arr) return false;
  const i = arr.findIndex((a) => a.id === effectId);
  if (i < 0) return false;
  const [a] = arr.splice(i, 1);
  releaseEffect(e, a!, arr); // splice at a found index yields the element
  return true;
}

/** The CC tags every gate reads (movement roots/slows, ability + guard refusals, the overhead label). ONE home
 *  for the strings — systems compare these, never literals. */
export const TAG_STUNNED = 'state.stunned';
export const TAG_SLOWED = 'state.slowed';
/** ARMAMENT is UP — granted by effect.armament for the coating's duration. Read by StrikeResolver (bypasses Logia
 *  intangibility), by abilities gated on it (requireTags — a haki TECHNIQUE), by the blade/body coating draws. */
export const TAG_ARMAMENT = 'haki.armament.active';
/** PHASING — the body passes THROUGH other bodies (BodyCollisionSystem skips it both ways, like an airborne one);
 *  walls still stop it. Granted by a pass-through technique for its swing (effect.phasing). */
export const TAG_PHASING = 'state.phasing';
/** RAGDOLLED — flung or lying downed (combat/ragdoll): can't act (STUNNED rides along), takes no further knockback or
 *  launch until up (Damage.apply, StrikeResolver), and while downed is PUSHABLE (BodyCollisionSystem). */
export const TAG_RAGDOLL = 'state.ragdoll';
/** The PACE a body holds (one at a time — the stance cycle, ability.pace): push = breath back fast at the day's expense;
 *  conserve = slow breath, the day's reserve guarded (and mended even mid-fight — CombatantSystem reads this tag). */
export const TAG_PACE_PUSH = 'pace.push';
export const TAG_PACE_CONSERVE = 'pace.conserve';
/** The Ni Gorilla pump (effect.niGorilla) — the tag Nigori Zake requires: the great double cut needs the arms up. */
export const TAG_PUMPED = 'buff.niGorilla';

Effects.registerAll([
  { id: 'effect.invuln', name: 'Invulnerable', durationSec: 0.3, grantTags: ['state.invuln'] },
  // PHASING — a pass-through step's window (Sandan: three flash-steps THROUGH the target): bodies don't stop or push
  // him, walls still do. Not i-frames: he can be hit mid-pass. The duration covers the whole three-step swing.
  { id: 'effect.phasing', name: 'Phasing', durationSec: 1.0, grantTags: [TAG_PHASING] }, // outlasts the longest pass-through (Rashōmon's 0.3s tell + 0.44s dash at a slow body's speed; Sandan's three steps + plants ≈ 0.82s)
  // RAGDOLL — the knockdown CC class (combat/ragdoll): applied for flight + downed (the duration is passed per launch),
  // STUNNED for the whole of it (no acting, no walking — the fling carries the body on the impulse channel) + the
  // ragdoll tag (no re-launch, pushable while down). The label reads "Down" on the plate.
  { id: 'effect.ragdoll', name: 'Ragdolled', durationSec: 1, grantTags: [TAG_STUNNED, TAG_RAGDOLL], status: { label: 'Down', color: 0xd8c08a } },
  // OVERPOWERED — the ragdoll a lost CLASH wears (combat/clash, MeleeSystem.fling): the same flight and downed beat, its own
  // label — so the one who lost the bind reads as the one who lost, through the flight and on the ground.
  { id: 'effect.overpowered', name: 'Overpowered', durationSec: 1, grantTags: [TAG_STUNNED, TAG_RAGDOLL], status: { label: 'Overpowered', color: 0xd84a4a } },
  // ARMAMENT — the coating (ability.armament, granted by the haki.armament layer row into the C slot). Four things,
  // each on a GENERIC seam: harder (atk + def), one LETTER up the dominance ladder (the stat), every ball cut back at
  // its shooter (the Samurai's deflect seam at 1 — "Armament cuts anything"), and the tag that unlocks a haki
  // TECHNIQUE (requireTags) + lets a strike touch a Logia. The blade turns BLACK while it lasts (coating.ts).
  // HELD, not timed: a TOGGLE that DRAINS WILL (the haki pool — breath stays for the cuts): the coating lasts as long as
  // the bearer's will does, drops the instant the pool is empty, and the 30s is only a cap.
  {
    id: 'effect.armament',
    name: 'Armament Haki',
    durationSec: 30,
    drainWillPerSec: 6,
    grantTags: [TAG_ARMAMENT],
    modifiers: [
      { stat: 'atk', op: 'mulPct', value: 0.5, source: 'haki.armament' }, // the coated blade hits half again as hard
      { stat: DAMAGE_TAKEN_STAT, op: 'mulPct', value: -0.5, source: 'haki.armament' }, // HARDENING — the "defense" half: half of every strike reaches the body (was +30% on the flat def stat: ~2 points a hit, unfelt)
      { stat: DOMINANCE_STAT, op: 'flat', value: ARMAMENT_DOMINANCE, source: 'haki.armament' }, // clashes one LETTER up the ladder while coated
      { stat: DEFLECT_STAT, op: 'flat', value: 0.5, source: 'haki.armament' }, // a coated blade turns HALF the balls (ProjectileSystem rolls the stat) — the hardening already halves what lands; a full wall on top made a coated body immune to range
    ],
    status: { label: 'Armament', color: 0x6a4a9a },
  },
  // DEFLECTING — the Samurai's shukuchi window (0.3s): NOT i-frames. Melee lands as normal; a PROJECTILE that
  // would strike him has `deflectChance` odds of being turned back at its shooter (ProjectileSystem reads the
  // stat). Invisible like invuln — the dash itself is the tell.
  {
    id: 'effect.deflecting',
    name: 'Deflecting',
    durationSec: 0.3,
    modifiers: [{ stat: DEFLECT_STAT, op: 'flat', value: 0.5, source: 'deflect.shukuchi' }],
  },
  // KIAI — the Samurai's engagement buff (ability.kiai): haste + a little bite, visibly labelled so the opponent
  // and the watcher both see the charge coming. The move-speed stat is the generic multiplier MovementSystem reads
  // (MOVE_SPEED_STAT) — mulPct so it stacks with a sprint or a trait instead of overriding them.
  {
    id: 'effect.kiai',
    name: 'Kiai',
    durationSec: 4,
    grantTags: ['buff.kiai'],
    modifiers: [
      { stat: MOVE_SPEED_STAT, op: 'mulPct', value: 0.3, source: 'buff.kiai' },
      { stat: 'atk', op: 'mulPct', value: 0.1, source: 'buff.kiai' }, // DAMAGE: +10% — a little bite, not a power spike
      { stat: 'atkSpeed', op: 'mulPct', value: 0.3, source: 'buff.kiai' }, // ATTACK SPEED: +30% — faster cuts AND shorter cooldowns while the shout lasts
      { stat: COMBO_RECOVERY_STAT, op: 'mulPct', value: -0.5, source: 'buff.kiai' }, // COMBO RECOVERY: the post-combo lockout HALVED — the three-cut chain comes back twice as fast
    ],
    status: { label: 'Kiai', color: 0xffb347 },
  },
  // THE PACES (ability.pace's cycle) — held until switched, so the duration is only a cap (an hour). The trade is in the
  // modifiers. SECOND WIND: every action costs HALF, the breath starts back in half the time and refills ×1.5 — more cuts
  // NOW — while each spend is booked at ×1.5 wear and the day can't rest while keyed up (recovery ×0.5). MEASURED BREATH:
  // breath refills ×0.6 but each spend books ×0.3, vigor mends slowly even under pressure (its tag) and rests ×1.5 better.
  {
    id: 'effect.secondWind',
    name: 'Second Wind',
    durationSec: 3600,
    grantTags: [TAG_PACE_PUSH],
    modifiers: [
      { stat: STAM_COST_STAT, op: 'mulPct', value: -0.5, source: 'pace.push' },
      { stat: STAM_REGEN_DELAY_STAT, op: 'mulPct', value: -0.5, source: 'pace.push' },
      { stat: STAM_REGEN_STAT, op: 'mulPct', value: 0.5, source: 'pace.push' }, // 24 → 36/s
      { stat: VIGOR_WEAR_STAT, op: 'mulPct', value: 0.5, source: 'pace.push' },
      { stat: VIGOR_RECOVER_STAT, op: 'mulPct', value: -0.5, source: 'pace.push' }, // ~6 min to full at rest — you can't rest while pushing
      { stat: WILL_REGEN_STAT, op: 'mulPct', value: 1.0, source: 'pace.push' }, // ×2: 3 → 6/s — a second wind lifts the spirit; the will REGEN between coatings, never the coating's drain
    ],
    status: { label: 'Second Wind', color: 0xff8a4a },
  },
  {
    id: 'effect.measuredBreath',
    name: 'Measured Breath',
    durationSec: 3600,
    grantTags: [TAG_PACE_CONSERVE],
    modifiers: [
      { stat: STAM_REGEN_STAT, op: 'mulPct', value: -0.4, source: 'pace.conserve' },
      { stat: VIGOR_WEAR_STAT, op: 'mulPct', value: -0.7, source: 'pace.conserve' },
      { stat: VIGOR_RECOVER_STAT, op: 'mulPct', value: 0.5, source: 'pace.conserve' }, // ~2 min to full at rest — the resting stance rests better
    ],
    status: { label: 'Measured Breath', color: 0x6ad0a0 },
  },
  // the RONIN's KIAI — the master's shout: a bigger, longer surge than the Samurai's (B-tier technique, not B-tier
  // stats): +40% attack speed, +15% damage, +30% stride, the combo pause cut by 60%, six seconds. Same seams.
  {
    id: 'effect.kiaiElite',
    name: 'Kiai',
    durationSec: 6,
    grantTags: ['buff.kiai'],
    modifiers: [
      { stat: MOVE_SPEED_STAT, op: 'mulPct', value: 0.3, source: 'buff.kiaiElite' },
      { stat: 'atk', op: 'mulPct', value: 0.15, source: 'buff.kiaiElite' },
      { stat: 'atkSpeed', op: 'mulPct', value: 0.4, source: 'buff.kiaiElite' },
      { stat: COMBO_RECOVERY_STAT, op: 'mulPct', value: -0.6, source: 'buff.kiaiElite' },
    ],
    status: { label: 'Kiai', color: 0xffd060 },
  },
  // NI GORILLA — ZORO's arm pump (ability.niGorilla, X): eight seconds of +25% attack and the TAG that unlocks Nigori Zake —
  // a buff that GATES a technique (the Armament→Kokutō pattern on a style's own seam), so the finisher reads as a decision
  // (pump, then commit), not a cooldown. The pump shows on the BLOW: farther shoves, larger slashes (two multiplier stats).
  // PURE OFFENSE by design: defense is the coating's job (a +15% on the flat def stat
  // was ~1 point a hit — present in code, absent in play; a real reduction would stack with the hardening into a wall).
  // No ladder shift: dominance stays haki's.
  {
    id: 'effect.niGorilla',
    name: 'Ni Gorilla',
    durationSec: 8,
    grantTags: [TAG_PUMPED],
    modifiers: [
      { stat: 'atk', op: 'mulPct', value: 0.25, source: 'buff.niGorilla' },
      { stat: KNOCKBACK_STAT, op: 'mulPct', value: 0.35, source: 'buff.niGorilla' }, // pumped blows SHOVE farther — the push you see
      { stat: SHOT_SCALE_STAT, op: 'mulPct', value: 0.35, source: 'buff.niGorilla' }, // and the flying slashes come out a third larger…
      { stat: SHOT_RANGE_STAT, op: 'mulPct', value: 0.15, source: 'buff.niGorilla' }, // …and fly a touch farther (same speed: still as dodgeable)
    ],
    status: { label: 'Ni Gorilla', color: 0xd86a3a },
  },
  // ── CROWD CONTROL (the two CC classes × the electric theme — backlog #16's "shocked" vocabulary) ──────────
  // STAGGERED — the universal hitstun every landed attack applies (duration = the ability's `stun`, overridden
  // per hit). Slowed-class: feet still answer (SLOW_MULT), arms don't (no attack/guard).
  { id: 'effect.staggered', name: 'Staggered', durationSec: 0.4, grantTags: [TAG_SLOWED], status: { label: 'Slowed', color: 0xffe27a } },
  // STUNNED — the generic hard CC (jump-landing recovery; future heavy finishers): fully rooted + can't act.
  { id: 'effect.stunned', name: 'Stunned', durationSec: 0.35, grantTags: [TAG_STUNNED], status: { label: 'Stunned', color: 0xffe27a } },
  // BIND — the blade lock (combat/clash, MeleeSystem): steel met steel and both bodies HOLD there, blades crossed, until the
  // lock breaks. The same freeze as a stun (movement, input, abilities, guard all read the tag) with its own label; the
  // melee tick keeps a LOCKED swing alive with its clock paused (a plain stun ends a swing). The duration is set per lock.
  { id: 'effect.bladeLock', name: 'Bind', durationSec: 0.7, grantTags: [TAG_STUNNED], status: { label: 'Clash', color: 0xe8e4ff } }, // the label reads CLASH over both heads while the lock holds
  // SHOCKED — the electric SLOW (a charged round's zap, the wall-slam's no-wall graze): a lingering current,
  // slowed-class, cyan-themed. The theme color here is THE electric cyan — FX/draw read it, never a literal.
  { id: 'effect.shocked', name: 'Shocked', durationSec: 1.5, grantTags: [TAG_SLOWED], status: { label: 'Shocked', color: 0x6cf0ff } },
  // ELECTRIFIED — the electric FREEZE (the wall-slam pin): current locks the muscles, fully rooted, cyan.
  { id: 'effect.electrified', name: 'Electrified', durationSec: 3, grantTags: [TAG_STUNNED], status: { label: 'Electrified', color: 0x6cf0ff } },
]);
