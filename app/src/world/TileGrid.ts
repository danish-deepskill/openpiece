import { MAPH, MAPW, TILE, Tile } from '../config/constants';
import type { MoveMode } from '../ecs/components';

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

  static walkable(t: Tile, mode: MoveMode): boolean {
    if (mode === 'boat') return t === Tile.Water || t === Tile.Dock;
    return t !== Tile.Water && t !== Tile.Wall; // foot: anything but sea and walls
  }
}
