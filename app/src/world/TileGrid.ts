import { MAPH, MAPW, SHALLOW_MOVE_MULT, SWIM_MOVE_MULT, TILE } from '../config/constants';
import { TERRAIN, terrainByOrdinal, type TerrainDef } from '../defs/terrains';
import type { MoveMode } from '../ecs/components';
import { StructureIndex } from './StructureIndex';

/**
 * The static world as TWO layers sharing one grid: terrain ORDINALS (what the ground is — behavior lives on
 * TerrainDef rows, not in switch statements here) plus the STRUCTURE occupancy index (what's built on it —
 * wall/door/tree ENTITIES, world/StructureIndex.ts). Collision, pathfinding, and rendering each compose the
 * two layers with one rulebook; the grid owning its own index is what makes every frame (world, deck, lower
 * deck later) a self-contained level. Terrain storage is plain small ints, Uint8Array/chunk-ready.
 */
export class TileGrid {
  tiles: number[][] = [];
  /** This grid's structure layer — populate via placeStructure (entities + cells stay in lockstep). */
  readonly structures: StructureIndex;

  constructor(
    readonly w: number = MAPW,
    readonly h: number = MAPH,
  ) {
    this.structures = new StructureIndex(w, h);
  }

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

  /** Terrain movement multiplier (1 = normal) — the def's own knob (shallows wade, sand trudges). */
  static speedMul(ordinal: number): number {
    return terrainByOrdinal(ordinal).speedMul;
  }

  /** Move multiplier while SWIMMING — deep water swims (SWIM_MOVE_MULT); anything else at the wade pace. */
  static swimSpeedMul(ordinal: number): number {
    return terrainByOrdinal(ordinal).water === 'deep' ? SWIM_MOVE_MULT : SHALLOW_MOVE_MULT;
  }

  /** Looser TERRAIN rule for AI PLANNING + line-of-sight: deep water counts as blocked for foot (a land brain
   *  has no swim logic) — a def flag, not a tile branch. Doors are STRUCTURES now — their plan-through rule
   *  lives on StructureIndex.pathable, composed with this by the Pathfinder. */
  static pathable(ordinal: number, mode: MoveMode): boolean {
    const d = terrainByOrdinal(ordinal);
    if (mode === 'foot' && d.aiFootAvoid) return false;
    return TileGrid.walkable(ordinal, mode);
  }
}
