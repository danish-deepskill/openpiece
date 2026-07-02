import { STAM_REGEN } from '../config/constants';
import type { World } from '../ecs/World';

/** Per-frame upkeep of shared combat resources — stamina (delayed regen), combo decay, hitstun — every combatant. */
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
    }
  }
}
