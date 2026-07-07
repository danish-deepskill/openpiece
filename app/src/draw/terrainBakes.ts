import type Phaser from 'phaser';
import { TILE } from '../config/constants';
import type { TileGrid } from '../world/TileGrid';

/**
 * Per-terrain BAKED-DETAIL painters — the strategy rows behind `TerrainDef.bake` (defs/terrains.ts). Function-
 * bearing rows live beside their engine (content-is-data canon, like accessoryDraws/MOTIONS): the def carries the
 * KEY (data, serializable); the pixels live here. Each fn paints ONE tile's extra detail over its base color
 * during TerrainRenderer.bake — pure presentation, baked once, free at runtime. TerrainRenderer throws at bake on
 * an unknown key, so a def typo fails at boot, never as a silently-plain tile.
 */
export type TerrainBakeFn = (g: Phaser.GameObjects.Graphics, grid: TileGrid, x: number, y: number) => void;

export const terrainBakes: Record<string, TerrainBakeFn> = {
  // building wall: a lit top edge + dark base so the block reads solid/3D
  wall: (g, _grid, x, y) => {
    g.fillStyle(0x6e5a38, 1);
    g.fillRect(x * TILE, y * TILE, TILE + 1, 4);
    g.fillStyle(0x000000, 0.25);
    g.fillRect(x * TILE, y * TILE + TILE - 4, TILE + 1, 4);
  },
  // doorway: wood frame posts on the sides → reads as an N-S opening you pass through
  door: (g, _grid, x, y) => {
    g.fillStyle(0x6b4a2a, 1);
    g.fillRect(x * TILE, y * TILE, 5, TILE + 1);
    g.fillRect(x * TILE + TILE - 4, y * TILE, 5, TILE + 1);
  },
  // freestanding stone: bright top ridge + dark base + a mortar seam — raised rock, distinct from building wall
  stoneWall: (g, _grid, x, y) => {
    g.fillStyle(0xa6a29a, 1);
    g.fillRect(x * TILE, y * TILE, TILE + 1, 5);
    g.fillStyle(0x000000, 0.28);
    g.fillRect(x * TILE, y * TILE + TILE - 5, TILE + 1, 5);
    g.fillStyle(0x6d6a63, 1);
    g.fillRect(x * TILE, y * TILE + TILE / 2 - 1, TILE + 1, 2);
  },
  // GROUND half of a tree only: root shadow + trunk on the 1-tile blocker (the crown is the separate canopy
  // overlay ABOVE actors — TerrainRenderer's canopy pass, keyed on TerrainDef.canopy — so units walk UNDER it)
  tree: (g, _grid, x, y) => {
    const cx = x * TILE + TILE / 2;
    const cy = y * TILE + TILE / 2;
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(cx + 3, cy + 8, TILE * 0.9, TILE * 0.42); // ground shadow, offset with the light
    g.fillStyle(0x4a3018, 1);
    g.fillEllipse(cx, cy + 8, TILE * 0.5, 9); // root flare
    g.fillRect(cx - 5, cy - 12, 11, 22); // trunk column
    g.fillStyle(0x6b4a2c, 1);
    g.fillRect(cx - 5, cy - 12, 4, 22); // lit bark edge (sun from the NW)
  },
  // coastline foam: a soft light rim on the water-facing edges of the beach (neighbor-aware, baked → free)
  sandFoam: (g, grid, x, y) => {
    const wet = (nx: number, ny: number): boolean => grid.terrainAt(nx, ny).water !== undefined;
    g.fillStyle(0xdfeee9, 0.5);
    if (wet(x - 1, y)) g.fillRect(x * TILE, y * TILE, 3, TILE + 1);
    if (wet(x + 1, y)) g.fillRect(x * TILE + TILE - 2, y * TILE, 3, TILE + 1);
    if (wet(x, y - 1)) g.fillRect(x * TILE, y * TILE, TILE + 1, 3);
    if (wet(x, y + 1)) g.fillRect(x * TILE, y * TILE + TILE - 2, TILE + 1, 3);
  },
};
