import type Phaser from 'phaser';
import { Tile } from '../config/constants';
import { draws, type DrawFn } from '../draw/actorDraws';
import { drawShip } from '../draw/shipDraws';
import type { World } from '../ecs/World';
import type { TileGrid } from '../world/TileGrid';

const WADE_ALPHA = 0.5; // a foot unit standing in shallow water renders partly submerged

/** The full presentation draw registry: body draw keys + the non-actor looks. `Render.draw` (a plain string
 *  on the sim component) keys into this — the sim never holds a function pointer or a Graphics object. */
const DRAWS: Record<string, DrawFn> = { ...draws, ship: drawShip };

/**
 * Syncs a Graphics per render-entity to its transform, depth-sorts by y, and runs its procedural draw.
 * OWNS the Graphics side-table — entities carry only data (DESIGN_PATTERNS §9); gfx are created lazily on
 * first sight and destroyed by the orphan sweep when an entity despawns (no sim system touches gfx lifetime).
 */
export class RenderSystem {
  private readonly gfxById = new Map<number, Phaser.GameObjects.Graphics>();
  private readonly imgById = new Map<number, Phaser.GameObjects.Image>(); // sprite-render entities (Render.sprite)
  /** Computed per-entity alpha this frame (wade/iframe-blink) — AccessorySystem reads it so hats mirror the body. */
  readonly alphaById = new Map<number, number>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
    private readonly grid: TileGrid,
  ) {}

  update(_dt: number): void {
    const now = this.scene.time.now;
    const seen = new Set<number>();
    for (const e of this.world.with('transform', 'render')) {
      seen.add(e.id);
      const t = e.transform;
      const rd = e.render;
      // wading in the shallows → partly submerged (foot units only; ships/pickups don't wade)
      // riders are pinned to the deck — they don't wade even when the SHIP crosses shallows
      let alpha = e.mover?.mode === 'foot' && !e.riding && this.grid.tileAtPx(t.x, t.y) === Tile.ShallowWater ? WADE_ALPHA : 1;
      // brief invulnerability blink, composed on top of the wade fade
      if (e.health && e.health.iframes > 0 && Math.floor(now / 50) % 2 === 0) alpha *= 0.5;
      this.alphaById.set(e.id, alpha);
      const depth = t.y + (rd.depthBias ?? 0); // top-down y-sort

      if (rd.sprite) {
        // sprite entity: render the item's own loaded texture (e.g. an accessory pickup's art) as an Image
        let img = this.imgById.get(e.id);
        if (!img) {
          img = this.scene.add.image(0, 0, rd.sprite).setOrigin(0.5, 0.5);
          this.imgById.set(e.id, img);
        }
        const dia = t.r * 2 * (rd.spriteScale ?? 1);
        img.setTexture(rd.sprite).setPosition(t.x, t.y).setRotation(rd.rotateToAngle ? t.angle : 0).setDisplaySize(dia, dia).setDepth(depth).setAlpha(alpha);
        continue;
      }

      let gfx = this.gfxById.get(e.id);
      if (!gfx) {
        gfx = this.scene.add.graphics();
        this.gfxById.set(e.id, gfx);
      }
      gfx.setPosition(t.x, t.y);
      gfx.setRotation(rd.rotateToAngle ? t.angle : 0);
      gfx.setDepth(depth);
      gfx.setAlpha(alpha);
      gfx.clear();
      DRAWS[rd.draw]?.(gfx, e);
    }
    // orphan sweep: destroy gfx/img for entities that despawned since last frame (sim only calls world.destroy)
    for (const [id, gfx] of this.gfxById) {
      if (!seen.has(id)) {
        gfx.destroy();
        this.gfxById.delete(id);
        this.alphaById.delete(id);
      }
    }
    for (const [id, img] of this.imgById) {
      if (!seen.has(id)) {
        img.destroy();
        this.imgById.delete(id);
        this.alphaById.delete(id);
      }
    }
  }
}
