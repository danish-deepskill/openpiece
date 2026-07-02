import { STUN_SLOW } from '../config/constants';
import type { World } from '../ecs/World';
import type { Collision } from '../world/Collision';

/** Integrates movement intent (mover.vx/vy) and dodge impulses against the Collision rules. */
export class MovementSystem {
  constructor(
    private readonly world: World,
    private readonly collision: Collision,
  ) {}

  update(dt: number): void {
    for (const e of this.world.with('transform', 'mover')) {
      const t = e.transform!;
      const m = e.mover!;
      let vx: number;
      let vy: number;
      if (m.dodgeT > 0) {
        vx = m.dvx;
        vy = m.dvy;
        const decay = Math.pow(0.86, dt * 60); // time-based (matches the tuned 60fps feel at any frame rate)
        m.dvx *= decay;
        m.dvy *= decay;
        m.dodgeT = Math.max(0, m.dodgeT - dt);
      } else {
        vx = m.vx;
        vy = m.vy;
        if ((e.combatant?.stunT ?? 0) > 0) {
          vx *= STUN_SLOW; // staggered → sluggish (the knockback impulse above is unaffected)
          vy *= STUN_SLOW;
        }
        const terrain = this.collision.terrainSpeed(t.x, t.y); // wading shallows halves foot speed; dash ignores it
        vx *= terrain;
        vy *= terrain;
      }
      if (vx !== 0 || vy !== 0) this.collision.tryMove(t, vx * dt, vy * dt, t.r, m.mode);
    }
  }
}
