import { Abilities } from './Ability';
import { STAM_REGEN_DELAY, VIGOR_FLOOR, VIGOR_WEAR, WILL_REGEN_DELAY } from '../config/constants';
import { STAM_COST_STAT, STAM_REGEN_DELAY_STAT, VIGOR_WEAR_STAT } from './stats';
import type { Combatant, Entity } from '../ecs/components';

/** The sprint capability id — the ONE home for it (like BASE_KIT); the drain rate + speed boost are DATA on
 *  the def (ability.sprint.costStamPerSec / moveMult), not constants scattered here. */
export const ABILITY_SPRINT = 'ability.sprint';

/** THE stamina spend — clamp + pause regen. Every drain (ability cost, sprint) goes through here so the
 *  regen-delay rule can never diverge between spend sites (DESIGN_PATTERNS §6: one enforcement point). */
export function spendStamina(c: Combatant, amount: number, by?: Entity): void {
  c.stam = Math.max(0, c.stam - amount);
  c.regenT = STAM_REGEN_DELAY * (by?.attributes?.get(STAM_REGEN_DELAY_STAT) ?? 1); // a pushing body gets its breath back sooner
  // VIGOR is not worn here — the day pays when the breath comes BACK (CombatantSystem) — but the PRICE is set NOW: the
  // effort (the undiscounted cost — a push's half-price swing is still a full swing) × the wear of the pace held at this
  // instant is BOOKED as debt and paid off as the bar refills. Decided at exertion, charged at recovery: flipping to a
  // measured breath after a push changes nothing already owed.
  if (c.maxStam > 0) {
    const effort = amount / (by?.attributes?.get(STAM_COST_STAT) ?? 1);
    c.vigorDebt = (c.vigorDebt ?? 0) + (effort / c.maxStam) * VIGOR_WEAR * 100 * (by?.attributes?.get(VIGOR_WEAR_STAT) ?? 1);
  }
}

/** What an action really costs THIS body in stamina — the authored cost × its pace's `stamCostMul` (a push halves it).
 *  The one place the discount is applied, so affordability and the spend can't disagree. */
export function stamCostOf(e: Entity, cost: number): number {
  return cost * (e.attributes?.get(STAM_COST_STAT) ?? 1);
}

/** The stamina bar's current CEILING: maxStam scaled by vigor, never below the floor. Every fill clamp, fraction and
 *  bar reads THIS, not maxStam — maxStam is the day's full pool, the cap is what's left of it right now. */
export function stamCap(c: Combatant): number {
  return c.maxStam * (VIGOR_FLOOR + (1 - VIGOR_FLOOR) * (c.vigor ?? 1));
}

/** THE will spend — the haki pool's one drain path (a coating's per-second bill, a technique's cost): clamp + pause
 *  the trickle, mirroring spendStamina. A body with no pool spends nothing (callers gate on affordability first). */
export function spendWill(c: Combatant, amount: number): void {
  if (c.will === undefined) return;
  c.will = Math.max(0, c.will - amount);
  c.willRegenT = WILL_REGEN_DELAY;
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
  if (!god) spendStamina(c, stamCostOf(e, (d.costStamPerSec ?? 0) * dt), e); // THE one spend path, at this body's price (it also keeps regen paused and wears vigor — a sprint tires you like any exertion; the old direct write skipped the wear)
  return baseSpeed * (d.moveMult ?? 1);
}
