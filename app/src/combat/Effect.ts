import { Registry, type Def } from '../core/Registry';
import { modifierProblem, type Modifier } from './Modifier';

/**
 * A timed (or instant) gameplay effect: a bundle of Modifiers and/or Tags applied to a target for a
 * duration, then removed. The generic vehicle for buffs, debuffs, DoTs, and states (i-frames, fear, …).
 * Effects are data — the EffectSystem applies/expires them; no per-effect code branches.
 */
export interface EffectDef extends Def {
  name: string;
  /** Seconds the effect lasts. */
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
}

// validated at boot: a negative duration or NaN modifier is a content bug, not a mid-game mystery
export const Effects = new Registry<EffectDef>('Effects', (d) => {
  if (!(d.durationSec >= 0)) return `durationSec must be ≥ 0 (got ${d.durationSec})`;
  return modifierProblem(d.modifiers);
});

Effects.registerAll([
  { id: 'effect.invuln', name: 'Invulnerable', durationSec: 0.3, grantTags: ['state.invuln'] },
  {
    id: 'effect.armament',
    name: 'Armament Haki',
    durationSec: 4,
    grantTags: ['haki.armament.active'],
    modifiers: [{ stat: 'atk', op: 'mulPct', value: 0.2, source: 'haki.armament' }],
  },
]);
