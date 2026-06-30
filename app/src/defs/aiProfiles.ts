import { Registry, type Def } from '../core/Registry';

export type Approach = 'rush' | 'kite' | 'flank' | 'guard';

/**
 * A data-driven AI behavior profile. Combat AI is composed from these knobs rather than a bespoke brain per
 * enemy: the same FSM reads the profile to decide how it senses, approaches, and disengages. New "AI models"
 * are registry entries (or new `approach` cases), not new systems.
 */
export interface AIProfileDef extends Def {
  name: string;
  sight: number; // detection radius (also needs line-of-sight, so walls hide you)
  leash: number; // give up + go home if this far from its post
  loseSightSec: number; // give up this long after losing sight of the target
  approach: Approach;
  preferredRange?: number; // kite: keep this much distance
  guardRadius?: number; // guard: only engage within this of its post
  fleeBelowHp?: number; // 0..1 HP fraction; flee below it
  reaction?: number; // aim-lag seconds — it aims/commits to where the target *was*, so movement makes it whiff; default 0.18
}

export const AIProfiles = new Registry<AIProfileDef>('AIProfiles');

AIProfiles.registerAll([
  { id: 'ai.rusher', name: 'Rusher', sight: 320, leash: 640, loseSightSec: 3, approach: 'rush', reaction: 0.16 },
  { id: 'ai.flanker', name: 'Flanker', sight: 340, leash: 640, loseSightSec: 3, approach: 'flank', reaction: 0.18 },
  { id: 'ai.kiter', name: 'Kiter', sight: 380, leash: 640, loseSightSec: 3, approach: 'kite', preferredRange: 170, reaction: 0.14 },
  { id: 'ai.guard', name: 'Guard', sight: 280, leash: 260, loseSightSec: 2, approach: 'guard', guardRadius: 200, reaction: 0.24 },
  { id: 'ai.coward', name: 'Coward', sight: 300, leash: 9999, loseSightSec: 1.5, approach: 'kite', preferredRange: 9999, fleeBelowHp: 1 },
]);

export type Move = 'approach' | 'away' | 'home' | 'hold';
export interface Stance {
  move: Move;
  attack: boolean;
}

/**
 * Pure decision: given a profile and the current geometry, what should the unit do this frame? Kept pure
 * (no world/entity refs) so it's unit-testable. The brain handles *how* to move (pathfinding) + flank offset.
 */
export function combatStance(
  p: AIProfileDef,
  dist: number,
  reach: number,
  hpRatio: number,
  targetDistFromHome: number,
): Stance {
  if (p.fleeBelowHp != null && hpRatio <= p.fleeBelowHp) return { move: 'away', attack: false };
  if (p.approach === 'guard' && targetDistFromHome > (p.guardRadius ?? 200)) return { move: 'home', attack: false };

  if (p.approach === 'kite') {
    if (dist < (p.preferredRange ?? 160)) return { move: 'away', attack: false };
    const inReach = dist <= reach;
    return { move: inReach ? 'hold' : 'approach', attack: inReach };
  }

  // rush / flank / guard-while-engaging
  const inReach = dist <= reach;
  return { move: inReach ? 'hold' : 'approach', attack: inReach };
}
