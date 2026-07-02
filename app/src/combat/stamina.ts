import { SPRINT_DRAIN, SPRINT_MULT, STAM_REGEN_DELAY } from '../config/constants';
import type { Combatant, Entity } from '../ecs/components';

/** THE stamina spend — clamp + pause regen. Every drain (ability cost, sprint) goes through here so the
 *  regen-delay rule can never diverge between spend sites (DESIGN_PATTERNS §6: one enforcement point). */
export function spendStamina(c: Combatant, amount: number): void {
  c.stam = Math.max(0, c.stam - amount);
  c.regenT = STAM_REGEN_DELAY;
}

/** Sprint gate + drain + boost — IDENTICAL for player input and AI brains (the Moat): if the entity can pay,
 *  drains stamina for the frame and returns the boosted speed; otherwise returns `baseSpeed` unchanged. */
export function trySprint(e: Entity, baseSpeed: number, dt: number): number {
  const c = e.combatant;
  if (!c || c.stam <= 1) return baseSpeed;
  c.stam = Math.max(0, c.stam - SPRINT_DRAIN * dt);
  c.regenT = STAM_REGEN_DELAY; // sprinting keeps regen paused
  return baseSpeed * SPRINT_MULT;
}
