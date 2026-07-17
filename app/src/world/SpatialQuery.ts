import { entityHostile } from '../combat/targeting';
import { dist2 } from '../core/math';
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

  /** Zero-allocation neighbor VISIT — the hot-loop twin of within() (2026-07 foundation audit M1: every
   *  "who's near X" enumeration flows through THIS class, or the future uniform-grid swap becomes a
   *  multi-system hunt instead of one). The chokepoint owns only the spatial cut; callers narrow inside
   *  `fn`. One closure per QUERY (not per entity) — the same cost shape as nearest()'s pred. */
  forEachWithin(x: number, y: number, range: number, fn: (e: Entity) => void): void {
    const r2 = range * range;
    for (const e of this.world.entities) {
      if (!e.transform) continue;
      if (dist2(x, y, e.transform.x, e.transform.y) < r2) fn(e);
    }
  }

  /** Nearest living combatant hostile to `self` — faction-matrix hostiles AND anyone `self` has a personal
   *  grudge with (entityHostile), so a betrayed ally becomes a valid target. Excludes ships (naval, not melee).
   *  Search origin defaults to self's position; a caller (squad focus-fire) can override it (e.g. the
   *  squad centroid) while keeping self's hostility perspective. */
  nearestHostile(self: Entity, range: number, atX?: number, atY?: number): Entity | undefined {
    const t = self.transform!;
    return this.nearest(
      atX ?? t.x,
      atY ?? t.y,
      range,
      (e) => !e.ship && !!e.faction && !!e.health && !e.health.dead && entityHostile(self, e),
    );
  }
}
