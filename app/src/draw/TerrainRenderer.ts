import Phaser from 'phaser';
import { Depth, MAPW, MAPH, TILE, Tile, WORLD_H, WORLD_W } from '../config/constants';
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
    case Tile.StoneWall:
      return 0x8a8781; // weathered gray stone (top-lit + shadowed in the bake pass)
    case Tile.Tree:
      return (x + y) & 1 ? 0x4f8a45 : 0x4a8240; // grass under the canopy (trunk + leaves drawn in the bake pass)
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
        } else if (t === Tile.StoneWall) {
          // stone dimension: bright top ridge + dark base + a mortar seam, so the ring reads as raised rock
          g.fillStyle(0xa6a29a, 1);
          g.fillRect(x * TILE, y * TILE, TILE + 1, 5);
          g.fillStyle(0x000000, 0.28);
          g.fillRect(x * TILE, y * TILE + TILE - 5, TILE + 1, 5);
          g.fillStyle(0x6d6a63, 1);
          g.fillRect(x * TILE, y * TILE + TILE / 2 - 1, TILE + 1, 2);
        } else if (t === Tile.Tree) {
          // GROUND half of a tree only: root shadow + trunk on the 1-tile blocker. The crown is a separate
          // overlay ABOVE actors (see the canopy pass below) so units walk UNDER the leaves.
          const cx = x * TILE + TILE / 2;
          const cy = y * TILE + TILE / 2;
          g.fillStyle(0x000000, 0.2);
          g.fillEllipse(cx + 3, cy + 8, TILE * 0.9, TILE * 0.42); // ground shadow, offset with the light
          g.fillStyle(0x4a3018, 1);
          g.fillEllipse(cx, cy + 8, TILE * 0.5, 9); // root flare
          g.fillRect(cx - 5, cy - 12, 11, 22); // trunk column
          g.fillStyle(0x6b4a2c, 1);
          g.fillRect(cx - 5, cy - 12, 4, 22); // lit bark edge (sun from the NW)
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

    // canopy overlay: every tree's leaf crown, baked ONCE like the terrain but at Depth.Canopy — above the
    // actor y-sort band, so units on the walkable tiles around a trunk pass UNDER the leaves. The whole
    // texture gets CANOPY_ALPHA (not per-fill alpha) so overlapping crowns can't stack darker.
    const cg = scene.add.graphics();
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        if (grid.tiles[y][x] !== Tile.Tree) continue;
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
          t === Tile.Dock || t === Tile.Sand ? tileColor(t, 0, 0)
          : t === Tile.Wall ? 0x2e2618
          : t === Tile.StoneWall ? 0x6b6b6b
          : t === Tile.Tree ? 0x2f5a2f
          : t === Tile.Floor || t === Tile.Door ? 0x8a6a3a
          : 0x3f7340;
        g.fillStyle(c, 1);
        g.fillRect(x, y, 1, 1);
      }
    }
    g.generateTexture(key, MAPW, MAPH);
    g.destroy();
    return key;
  }
}
