import { Abilities } from '../combat/Ability';
import { harmableBy } from '../combat/targeting';
import { segDist } from '../core/math';
import type { Entity } from '../ecs/components';
import type { World } from '../ecs/World';
import { SpatialQuery } from '../world/SpatialQuery';
import type { StrikeResolver } from './StrikeResolver';

/**
 * GROUND HAZARDS (ecs/components.Hazard) — zones a technique leaves that keep hurting: Samon's scored X. Each tick clock a
 * hazard tests every harmable body against its strokes (capsules `width` wide through its center) and lands the OWNER's hit
 * through the one strike path (guard, posture, grudges, the rung — all as if the owner struck), at most `maxHits` per body:
 * stand in it and keep paying, step off and it's over. An owner that is gone takes its zone with it on the next tick (a hit
 * needs a striker). Expiry destroys the entity; FxSystem draws whatever is alive, so the mark and the zone are one thing.
 */
export class HazardSystem {
  constructor(
    private readonly world: World,
    private readonly strikes: StrikeResolver,
    private readonly query: SpatialQuery = new SpatialQuery(world),
  ) {}

  update(dt: number): void {
    for (const e of [...this.world.with('hazard', 'transform')]) { // snapshot: the loop destroys expired zones
      const h = e.hazard;
      h.life -= dt;
      if (h.life <= 0) {
        this.world.destroy(e);
        continue;
      }
      h.nextTick -= dt;
      if (h.nextTick > 0) continue;
      h.nextTick += h.tickEvery;
      const owner = this.world.byId(h.owner);
      if (!owner?.faction || !owner.transform) {
        this.world.destroy(e); // nobody left to strike for — the zone lapses
        continue;
      }
      this.tick(e, owner);
    }
  }

  private tick(zone: Entity, owner: Entity): void {
    const h = zone.hazard!; // callers iterate with('hazard', 'transform')
    const t = zone.transform!; // same query
    const d = Abilities.get(h.ability);
    const canHit = harmableBy(owner);
    let longest = 0;
    for (const st of h.strokes) if (st.len > longest) longest = st.len;
    const base = this.strikes.baseDamage(owner, d) * h.damageMul;
    const candidates = this.query.within(t.x, t.y, longest / 2 + h.width + 80, (o) => !!o.health && !!o.faction && !o.health.dead);
    for (const o of candidates) {
      if (!canHit(o)) continue;
      const key = String(o.id);
      if ((h.hits[key] ?? 0) >= h.maxHits) continue;
      const ot = o.transform!; // the query returns placed bodies
      if (!this.onStrokes(h, t.x, t.y, ot.x, ot.y, ot.r)) continue;
      h.hits[key] = (h.hits[key] ?? 0) + 1;
      this.strikes.hit(owner, o, d, base, 0, 0, 0, h.stun); // no shove: a zone cuts where you stand
    }
  }

  /** Is the body (ox, oy, or) on any stroke — within half the width (plus its own radius) of the segment? */
  private onStrokes(h: Entity['hazard'] & object, cx: number, cy: number, ox: number, oy: number, or: number): boolean {
    for (const st of h.strokes) {
      const dx = Math.cos(st.angle) * st.len / 2;
      const dy = Math.sin(st.angle) * st.len / 2;
      if (segDist(ox, oy, cx - dx, cy - dy, cx + dx, cy + dy) <= or + h.width / 2) return true;
    }
    return false;
  }
}
