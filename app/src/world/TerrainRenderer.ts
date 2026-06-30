import Phaser from 'phaser';
import { Depth, MAPW, MAPH, TILE, Tile, WORLD_H, WORLD_W } from '../config/constants';
import type { TileGrid } from './TileGrid';

function tileColor(t: Tile, x: number, y: number): number {
  switch (t) {
    case Tile.Water:
      return 0x16456b;
    case Tile.Sand:
      return 0xd9bd82;
    case Tile.Dock:
      return 0xa9824e;
    case Tile.Wall:
      return 0x5a4a30;
    case Tile.Floor:
      return 0xb98a5a;
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
        if (t === Tile.Water) continue;
        const c =
          t === Tile.Dock ? 0xa9824e : t === Tile.Sand ? 0xd9bd82 : t === Tile.Wall ? 0x2e2618 : t === Tile.Floor ? 0x8a6a3a : 0x3f7340;
        g.fillStyle(c, 1);
        g.fillRect(x, y, 1, 1);
      }
    }
    g.generateTexture(key, MAPW, MAPH);
    g.destroy();
    return key;
  }
}
