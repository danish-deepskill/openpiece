import { dist2 } from '../core/math';
import { factions, type FactionId } from '../defs/factions';
import type { Entity } from '../ecs/components';
import type { World } from '../ecs/World';

/**
 * Neighbor / target queries resolved through the faction relations matrix (no team checks).
 * Linear scan today (entity counts are small); this is the single chokepoint to swap for a
 * uniform-grid spatial hash later — the brains/combat callers won't change.
 */
export class SpatialQuery {
  constructor(private readonly world: World) {}

  nearest(x: number, y: number, range: number, pred: (e: Entity) => boolean): Entity | undefined {
    let best: Entity | undefined;
    let bestD = range * range;
    for (const e of this.world.entities) {
      if (!e.transform || !pred(e)) continue;
      const d = dist2(x, y, e.transform.x, e.transform.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  within(x: number, y: number, range: number, pred: (e: Entity) => boolean): Entity[] {
    const out: Entity[] = [];
    const r2 = range * range;
    for (const e of this.world.entities) {
      if (!e.transform || !pred(e)) continue;
      if (dist2(x, y, e.transform.x, e.transform.y) < r2) out.push(e);
    }
    return out;
  }

  /** Nearest living, hostile *combatant* — excludes ships (those are for naval combat, not melee). */
  nearestHostile(x: number, y: number, range: number, self: FactionId): Entity | undefined {
    return this.nearest(
      x,
      y,
      range,
      (e) => !e.ship && !!e.faction && !!e.health && !e.health.dead && factions.isHostile(self, e.faction.id),
    );
  }
}
