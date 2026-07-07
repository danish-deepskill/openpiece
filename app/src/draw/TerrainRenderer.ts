import Phaser from 'phaser';
import { Depth, MAPW, MAPH, TILE, WORLD_H, WORLD_W } from '../config/constants';
import { Terrains, terrainByOrdinal } from '../defs/terrains';
import { terrainBakes } from './terrainBakes';
import type { TileGrid } from '../world/TileGrid';

/** Canopy overlay knobs (visual only — the trunk tile is the blocker; the leaves overhang walkable tiles). */
const CANOPY_ALPHA = 0.85; // 1 = solid leaf roof; lower lets units under the overhang stay dimly visible
const CANOPY_RADIUS = 1.4; // tiles of leaf spread from the trunk — ~3 tiles of visual crown per 1-tile trunk

/** Deterministic per-tile jitter in [0,1) — gives every tree a stable individual silhouette without
 *  Math.random (the same layout must bake the same pixels every session). */
function hash01(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

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

    // canopy overlay: every canopy-flagged cell's leaf crown, baked ONCE like the terrain but at Depth.Canopy —
    // above the actor y-sort band, so units on the walkable tiles around a trunk pass UNDER the leaves. The whole
    // texture gets CANOPY_ALPHA (not per-fill alpha) so overlapping crowns can't stack darker.
    const cg = scene.add.graphics();
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        if (!grid.terrainAt(x, y).canopy) continue;
        const cx = x * TILE + TILE / 2;
        const cy = y * TILE + TILE / 2;
        const R = TILE * CANOPY_RADIUS * (0.86 + 0.28 * hash01(x, y, 1)); // per-tree crown size variation
        const spin = hash01(x, y, 2) * Math.PI; // rotate each tree's lobe ring so silhouettes never repeat
        // dark under-layer: a ring of lobes + a core disc = one irregular crown silhouette
        cg.fillStyle(0x27522c, 1);
        for (let k = 0; k < 6; k++) {
          const a = spin + (k / 6) * Math.PI * 2;
          const rr = R * (0.42 + 0.16 * hash01(x, y, 3 + k));
          cg.fillCircle(cx + Math.cos(a) * R * 0.46, cy + Math.sin(a) * R * 0.42, rr);
        }
        cg.fillCircle(cx, cy, R * 0.64);
        // mid foliage clumps, nudged toward the light (NW)
        cg.fillStyle(0x3a7a40, 1);
        for (let k = 0; k < 5; k++) {
          const a = spin + (k / 5) * Math.PI * 2;
          const rr = R * (0.3 + 0.14 * hash01(x, y, 10 + k));
          cg.fillCircle(cx + Math.cos(a) * R * 0.3 - R * 0.08, cy + Math.sin(a) * R * 0.28 - R * 0.1, rr);
        }
        // sunlit tops: small bright lobes clustered on the NW shoulder
        cg.fillStyle(0x549e55, 1);
        for (let k = 0; k < 4; k++) {
          const a = -2.4 + (k - 1.5) * 0.55 + hash01(x, y, 20 + k) * 0.4;
          cg.fillCircle(cx + Math.cos(a) * R * 0.34, cy + Math.sin(a) * R * 0.32, R * (0.16 + 0.1 * hash01(x, y, 30 + k)));
        }
      }
    }
    const crt = scene.add.renderTexture(0, 0, WORLD_W, WORLD_H).setOrigin(0, 0);
    crt.setDepth(Depth.Canopy);
    crt.setAlpha(CANOPY_ALPHA);
    crt.draw(cg);
    cg.destroy();
  }

  /** Generate a 1px-per-tile minimap texture. A def WITHOUT `minimap` is transparent (the sea — deep + shallow —
   *  so the HUD panel shows through); everything else fills its def's minimap shade. */
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
    g.generateTexture(key, MAPW, MAPH);
    g.destroy();
    return key;
  }
}
