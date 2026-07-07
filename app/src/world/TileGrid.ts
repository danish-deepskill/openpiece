import { MAPH, MAPW, SAND_MOVE_MULT, SHALLOW_MOVE_MULT, SWIM_MOVE_MULT, TILE, Tile } from '../config/constants';
import type { MoveMode } from '../ecs/components';

/** Tiles that stop a foot actor (buildings + terrain barriers). Water is handled separately (per mode);
 *  a closed Door blocks collision but is overridden passable for AI planning (see `pathable`). A new
 *  blocking terrain kind joins this set — walkable/pathable then pick it up with no other change. */
const FOOT_BLOCKED: ReadonlySet<Tile> = new Set([Tile.Wall, Tile.Door, Tile.StoneWall, Tile.Tree]);

/** Tiles that stop even an AIRBORNE actor (a jumper) — the TALL obstacles: BUILDING structure (Wall + Door)
 *  has a roof, so you can't hop onto/through a house. A jump CLEARS everything else that blocks on foot — deep
 *  Water (jump the channel), a freestanding StoneWall, a Tree (vault the low grove). Data, not a branch: mark a
 *  new too-tall-to-jump terrain here and `airWalkable` picks it up. (docs/design/MOVEMENT_AIR.md) */
const BLOCKS_AIR: ReadonlySet<Tile> = new Set([Tile.Wall, Tile.Door]);

/** The static world as a tile array. Buildings are baked into the tiles as Wall/Floor (no separate AABBs),
 * so collision and pathfinding both read one source of truth. */
export class TileGrid {
  tiles: Tile[][] = [];

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

  /** Physical movement rule (collision). BOAT travels water/docks/shallows. FOOT and SWIM share ONE rule: deep
   *  Water, shallows, and land are ALL passable — you can wade into the sea (→ become a swimmer) and climb back
   *  out freely; only solid terrain (walls/trees) blocks. Deliberately NOT "deep water is a wall on foot": the
   *  MODE (foot vs swim) is a LABEL derived from where you ARE (MovementSystem), not a collision cage — caging
   *  foot out of water then flipping the mode early to sneak past the cage was the root of the swim-boundary bugs
   *  (early opacity/speed, seam stalls, corner sticks). Now collision is mode-agnostic; the mode just follows your
   *  position. (AI stays out of the sea via `pathable`, which still walls Water for foot — planning, not collision.) */
  static walkable(t: Tile, mode: MoveMode): boolean {
    if (mode === 'boat') return t === Tile.Water || t === Tile.Dock || t === Tile.ShallowWater;
    return !FOOT_BLOCKED.has(t); // foot & swim: water + land passable, walls/trees block
  }

  /** Physical movement rule for an AIRBORNE actor (a jumper — docs/design/MOVEMENT_AIR.md): clears everything a
   *  foot actor can't (deep water, stone walls, trees) EXCEPT the too-tall BLOCKS_AIR structures (building
   *  Wall/Door). So you can jump a channel or vault a low barrier, but not hop onto/through a house. */
  static airWalkable(t: Tile): boolean {
    return !BLOCKS_AIR.has(t);
  }

  /** Terrain movement modifier (1 = normal). The hook for wadable/rough ground — data, not branching in systems. */
  static speedMul(t: Tile): number {
    if (t === Tile.ShallowWater) return SHALLOW_MOVE_MULT;
    if (t === Tile.Sand) return SAND_MOVE_MULT; // sand/desert = heavier going (0.75)
    return 1;
  }

  /** Move modifier while SWIMMING deep water — slower than a wade (you're fully in the sea, not walking). */
  static swimSpeedMul(t: Tile): number {
    return t === Tile.Water ? SWIM_MOVE_MULT : SHALLOW_MOVE_MULT; // deep = slow swim; shallows = the wade pace
  }

  /** Looser rule for AI planning + line-of-sight: doorways count as passable, so enemies route and track
   *  through them (the DoorSystem opens the door as they arrive) instead of treating a house as sealed. */
  static pathable(t: Tile, mode: MoveMode): boolean {
    if (mode === 'foot') {
      if (t === Tile.Door) return true; // AI routes through doors (DoorSystem opens them on arrival)
      if (t === Tile.Water) return false; // …but NOT into the sea — collision now lets foot enter water (→ swim),
      //                                     yet AI planning must keep land units ashore (they have no swim logic)
    }
    return TileGrid.walkable(t, mode);
  }
}
