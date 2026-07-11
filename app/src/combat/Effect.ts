import { Registry, type ContentId, type Def } from '../core/Registry';
import { modifierProblem, type Modifier } from './Modifier';
import { syncDerivedResources } from './attributes';
import type { Entity } from '../ecs/components';

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

/** The CC tags every gate reads (movement roots/slows, ability + guard refusals, the overhead label). ONE home
 *  for the strings — systems compare these, never literals. */
export const TAG_STUNNED = 'state.stunned';
export const TAG_SLOWED = 'state.slowed';

Effects.registerAll([
  { id: 'effect.invuln', name: 'Invulnerable', durationSec: 0.3, grantTags: ['state.invuln'] },
  {
    id: 'effect.armament',
    name: 'Armament Haki',
    durationSec: 4,
    grantTags: ['haki.armament.active'],
    modifiers: [{ stat: 'atk', op: 'mulPct', value: 0.2, source: 'haki.armament' }],
  },
  // ── CROWD CONTROL (the two CC classes × the electric theme — backlog #16's "shocked" vocabulary) ──────────
  // STAGGERED — the universal hitstun every landed attack applies (duration = the ability's `stun`, overridden
  // per hit). Slowed-class: feet still answer (SLOW_MULT), arms don't (no attack/guard).
  { id: 'effect.staggered', name: 'Staggered', durationSec: 0.4, grantTags: [TAG_SLOWED], status: { label: 'Slowed', color: 0xffe27a } },
  // STUNNED — the generic hard CC (jump-landing recovery; future heavy finishers): fully rooted + can't act.
  { id: 'effect.stunned', name: 'Stunned', durationSec: 0.35, grantTags: [TAG_STUNNED], status: { label: 'Stunned', color: 0xffe27a } },
  // SHOCKED — the electric SLOW (a charged round's zap, the wall-slam's no-wall graze): a lingering current,
  // slowed-class, cyan-themed. The theme color here is THE electric cyan — FX/draw read it, never a literal.
  { id: 'effect.shocked', name: 'Shocked', durationSec: 1.5, grantTags: [TAG_SLOWED], status: { label: 'Shocked', color: 0x6cf0ff } },
  // ELECTRIFIED — the electric FREEZE (the wall-slam pin): current locks the muscles, fully rooted, cyan.
  { id: 'effect.electrified', name: 'Electrified', durationSec: 3, grantTags: [TAG_STUNNED], status: { label: 'Electrified', color: 0x6cf0ff } },
]);
