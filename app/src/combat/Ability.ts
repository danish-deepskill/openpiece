import { Registry, type ContentId, type Def } from '../core/Registry';
import type { StatId } from './Modifier';

export interface AbilityShape {
  range: number;
  arc: number; // half-angle of the hit cone (radians) — used by 'arc' pattern
  single?: boolean; // hits only the nearest target in the cone/line
  swing: 'melee' | 'pistol';
  /** Hit shape: 'arc' = cone fan (default); 'line' = straight forward corridor (stab); 'mixed' = random per swing. */
  pattern?: 'arc' | 'line' | 'mixed';
  width?: number; // 'line' corridor half-width (px)
}

/**
 * A data-driven action. Any of the four combat layers can grant abilities (a weapon's strike, a fruit's
 * pistol, a style's dash). The AbilitySystem resolves them generically: pay cost, set cooldown, deal a
 * shaped hit (damage scaled off an attribute), apply a self-impulse, and/or apply a self-effect.
 */
export interface AbilityDef extends Def {
  name: string;
  cooldown: number; // BASE recovery; effective = cooldown / atkSpeed (a tier stat)
  costStam?: number; // stamina drained on use (clamped to 0; basic attacks drain but never block)
  shape?: AbilityShape; // offensive abilities
  damageStat?: StatId; // base damage read from the user's attributes (e.g. 'atk')
  damageFlat?: number;
  knockback?: number;
  selfImpulse?: number; // dash speed (movement abilities)
  grantEffect?: ContentId; // self-effect on use (e.g. i-frames)
  minStam?: number; // minimum stamina required to activate (gates dash/specials)
  requireTags?: string[];
  blockTags?: string[];
}

export const Abilities = new Registry<AbilityDef>('Abilities');

// NOTE: `cooldown` is the BASE recovery; effective recovery = cooldown / atkSpeed (a tier stat), so attack
// speed is tier-driven, not a hardcoded player advantage. Basic attacks drain a little stamina (costStam);
// dash gates on `minStam`. Same kit, same rules for every actor.
Abilities.registerAll([
  // base kit (unarmed): a short, committed fist jab — close range, NARROW cone, real recovery
  { id: 'ability.punch', name: 'Punch', cooldown: 0.5, shape: { range: 0, arc: 0.22, swing: 'melee' }, damageStat: 'atk', knockback: 165, costStam: 6 },
  { id: 'ability.dodge', name: 'Dodge', cooldown: 0.55, costStam: 24, minStam: 18, selfImpulse: 430, grantEffect: 'effect.invuln' },
  // Haki — Armament: a timed coating that counters Devil Fruits (bypasses Logia intangibility) + boosts damage
  { id: 'ability.armament', name: 'Armament', cooldown: 8, grantEffect: 'effect.armament' },
  // weapon (cutlass): the reach/arc upgrade over fists (wider sweep than a fist, but still focused)
  { id: 'ability.slash', name: 'Slash', cooldown: 0.45, shape: { range: 30, arc: 0.5, swing: 'melee', pattern: 'mixed', width: 12 }, damageStat: 'atk', damageFlat: 2, knockback: 190, costStam: 6 },
  // fighting style (flash step)
  { id: 'ability.flashDash', name: 'Flash Dash', cooldown: 0.45, costStam: 20, minStam: 16, selfImpulse: 560, grantEffect: 'effect.invuln' },
  // devil fruit (gomu)
  { id: 'ability.gomuPistol', name: 'Gomu Pistol', cooldown: 0.4, shape: { range: 300, arc: 0.2, single: true, swing: 'pistol' }, damageStat: 'atk', damageFlat: 7, knockback: 300, costStam: 5 },
  { id: 'ability.gomuGatling', name: 'Gomu Gatling', cooldown: 1.6, shape: { range: 200, arc: 0.4, swing: 'pistol' }, damageStat: 'atk', knockback: 80, costStam: 12 },
  { id: 'ability.gomuRocket', name: 'Gomu Rocket', cooldown: 2.0, costStam: 15, minStam: 12, selfImpulse: 720, grantEffect: 'effect.invuln' },
  // enemy melee — the SAME ability path as the player (damage scales off the unit's atk attribute)
  { id: 'ability.banditStrike', name: 'Strike', cooldown: 0.5, shape: { range: 0, arc: 0.28, swing: 'melee' }, damageStat: 'atk', knockback: 175, costStam: 6 },
  { id: 'ability.captainCleave', name: 'Cleave', cooldown: 0.62, shape: { range: 0, arc: 0.55, swing: 'melee' }, damageStat: 'atk', knockback: 240, costStam: 8 },
]);

/**
 * Effective reach of an ability. For melee, the user's body `reach` (race/build) is added to the ability's
 * range bonus (a weapon's length); ranged abilities are a fixed range. So a longer-limbed unit reaches
 * further with the same fist or sword. (Hit detection then adds the target's radius.)
 */
export function abilityRange(ab: AbilityDef, bodyReach: number): number {
  if (!ab.shape) return 0;
  return ab.shape.range + (ab.shape.swing === 'melee' ? bodyReach : 0);
}
