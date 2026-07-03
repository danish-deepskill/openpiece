import { MAPH, MAPW, SHALLOW_MOVE_MULT, TILE, Tile } from '../config/constants';
import type { MoveMode } from '../ecs/components';

/** Tiles that stop a foot actor (buildings + terrain barriers). Water is handled separately (per mode);
 *  a closed Door blocks collision but is overridden passable for AI planning (see `pathable`). A new
 *  blocking terrain kind joins this set — walkable/pathable then pick it up with no other change. */
const FOOT_BLOCKED: ReadonlySet<Tile> = new Set([Tile.Wall, Tile.Door, Tile.StoneWall, Tile.Tree]);

export interface MapLabel {
  x: number;
  y: number;
  text: string;
}

/** The static world as a tile array. Buildings are baked into the tiles as Wall/Floor (no separate AABBs),
 * so collision and pathfinding both read one source of truth. `labels` are world-space text markers. */
export class TileGrid {
  tiles: Tile[][] = [];
  labels: MapLabel[] = [];

  constructor(
    readonly w: number = MAPW,
    readonly h: number = MAPH,
  ) {}

  tileAt(tx: number, ty: number): Tile {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return Tile.Water;
    return this.tiles[ty][tx];
  }

  tileAtPx(px: number, py: number): Tile {
    return this.tileAt(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  /** Physical movement rule (collision). A closed Door blocks on foot until the DoorSystem opens it.
   *  On foot, ShallowWater is passable (it's simply not deep Water); boats may cross shallows too. */
  static walkable(t: Tile, mode: MoveMode): boolean {
    if (mode === 'boat') return t === Tile.Water || t === Tile.Dock || t === Tile.ShallowWater;
    return t !== Tile.Water && !FOOT_BLOCKED.has(t);
  }

  /** Terrain movement modifier (1 = normal). The hook for wadable/rough ground — data, not branching in systems. */
  static speedMul(t: Tile): number {
    return t === Tile.ShallowWater ? SHALLOW_MOVE_MULT : 1;
  }

  /** Looser rule for AI planning + line-of-sight: doorways count as passable, so enemies route and track
   *  through them (the DoorSystem opens the door as they arrive) instead of treating a house as sealed. */
  static pathable(t: Tile, mode: MoveMode): boolean {
    if (mode === 'foot' && t === Tile.Door) return true;
    return TileGrid.walkable(t, mode);
  }
}
