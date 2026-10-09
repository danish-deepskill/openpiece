import { applyEffect, Effects, releaseEffect } from '../combat/Effect';
import { spendStamina, spendWill } from '../combat/stamina';
import type { ActiveEffect, Entity } from '../ecs/components';
import type { World } from '../ecs/World';

/** TICKS and EXPIRES timed effects (their Modifiers + Tags), source-tracked for clean removal. APPLICATION
 *  lives in combat/Effect.applyEffect — a standalone fn, because services (StrikeResolver's hitstun, guard
 *  breaks, the wall-slam) apply effects too and injecting this system everywhere was the wrong coupling. */
export class EffectSystem {
  constructor(private readonly world: World) {}

  /** System-facing façade for existing callers — delegates to the ONE application path (combat/Effect). */
  apply(e: Entity, effectId: string, by: string, dur?: number): void {
    applyEffect(e, effectId, by, dur);
  }

  update(dt: number): void {
    for (const e of this.world.with('effects')) {
      const arr = e.effects!.active;
      for (let i = arr.length - 1; i >= 0; i--) {
        const a = arr[i];
        a.remaining -= dt;
        // a DRAINING effect (a held coating) bills the pool every tick and dies the moment it's empty — the pool is
        // the budget, the duration only a cap. spendStamina pauses regen, so a held state never refills under itself.
        const def = Effects.get(a.id);
        if (def.drainStamPerSec !== undefined && e.combatant) {
          spendStamina(e.combatant, def.drainStamPerSec * dt, e);
          if (e.combatant.stam <= 0) a.remaining = 0;
        }
        if (def.drainWillPerSec !== undefined && e.combatant) {
          spendWill(e.combatant, def.drainWillPerSec * dt); // a body with no pool spends nothing…
          if ((e.combatant.will ?? 0) <= 0) a.remaining = 0; // …and can't HOLD a haki state: it ends at once
        }
        if (a.remaining <= 0) {
          arr.splice(i, 1);
          this.expire(e, a, arr);
        }
      }
    }
  }

  /** END an active effect NOW (the toggle-off of a held state — AbilitySystem's `toggle` press). Removes ONE instance
   *  (the 'refresh' rule keeps one per id anyway) through the same expiry path a timer takes. No-op if absent. */
  end(e: Entity, effectId: string): boolean {
    const arr = e.effects?.active;
    if (!arr) return false;
    const i = arr.findIndex((a) => a.id === effectId);
    if (i < 0) return false;
    const [a] = arr.splice(i, 1);
    this.expire(e, a!, arr); // splice at a found index yields the element
    return true;
  }

  private expire(e: Entity, a: ActiveEffect, remaining: ActiveEffect[]): void {
    releaseEffect(e, a, remaining); // the ONE release path (combat/Effect) — endEffect shares it
  }
}
