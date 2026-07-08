import Phaser from 'phaser';
import { Depth, MAPW, MAPH, TILE, WORLD_H, WORLD_W } from '../config/constants';
import { Structures } from '../defs/structures';
import { Terrains, terrainByOrdinal } from '../defs/terrains';
import { terrainBakes } from './terrainBakes';
import type { TileGrid } from '../world/TileGrid';

/** A cell's base fill — the def's color, alternating with `checker` on (x+y) parity where present. */
function baseColor(ordinal: number, x: number, y: number): number {
  const d = terrainByOrdinal(ordinal);
  return d.checker !== undefined && (x + y) % 2 === 0 ? d.checker : d.color;
}

/** Bakes the static world once into a RenderTexture + a minimap texture — entirely def-driven: colors and bake
 *  keys come from TerrainDef rows (defs/terrains.ts); the bake painters are strategy rows in terrainBakes.ts. */
export class TerrainRenderer {
  static bake(scene: Phaser.Scene, grid: TileGrid): void {
    // fail LOUD before painting anything: every def's bake key must resolve to a painter (the terrain twin of
    // the accessory proc-draw boot sweep) — a typo'd key must never ship as a silently-plain tile.
    for (const d of Terrains.all()) {
      if (d.bake && !terrainBakes[d.bake]) throw new Error(`TerrainRenderer: def '${d.id}' names unknown bake '${d.bake}'`);
    }

    const g = scene.add.graphics();
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        const t = grid.tiles[y][x];
        g.fillStyle(baseColor(t, x, y), 1);
        g.fillRect(x * TILE, y * TILE, TILE + 1, TILE + 1);
        const bake = terrainByOrdinal(t).bake;
        if (bake) terrainBakes[bake]!(g, grid, x, y); // key existence swept above — a miss can't reach here
      }
    }

    const rt = scene.add.renderTexture(0, 0, WORLD_W, WORLD_H).setOrigin(0, 0);
    rt.setDepth(Depth.Terrain);
    rt.draw(g);
    g.destroy();
  }

  /** Generate a 1px-per-tile minimap texture — BOTH layers: terrain shades under structure footprints (call
   *  AFTER the level's structures are placed). A def WITHOUT `minimap` is transparent (the sea — deep +
   *  shallow — so the HUD panel shows through); everything else fills its def's minimap shade. */
  static bakeMinimap(scene: Phaser.Scene, grid: TileGrid, key = 'minimap'): string {
    const g = scene.add.graphics();
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        const c = terrainByOrdinal(grid.tiles[y][x]).minimap;
        if (c === undefined) continue;
        g.fillStyle(c, 1);
        g.fillRect(x, y, 1, 1);
      }
    }
    for (const e of grid.structures.all()) {
      const s = e.structure;
      const d = Structures.get(s.def);
      if (d.minimap === undefined) continue;
      g.fillStyle(d.minimap, 1);
      g.fillRect(s.tx, s.ty, d.size.w, d.size.h);
    }
    g.generateTexture(key, MAPW, MAPH);
    g.destroy();
    return key;
  }
}
