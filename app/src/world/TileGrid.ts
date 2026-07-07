import { MAPH, MAPW, SHALLOW_MOVE_MULT, SWIM_MOVE_MULT, TILE } from '../config/constants';
import { TERRAIN, terrainByOrdinal, type TerrainDef } from '../defs/terrains';
import type { MoveMode } from '../ecs/components';

/**
 * The static world as a grid of terrain ORDINALS (see defs/terrains.ts — behavior lives on TerrainDef rows, not
 * in switch statements here). Buildings are still baked into the cells as wall/floor/door terrain (no separate
 * structure layer YET — that's the next slice); collision, pathfinding, and rendering all read one source of
 * truth. Storage is plain small ints, Uint8Array/chunk-ready for the streamed-world future.
 */
export class TileGrid {
  tiles: number[][] = [];

  constructor(
    readonly w: number = MAPW,
    readonly h: number = MAPH,
  ) {}

  /** The stored ordinal at a cell; out-of-bounds reads as open sea (the world is an island in endless water). */
  tileAt(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return TERRAIN.water;
    return this.tiles[ty][tx];
  }

  tileAtPx(px: number, py: number): number {
    return this.tileAt(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  /** The terrain DEF at a cell — the decoded row systems ask semantic questions of (`.water === 'deep'`). */
  terrainAt(tx: number, ty: number): TerrainDef {
    return terrainByOrdinal(this.tileAt(tx, ty));
  }

  terrainAtPx(px: number, py: number): TerrainDef {
    return terrainByOrdinal(this.tileAtPx(px, py));
  }

  /** Physical movement rule (collision). BOAT travels boatPassable cells. FOOT and SWIM share ONE rule: only
   *  blocksFoot terrain stops them — deep water is deliberately PASSABLE on foot (the mover's mode relabels to
   *  swim from position, movement-frames truthful-mode rule; caging foot out of water was the old seam-bug
   *  family). `onLedge` = perched atop a LOW wall you jumped onto → that low wall is walkable (balance across it). */
  static walkable(ordinal: number, mode: MoveMode, onLedge = false): boolean {
    const d = terrainByOrdinal(ordinal);
    if (mode === 'boat') return d.boatPassable;
    if (onLedge && d.blocksFoot && !d.blocksAir) return true; // perched on the low wall — standable
    return !d.blocksFoot;
  }

  /** Physical rule for an AIRBORNE actor (a jumper — docs/design/MOVEMENT_AIR.md): clears everything a foot
   *  actor can't EXCEPT tall (blocksAir) structure — jump a channel or a stone wall, not through a house. */
  static airWalkable(ordinal: number): boolean {
    return !terrainByOrdinal(ordinal).blocksAir;
  }

  /** A LOW WALL — foot-blocked but not air-blocked: jump over it, or land on top and perch (mover.onLedge).
   *  Derived from the def's two blocking fields, so a new blocking terrain is automatically low or tall. */
  static isLowWall(ordinal: number): boolean {
    const d = terrainByOrdinal(ordinal);
    return d.blocksFoot && !d.blocksAir;
  }

  /** Terrain movement multiplier (1 = normal) — the def's own knob (shallows wade, sand trudges). */
  static speedMul(ordinal: number): number {
    return terrainByOrdinal(ordinal).speedMul;
  }

  /** Move multiplier while SWIMMING — deep water swims (SWIM_MOVE_MULT); anything else at the wade pace. */
  static swimSpeedMul(ordinal: number): number {
    return terrainByOrdinal(ordinal).water === 'deep' ? SWIM_MOVE_MULT : SHALLOW_MOVE_MULT;
  }

  /** Looser rule for AI PLANNING + line-of-sight: doors count as passable (DoorSystem opens them on arrival) and
   *  deep water counts as blocked for foot (a land brain has no swim logic) — both def flags, not tile branches. */
  static pathable(ordinal: number, mode: MoveMode): boolean {
    const d = terrainByOrdinal(ordinal);
    if (mode === 'foot') {
      if (d.door) return true;
      if (d.aiFootAvoid) return false;
    }
    return TileGrid.walkable(ordinal, mode);
  }
}
