import Phaser from 'phaser';
import { Depth, MAPW, MAPH, TILE, Tile, WORLD_H, WORLD_W } from '../config/constants';
import type { TileGrid } from '../world/TileGrid';

function tileColor(t: Tile, x: number, y: number): number {
  switch (t) {
    case Tile.Water:
      return 0x16456b;
    case Tile.ShallowWater:
      return 0x2e7ea3; // lighter teal — reads as a shallows depth band against the deep navy
    case Tile.Sand:
      return 0xd9bd82;
    case Tile.Dock:
      return 0xa9824e;
    case Tile.Wall:
      return 0x5a4a30;
    case Tile.Floor:
      return 0xb98a5a;
    case Tile.Door:
      return 0xb98a5a; // floor-colored threshold; wood frame posts drawn in the bake pass
    default:
      return (x + y) & 1 ? 0x4f8a45 : 0x4a8240; // grass checker
  }
}

/** Bakes the static world (tiles, incl. building Wall/Floor) once into a RenderTexture + a minimap texture. */
export class TerrainRenderer {
  static bake(scene: Phaser.Scene, grid: TileGrid): void {
    const g = scene.add.graphics();
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        const t = grid.tiles[y][x];
        g.fillStyle(tileColor(t, x, y), 1);
        g.fillRect(x * TILE, y * TILE, TILE + 1, TILE + 1);
        if (t === Tile.Wall) {
          // a little dimension so walls read as solid building blocks
          g.fillStyle(0x6e5a38, 1);
          g.fillRect(x * TILE, y * TILE, TILE + 1, 4);
          g.fillStyle(0x000000, 0.25);
          g.fillRect(x * TILE, y * TILE + TILE - 4, TILE + 1, 4);
        } else if (t === Tile.Door) {
          // wood frame posts on the sides → reads as a doorway you pass through (N-S opening)
          g.fillStyle(0x6b4a2a, 1);
          g.fillRect(x * TILE, y * TILE, 5, TILE + 1);
          g.fillRect(x * TILE + TILE - 4, y * TILE, 5, TILE + 1);
        } else if (t === Tile.Sand) {
          // coastline foam: a soft light rim on the water-facing edges of the beach (baked → free at runtime)
          const wet = (nx: number, ny: number): boolean => {
            const nt = grid.tileAt(nx, ny);
            return nt === Tile.Water || nt === Tile.ShallowWater;
          };
          g.fillStyle(0xdfeee9, 0.5);
          if (wet(x - 1, y)) g.fillRect(x * TILE, y * TILE, 3, TILE + 1);
          if (wet(x + 1, y)) g.fillRect(x * TILE + TILE - 2, y * TILE, 3, TILE + 1);
          if (wet(x, y - 1)) g.fillRect(x * TILE, y * TILE, TILE + 1, 3);
          if (wet(x, y + 1)) g.fillRect(x * TILE, y * TILE + TILE - 2, TILE + 1, 3);
        }
      }
    }

    const rt = scene.add.renderTexture(0, 0, WORLD_W, WORLD_H).setOrigin(0, 0);
    rt.setDepth(Depth.Terrain);
    rt.draw(g);
    g.destroy();

    // world-space building labels (Graphics can't render text)
    for (const lab of grid.labels) {
      scene.add
        .text(lab.x, lab.y, lab.text, { fontFamily: 'Trebuchet MS', fontSize: '11px', color: '#ffffff' })
        .setOrigin(0.5, 1)
        .setAlpha(0.85)
        .setDepth(Depth.Building);
    }
  }

  /** Generate a 1px-per-tile minimap texture (water transparent so the HUD panel shows through). */
  static bakeMinimap(scene: Phaser.Scene, grid: TileGrid, key = 'minimap'): string {
    const g = scene.add.graphics();
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        const t = grid.tiles[y][x];
        if (t === Tile.Water || t === Tile.ShallowWater) continue; // sea (deep + shallows) is transparent on the minimap
        const c = // dock/sand reuse tileColor (one source); wall/floor/grass are minimap-specific shades
          t === Tile.Dock || t === Tile.Sand ? tileColor(t, 0, 0) : t === Tile.Wall ? 0x2e2618 : t === Tile.Floor || t === Tile.Door ? 0x8a6a3a : 0x3f7340;
        g.fillStyle(c, 1);
        g.fillRect(x, y, 1, 1);
      }
    }
    g.generateTexture(key, MAPW, MAPH);
    g.destroy();
    return key;
  }
}
