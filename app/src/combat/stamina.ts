import { Abilities } from './Ability';
import { STAM_REGEN_DELAY } from '../config/constants';
import type { Combatant, Entity } from '../ecs/components';

/** The sprint capability id — the ONE home for it (like BASE_KIT); the drain rate + speed boost are DATA on
 *  the def (ability.sprint.costStamPerSec / moveMult), not constants scattered here. */
export const ABILITY_SPRINT = 'ability.sprint';

/** THE stamina spend — clamp + pause regen. Every drain (ability cost, sprint) goes through here so the
 *  regen-delay rule can never diverge between spend sites (DESIGN_PATTERNS §6: one enforcement point). */
export function spendStamina(c: Combatant, amount: number): void {
  c.stam = Math.max(0, c.stam - amount);
  c.regenT = STAM_REGEN_DELAY;
}

/** Sprint gate + drain + boost — IDENTICAL for player input and AI brains (the Moat): if the entity HAS the
 *  sprint grant and can pay, drains stamina for the frame and returns the boosted speed; otherwise returns
 *  `baseSpeed` unchanged. God mode drains nothing (free sprint) but still gets the boost. */
export function trySprint(e: Entity, baseSpeed: number, dt: number): number {
  const c = e.combatant;
  if (!c || !e.loadout?.granted.has(ABILITY_SPRINT)) return baseSpeed; // no capability — can't sprint (the Moat)
  const god = e.tags?.has('state.godMode') === true;
  if (!god && c.stam <= 1) return baseSpeed; // out of gas (god mode: never runs dry)
  const d = Abilities.get(ABILITY_SPRINT);
  if (!god) {
    c.stam = Math.max(0, c.stam - (d.costStamPerSec ?? 0) * dt);
    c.regenT = STAM_REGEN_DELAY; // sprinting keeps regen paused
  }
  return baseSpeed * (d.moveMult ?? 1);
}
