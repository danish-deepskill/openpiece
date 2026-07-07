import type { Entity } from '../ecs/components';
import type { World } from '../ecs/World';
import type { Collision } from '../world/Collision';
import type { SpatialQuery } from '../world/SpatialQuery';

const MAX_BODY_R = 20; // largest body radius (+ margin) — bounds the neighbor-search window

/**
 * Hard body-vs-body collision with weight. After movement integrates, any two overlapping FOOT actors are
 * pushed apart along the line between their centers, split by INVERSE MASS — the lighter one yields more, so a
 * heavy body shoves a light one aside and a light one can't walk through a heavy one. The push goes through the
 * tile Collision, so nobody is shoved into a wall (they press, not clip). Applies to EVERY foot actor including
 * the player — the Moat: the player is just another body. Dead bodies and ship riders are skipped (you can walk
 * over a corpse; riders are pinned to their hull). One pass/frame; multi-body stacks settle over a few frames.
 */
export class BodyCollisionSystem {
  constructor(
    private readonly world: World,
    private readonly query: SpatialQuery,
    private readonly collision: Collision,
  ) {}

  /** A solid, pushable body: a living, GROUNDED foot actor that isn't aboard a ship. An AIRBORNE actor (a jumper —
   *  docs/design/MOVEMENT_AIR.md) is NOT solid: it's above the crowd, so it neither pushes others nor is pushed —
   *  you jump OVER units. Excluding it here covers both directions at once (skipped as `e`, filtered from neighbors). */
  private solid = (e: Entity): boolean =>
    !!e.transform && !!e.mover && e.mover.mode === 'foot' && e.mover.layer !== 'air' && !e.onDeck && !e.health?.dead;

  update(): void {
    for (const e of this.world.with('transform', 'mover')) {
      if (!this.solid(e)) continue;
      const t = e.transform!;
      const massE = e.mover!.mass;
      // each unordered pair resolved once (only neighbors with a higher id), which also hands us the other body
      const neighbors = this.query.within(t.x, t.y, t.r + MAX_BODY_R, (o) => o.id > e.id && this.solid(o));
      for (const o of neighbors) {
        const ot = o.transform!;
        const dx = t.x - ot.x;
        const dy = t.y - ot.y;
        const d = Math.hypot(dx, dy);
        const overlap = t.r + ot.r - d;
        if (overlap <= 0) continue;
        // separation direction; if exactly stacked, pick a deterministic one so they still split
        let nx: number;
        let ny: number;
        if (d > 0.01) {
          nx = dx / d;
          ny = dy / d;
        } else {
          const a = ((e.id % 8) / 8) * Math.PI * 2;
          nx = Math.cos(a);
          ny = Math.sin(a);
        }
        const massO = o.mover!.mass;
        const total = massE + massO;
        // each body moves by the OTHER's share of the overlap → the lighter body yields more
        this.collision.tryMove(t, nx * overlap * (massO / total), ny * overlap * (massO / total), t.r, e.mover!.mode);
        this.collision.tryMove(ot, -nx * overlap * (massE / total), -ny * overlap * (massE / total), ot.r, o.mover!.mode);
      }
    }
  }
}
