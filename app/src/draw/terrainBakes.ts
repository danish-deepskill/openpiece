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
  // coastline foam: a soft light rim on the water-facing edges of the beach (neighbor-aware, baked → free)
  // (wall/door/stoneWall/tree painters moved to structureDraws.ts — built things are structures now)
  sandFoam: (g, grid, x, y) => {
    const wet = (nx: number, ny: number): boolean => grid.terrainAt(nx, ny).water !== undefined;
    g.fillStyle(0xdfeee9, 0.5);
    if (wet(x - 1, y)) g.fillRect(x * TILE, y * TILE, 3, TILE + 1);
    if (wet(x + 1, y)) g.fillRect(x * TILE + TILE - 2, y * TILE, 3, TILE + 1);
    if (wet(x, y - 1)) g.fillRect(x * TILE, y * TILE, TILE + 1, 3);
    if (wet(x, y + 1)) g.fillRect(x * TILE, y * TILE + TILE - 2, TILE + 1, 3);
  },
};
