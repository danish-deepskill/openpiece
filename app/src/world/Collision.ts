import { TILE, WORLD_H, WORLD_W } from '../config/constants';
import type { TerrainDef } from '../defs/terrains';
import type { MoveMode } from '../ecs/components';
import { GridCollider, Q_CLEAR, Q_SOLID, type MoveCtx } from './GridCollider';
import { TileGrid } from './TileGrid';

/** WORLD-frame collision: the terrain grid plugged into the ONE GridCollider engine (deck grids plug into the
 *  same engine in world/deckCollision.ts — one sweep, per-frame oracles). This facade keeps the entity-level API
 *  (positional mode/airborne/onLedge) systems speak, adapting it to the collider's MoveCtx. */
export class Collision {
  private readonly collider: GridCollider;
  /** ONE scratch ctx reused across queries (hot loop — no per-call allocation; never retained by the collider). */
  private readonly ctx: MoveCtx = { mode: 'foot', airborne: false, onLedge: false };

  constructor(private readonly grid: TileGrid) {
    this.collider = new GridCollider(
      // bounds = the map edge: the center stays r inside even AIRBORNE (no jumping off the map)
      { cellPx: TILE, originX: 0, originY: 0, bounds: { w: WORLD_W, h: WORLD_H } },
      (cx, cy, ctx) => {
        const t = this.grid.tileAt(cx, cy); // out-of-range reads endless sea (TileGrid's rule)
        const passable = ctx.airborne ? TileGrid.airWalkable(t) : TileGrid.walkable(t, ctx.mode, ctx.onLedge);
        // terrain blocks FULL-cell today; sub-tile shapes are one TerrainDef field away (quarter-mask oracle)
        return passable ? Q_CLEAR : Q_SOLID;
      },
    );
  }

  /** Can a circle of radius r sit at (x,y) in this nav mode? `airborne` (a jumper — MOVEMENT_AIR.md) clears
   *  foot-blocked TERRAIN but still respects world bounds; `onLedge` = perched atop a low wall (walkable). */
  canOccupy(x: number, y: number, r: number, mode: MoveMode, airborne = false, onLedge = false): boolean {
    return this.collider.canOccupy(x, y, r, this.use(mode, airborne, onLedge));
  }

  /** Axis-separated move so sliding along walls feels right. Mutates {x,y}. `blocked` = an OPTIONAL moving-obstacle
   *  predicate (a ship hull) — see GridCollider.tryMove. */
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
    this.collider.tryMove(t, dx, dy, r, this.use(mode, airborne, onLedge), blocked);
  }

  /** DEPENETRATION — snap a STUCK body (spawned in a wall, landed on a tree, shoved into stone) to the nearest
   *  clear spot; no-op when already clear. Called each tick for EVERY body (the Moat) — see GridCollider.unstick. */
  unstick(t: { x: number; y: number }, r: number, mode: MoveMode, airborne = false, onLedge = false): void {
    this.collider.unstick(t, r, this.use(mode, airborne, onLedge));
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

  /** Load the scratch ctx for one query — entity-level positional args in, the collider's MoveCtx out. */
  private use(mode: MoveMode, airborne: boolean, onLedge: boolean): MoveCtx {
    this.ctx.mode = mode;
    this.ctx.airborne = airborne;
    this.ctx.onLedge = onLedge;
    return this.ctx;
  }
}
