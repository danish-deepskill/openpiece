import { angleDiff } from '../core/math';
import type { Entity } from '../ecs/components';
import { phaseAt, type CombatWeight } from './phases';

/**
 * GUARD — the defensive triangle (Sekiro/Deepwoken lineage; docs/design/COMBAT.md "posture"):
 *   BLOCK (hold): incoming hits reroute HP damage → POSTURE damage. Safe, but the bar climbs — overflow
 *     is a GUARD BREAK (stunned + open). Posture only regenerates while the guard is DOWN.
 *   PARRY (tap): a brief timed window. A hit landing in it is negated outright, the attacker's posture
 *     spikes and their swing is interrupted, the defender's posture refunds. Miss → parry cooldown, but
 *     the same held key is already blocking (the fallback is built into the gesture).
 *   FEINT: raising your guard DURING YOUR OWN WINDUP cancels the swing — the show-the-tell-then-don't
 *     mind game that keeps parry-on-read honest. Mid-active/recover the swing is committed; no guard.
 * Both guards are DIRECTIONAL (an arc of the defender's facing) — parry with your back turned and the hit
 * lands clean. Deliberate deviation from Deepwoken's 360° parry: this game's flanking/blind-arc positioning
 * play must stay rewarded, and the answer to being surrounded is the dodge, not the parry.
 * One engine: the player's F key and the AI brains call the SAME functions here (the Moat).
 */

/** Parry deflection window opened by a guard tap (s). Generous on purpose — timing skill should live in
 *  reading the windup, not in frame-perfect input. */
export const PARRY_WINDOW = 0.22;
/** Parry re-arm time after a WHIFFED window (s) — a missed read costs you the option for a beat. */
export const PARRY_COOLDOWN = 1.2;
/** Auto-parry grace after a SUCCESSFUL parry (s) — multi-hit strings can't cheat through the reward. */
export const PARRY_GRACE = 0.3;
/** Posture spiked onto the PARRIED attacker — parry pressure can break an aggressor's own posture. */
export const PARRY_POSTURE = 12;
/** Defender posture refunded by a successful parry. */
export const PARRY_REFUND = 8;
/** Stagger on the parried attacker (s) — the punish opening. */
export const PARRY_STUN = 0.45;
/** Guard-break stagger (s) — Deepwoken's 1.05s, the price of turtling into overflow. */
export const GUARD_BREAK_STUN = 1.05;
/** Guard arcs: |angle between the defender's facing and the incoming hit| must be inside. The parry arc is
 *  slightly wider than the block arc (a read deserves forgiveness); the rear stays open to both. */
export const BLOCK_ARC = 1.75; // ≈ ±100°
export const PARRY_ARC = 2.1; // ≈ ±120°
/** Movement multiplier while holding block — bracing is not a walk. */
export const BLOCK_MOVE_MULT = 0.55;
/** Posture recovered per second while the guard is DOWN (never while blocking). Deliberately slow — built-up
 *  guard strain should LINGER, so a pressured fighter stays near the break instead of resetting between hits. */
export const POSTURE_REGEN = 5;

/** Posture damage a blocked hit deals, by the attacker's combat weight — scales with WEIGHT, not damage
 *  (Deepwoken's rule): a heavy crushes guards, a knife barely rattles them. Second column of the same
 *  ladder that drives windup (combat/phases.WEIGHT_PHASES). */
export const WEIGHT_POSTURE: Record<CombatWeight, number> = Object.freeze({
  unarmed: 4,
  light: 5,
  medium: 8,
  heavy: 14,
  ranged: 6,
});

/**
 * Raise the guard. `parry` decides whether this ALSO opens a parry deflection window:
 *  - the PLAYER's F key passes `parry: true` — one gesture opens the window then falls into a hold (tap-vs-
 *    hold is a TIMING distinction: whiff the window and you're still blocking).
 *  - an AI that ROLLED BLOCK passes `parry: false` — for the AI, block and parry are separate DECISIONS
 *    (the roll already chose one), so a block must NOT smuggle in a free parry window (the bug: a blockChance-1
 *    unit was still parrying, because tryGuard always armed the window).
 * During the actor's OWN windup this is the FEINT (the swing is forfeited); once the swing is active/recovering
 * it's committed — no guard. Returns false when guarding is impossible (stunned, mid-commit).
 */
export function tryGuard(e: Entity, parry = true): boolean {
  const c = e.combatant;
  if (!c) return false;
  if ((c.stunT ?? 0) > 0) return false; // staggered — your arms won't answer
  const m = e.melee;
  if (m) {
    const p = m.dur > 0 ? Math.min(1, m.t / m.dur) : 1;
    if (phaseAt(m.phases, p) !== 'windup') return false; // committed — the cut is already travelling
    delete e.melee; // FEINT: show the tell, pull the swing, guard comes up
  }
  c.blocking = true;
  if (parry && (c.parryCd ?? 0) <= 0) {
    c.parryT = PARRY_WINDOW;
    c.parryCd = PARRY_COOLDOWN; // re-armed instantly on success (see resolveGuard)
  }
  return true;
}

/** Lower the guard (key released / AI hold expired). Posture regen resumes (CombatantSystem). */
export function endGuard(e: Entity): void {
  if (e.combatant) e.combatant.blocking = false;
}

/** Deal posture damage to an entity (blocked hit, or the backfire onto a parried attacker). Returns true
 *  if it BROKE them — posture resets and they eat the guard-break stagger. */
export function damagePosture(e: Entity, amount: number): boolean {
  const c = e.combatant;
  if (!c) return false;
  c.posture += amount;
  if (c.posture < c.maxPosture) return false;
  c.posture = 0;
  c.blocking = false;
  c.parryT = 0;
  c.stunT = Math.max(c.stunT ?? 0, GUARD_BREAK_STUN);
  return true;
}

export type GuardOutcome = 'none' | 'parried' | 'blocked' | 'guardBreak';

/**
 * How the target's guard answers an incoming hit — called by StrikeResolver BEFORE damage applies.
 * Directional: the hit must arrive inside the guard's facing arc, so a turned back is always open.
 * Mutates the defender's guard state (parry consumption/grace, posture, break stagger); the CALLER
 * handles the attacker's side of a parry (posture spike, interrupt) and all FX.
 */
export function resolveGuard(attacker: Entity, target: Entity, postureDamage: number): GuardOutcome {
  const c = target.combatant;
  const tt = target.transform;
  const at = attacker.transform;
  if (!c || !tt || !at) return 'none';
  const incoming = Math.atan2(at.y - tt.y, at.x - tt.x); // where the blow comes FROM, seen by the defender
  const off = Math.abs(angleDiff(incoming, tt.angle));
  if ((c.parryT ?? 0) > 0 && off <= PARRY_ARC) {
    c.parryT = PARRY_GRACE; // auto-parry grace — a string can't cheat through the reward
    c.parryCd = 0; // success re-arms instantly (only a WHIFF pays the cooldown)
    c.posture = Math.max(0, c.posture - PARRY_REFUND);
    return 'parried';
  }
  if (c.blocking && off <= BLOCK_ARC) {
    return damagePosture(target, postureDamage) ? 'guardBreak' : 'blocked';
  }
  return 'none';
}
