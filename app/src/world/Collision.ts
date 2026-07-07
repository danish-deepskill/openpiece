import { TILE, Tile, WORLD_H, WORLD_W } from '../config/constants';
import type { MoveMode } from '../ecs/components';
import { TileGrid } from './TileGrid';

/** Circle-vs-tile movement resolution. Walls are tiles now, so this is the single collision rule. */
export class Collision {
  constructor(private readonly grid: TileGrid) {}

  /** Can a circle of radius r sit at (x,y) in this nav mode? EXACT circle-vs-AABB (not point sampling): for every
   *  BLOCKING tile the circle's bounding box overlaps, the closest point on that tile's box to the circle center
   *  must be ≥ r away — so a wall touching the circle at ANY angle (including a diagonal CORNER) blocks it, with no
   *  sample-point gaps to tune. `airborne` (a jumper — MOVEMENT_AIR.md) clears foot-blocked TERRAIN but still
   *  respects world bounds (no leaving the map). */
  canOccupy(x: number, y: number, r: number, mode: MoveMode, airborne = false): boolean {
    if (x < r || y < r || x > WORLD_W - r || y > WORLD_H - r) return false; // world bounds (center kept r off the edge)
    const passable = (t: Tile): boolean => (airborne ? TileGrid.airWalkable(t) : TileGrid.walkable(t, mode));
    // only the tiles the circle's bounding box could touch — a small window, not the whole grid
    const tx0 = Math.floor((x - r) / TILE);
    const tx1 = Math.floor((x + r) / TILE);
    const ty0 = Math.floor((y - r) / TILE);
    const ty1 = Math.floor((y + r) / TILE);
    const r2 = r * r;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (passable(this.grid.tileAt(tx, ty))) continue; // only blocking tiles matter
        // closest point on this tile's box [tx·TILE,(tx+1)·TILE) to the circle center, then compare its distance
        const nx = Math.max(tx * TILE, Math.min(x, (tx + 1) * TILE));
        const ny = Math.max(ty * TILE, Math.min(y, (ty + 1) * TILE));
        const dx = x - nx;
        const dy = y - ny;
        if (dx * dx + dy * dy < r2) return false; // the circle overlaps this wall → can't sit here
      }
    }
    return true;
  }

  /** Axis-separated move so sliding along walls feels right. Mutates {x,y}. */
  tryMove(t: { x: number; y: number }, dx: number, dy: number, r: number, mode: MoveMode, airborne = false): void {
    if (dx !== 0 && this.canOccupy(t.x + dx, t.y, r, mode, airborne)) t.x += dx;
    if (dy !== 0 && this.canOccupy(t.x, t.y + dy, r, mode, airborne)) t.y += dy;
  }

  /** DEPENETRATION — if a body is STUCK inside solid (spawned in a wall, landed on a tree, shoved into stone),
   *  SNAP it to the nearest clear spot. A ring search outward from the current center for the closest occupiable
   *  position; mutates {x,y}. No-op when already clear (the common case — one cheap canOccupy). Called each tick
   *  in the movement step, for EVERY body (the Moat): covers spawn, jump-land, knockback, future teleports. */
  unstick(t: { x: number; y: number }, r: number, mode: MoveMode, airborne = false): void {
    if (this.canOccupy(t.x, t.y, r, mode, airborne)) return; // already clear — nothing to do
    const step = TILE * 0.5; // search granularity (half a tile — fine enough vs. body/tile sizes)
    for (let ring = 1; ring <= 12; ring++) {
      const rad = ring * step;
      // sample 8 directions at this radius, nearest ring first → the closest clear spot wins
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const cx = t.x + Math.cos(a) * rad;
        const cy = t.y + Math.sin(a) * rad;
        if (this.canOccupy(cx, cy, r, mode, airborne)) {
          t.x = cx;
          t.y = cy;
          return;
        }
      }
    }
    // no clear spot within the search radius (should never happen in an open world) — leave it put
  }

  /** Movement multiplier for the terrain under (x,y) — e.g. 0.5 while wading shallows. */
  terrainSpeed(x: number, y: number): number {
    return TileGrid.speedMul(this.grid.tileAtPx(x, y));
  }

  /** Move multiplier while SWIMMING at (x,y) — slower than a wade in deep water. */
  swimSpeed(x: number, y: number): number {
    return TileGrid.swimSpeedMul(this.grid.tileAtPx(x, y));
  }

  /** The tile under a world point — for the swim/foot transition to read the terrain the actor is over. */
  tileAtPx(x: number, y: number): Tile {
    return this.grid.tileAtPx(x, y);
  }

  /** The tile at a circle's LEADING EDGE along its velocity — used by the foot⇄swim transition to see the
   *  terrain it's about to enter (a step ahead of the center), so the mode flips AS it crosses the shoreline. */
  tileAheadPx(x: number, y: number, vx: number, vy: number, r: number): Tile {
    const len = Math.hypot(vx, vy) || 1;
    return this.grid.tileAtPx(x + (vx / len) * r, y + (vy / len) * r);
  }
}
