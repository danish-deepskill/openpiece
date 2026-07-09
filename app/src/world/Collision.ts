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
        // TWO-LAYER oracle: the ground (terrain ordinal) AND whatever is built on it (structure entity) must
        // both pass — one rulebook, composed here so no caller ever reads half the world.
        const t = this.grid.tileAt(cx, cy); // out-of-range reads endless sea (TileGrid's rule)
        const passable = ctx.airborne ? TileGrid.airWalkable(t) : TileGrid.walkable(t, ctx.mode, ctx.onLedge);
        if (!passable || this.grid.structures.blocks(cx, cy, ctx)) return Q_SOLID;
        // both layers block FULL-cell today; sub-tile shapes are one def field away (quarter-mask oracle)
        return Q_CLEAR;
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

  /** Is a flying SHOT (a musket ball, a thrown knife) stopped by what's at this world point? A projectile
   *  clears LOW obstacles — a stone wall, a tree trunk, the open sea — but a TALL one (a building wall/door,
   *  the windmill: `blocksAir`) stops it. This is the SAME airborne rule a jumper uses (composed over both
   *  layers), so "what a jump clears, a bullet clears" stays one truth — and it's what gives PHYSICAL COVER
   *  for free: a tall structure between shooter and target eats the round. (AI cover-SEEKING — deliberately
   *  routing behind one — is the reserved PATHFINDING/line-of-fire follow-up, not this.) */
  shotBlockedAt(x: number, y: number): boolean {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (!TileGrid.airWalkable(this.grid.tileAt(tx, ty))) return true; // tall terrain (none today, but the rule holds)
    return this.grid.structures.blocks(tx, ty, this.use('foot', true, false)); // airborne ctx: only blocksAir structures stop it
  }

  /** The stored ordinal under a world point — for callers that feed TileGrid's static rules (walkable/speedMul). */
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
