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
        m.dvx *= 0.86;
        m.dvy *= 0.86;
        m.dodgeT = Math.max(0, m.dodgeT - dt);
      } else {
        vx = m.vx;
        vy = m.vy;
      }
      if (vx !== 0 || vy !== 0) this.collision.tryMove(t, vx * dt, vy * dt, t.r, m.mode);
    }
  }
}
