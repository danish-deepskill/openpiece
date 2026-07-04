import { POSTURE_REGEN } from '../combat/guard';
import { STAM_REGEN } from '../config/constants';
import type { World } from '../ecs/World';

/** Per-frame upkeep of shared combat resources — stamina (delayed regen), combo decay, hitstun, posture and
 *  the parry timers — every combatant (the guard is not player-only: the Moat). */
export class CombatantSystem {
  constructor(private readonly world: World) {}

  update(dt: number): void {
    for (const e of this.world.with('combatant')) {
      const c = e.combatant!;
      if (c.comboT > 0) {
        c.comboT -= dt;
        if (c.comboT <= 0) c.combo = 0;
      }
      if (c.stunT && c.stunT > 0) c.stunT = Math.max(0, c.stunT - dt);
      // stamina regen waits out the post-spend delay, THEN refills — so it only recovers when you're not fighting
      if (c.regenT && c.regenT > 0) c.regenT = Math.max(0, c.regenT - dt);
      else if (c.stam < c.maxStam) c.stam = Math.min(c.maxStam, c.stam + STAM_REGEN * dt);
      // guard upkeep: the parry window closes, the whiff cooldown re-arms, and posture recovers ONLY while
      // the guard is DOWN — holding block banks the strain (turtling is a slowly-losing position by design)
      if (c.parryT && c.parryT > 0) c.parryT = Math.max(0, c.parryT - dt);
      if (c.parryCd && c.parryCd > 0) c.parryCd = Math.max(0, c.parryCd - dt);
      if (!c.blocking && c.posture > 0) c.posture = Math.max(0, c.posture - POSTURE_REGEN * dt);
    }
  }
}
