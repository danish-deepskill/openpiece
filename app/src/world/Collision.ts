import { TILE, WORLD_H, WORLD_W } from '../config/constants';
import type { TerrainDef } from '../defs/terrains';
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
  canOccupy(x: number, y: number, r: number, mode: MoveMode, airborne = false, onLedge = false): boolean {
    if (x < r || y < r || x > WORLD_W - r || y > WORLD_H - r) return false; // world bounds (center kept r off the edge)
    const passable = (t: number): boolean => (airborne ? TileGrid.airWalkable(t) : TileGrid.walkable(t, mode, onLedge));
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

  /** Axis-separated move so sliding along walls feels right. Mutates {x,y}. `onLedge` = perched atop a low wall,
   *  so low-wall tiles are walkable (you balance across them). `blocked` = an OPTIONAL extra obstacle predicate
   *  (a MOVING one the static grid can't know — a ship hull): a step is taken only if the tile grid AND `blocked`
   *  both allow the target. Takes (x, y, r) so callers can share ONE persistent closure across every body size
   *  (no per-entity allocation). Keeps Collision pure geometry — the caller supplies the ship check. */
  tryMove(
    t: { x: number; y: number },
    dx: number,
    dy: number,
    r: number,
    mode: MoveMode,
    airborne = false,
    onLedge = false,
    blocked?: (x: number, y: number, r: number) => boolean,
  ): void {
    if (dx !== 0 && this.canOccupy(t.x + dx, t.y, r, mode, airborne, onLedge) && !blocked?.(t.x + dx, t.y, r)) t.x += dx;
    if (dy !== 0 && this.canOccupy(t.x, t.y + dy, r, mode, airborne, onLedge) && !blocked?.(t.x, t.y + dy, r)) t.y += dy;
  }

  /** DEPENETRATION — if a body is STUCK inside solid (spawned in a wall, landed on a tree, shoved into stone),
   *  SNAP it to the nearest clear spot. A ring search outward from the current center for the closest occupiable
   *  position; mutates {x,y}. No-op when already clear (the common case — one cheap canOccupy). Called each tick
   *  in the movement step, for EVERY body (the Moat): covers spawn, jump-land, knockback, future teleports. */
  unstick(t: { x: number; y: number }, r: number, mode: MoveMode, airborne = false, onLedge = false): void {
    if (this.canOccupy(t.x, t.y, r, mode, airborne, onLedge)) return; // already clear (or validly perched) — nothing to do
    const step = TILE * 0.5; // search granularity (half a tile — fine enough vs. body/tile sizes)
    for (let ring = 1; ring <= 12; ring++) {
      const rad = ring * step;
      // sample 8 directions at this radius, nearest ring first → the closest clear spot wins
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const cx = t.x + Math.cos(a) * rad;
        const cy = t.y + Math.sin(a) * rad;
        if (this.canOccupy(cx, cy, r, mode, airborne, onLedge)) {
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

  /** The stored ordinal under a world point — for callers that feed TileGrid's static rules (isLowWall etc.). */
  tileAtPx(x: number, y: number): number {
    return this.grid.tileAtPx(x, y);
  }

  /** The terrain DEF under a world point — the decoded row for semantic reads (`.water === 'deep'`). */
  terrainAtPx(x: number, y: number): TerrainDef {
    return this.grid.terrainAtPx(x, y);
  }
}
