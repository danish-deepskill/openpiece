import { Registry, type Def } from '../core/Registry';
import type { Modifier } from './Modifier';

/**
 * A timed (or instant) gameplay effect: a bundle of Modifiers and/or Tags applied to a target for a
 * duration, then removed. The generic vehicle for buffs, debuffs, DoTs, and states (i-frames, fear, …).
 * Effects are data — the EffectSystem applies/expires them; no per-effect code branches.
 */
export interface EffectDef extends Def {
  name: string;
  /** Seconds the effect lasts. */
  durationSec: number;
  /** Active for the duration; sourced to this effect instance so removal is clean. */
  modifiers?: Modifier[];
  /** Gameplay tags granted for the duration (e.g. 'state.invuln'). */
  grantTags?: string[];
}

export const Effects = new Registry<EffectDef>('Effects');

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
