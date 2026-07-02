import Phaser from 'phaser';
import { Depth, TILE, Tile } from '../config/constants';
import type { TileGrid } from '../world/TileGrid';

const CREST = 0xffffff; // wave-crest colour
const CREST_ALPHA = 0.05; // very faint — a shimmer, not a glare (grand_voyage used 0.04)
const BOB = 6; // px the crest line drifts vertically within its tile
const PHASE_X = 0.6; // spatial phase per tile in x …
const PHASE_Y = 0.4; // … and y — together they make the crests travel diagonally
const SPEED = 1.4; // time phase (rad/s)

/**
 * Animated sea in the grand_voyage style: faint white wave-crest lines that ripple across the deep water. Redrawn
 * every frame, but VIEWPORT-CULLED to the visible water tiles only (~a couple hundred rects at 2× zoom) — so it's
 * the stylised look without the "redraw the whole map each frame" lag trap. The water colour stays baked flat
 * (deep navy + teal shallows); this crest overlay is the only moving layer, and it ripples across both. Coastline
 * foam remains baked.
 */
export class SeaRenderer {
  private readonly g: Phaser.GameObjects.Graphics;
  private t = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly grid: TileGrid,
  ) {
    this.g = scene.add.graphics().setDepth(Depth.Sea);
  }

  update(dt: number): void {
    this.t += dt;
    const g = this.g;
    g.clear();
    const view = this.scene.cameras.main.worldView; // visible world rect — only draw crests inside it
    const x0 = Math.max(0, Math.floor(view.x / TILE));
    const y0 = Math.max(0, Math.floor(view.y / TILE));
    const x1 = Math.min(this.grid.w, Math.ceil((view.right) / TILE));
    const y1 = Math.min(this.grid.h, Math.ceil((view.bottom) / TILE));
    g.fillStyle(CREST, CREST_ALPHA);
    for (let ty = y0; ty < y1; ty++) {
      const row = this.grid.tiles[ty];
      for (let tx = x0; tx < x1; tx++) {
        const t = row[tx];
        if (t !== Tile.Water && t !== Tile.ShallowWater) continue; // both deep + shallow water ripple
        const ph = Math.sin(tx * PHASE_X + ty * PHASE_Y + this.t * SPEED) * 0.5 + 0.5;
        g.fillRect(tx * TILE, ty * TILE + ph * BOB, TILE + 1, 3);
      }
    }
  }
}
