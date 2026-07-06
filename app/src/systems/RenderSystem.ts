import type Phaser from 'phaser';
import { Tile } from '../config/constants';
import { draws, type DrawFn } from '../draw/actorDraws';
import { drawShip } from '../draw/shipDraws';
import type { Entity } from '../ecs/components';
import type { World } from '../ecs/World';
import type { TileGrid } from '../world/TileGrid';

const WADE_ALPHA = 0.5; // a foot unit standing in shallow water renders partly submerged

const GOD_AURA_COLOR = 0xffe66e; // warm gold — reads as "divine/charged", distinct from the green HP / blue stamina bars

/** Paint the god-mode aura into an actor's Graphics (LOCAL space, centered on the body). A slow-breathing
 *  golden halo: a soft outer glow + a crisper inner ring, both pulsing on a sine of wall-clock `now` so it
 *  reads as ACTIVE energy, not a static decal. Presentation-only (RenderSystem draws it before the body). */
function drawGodAura(g: Phaser.GameObjects.Graphics, r: number, now: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(now / 260); // 0..1, ~1.6s breath
  const glowR = r * (1.5 + 0.25 * pulse); // soft halo swells with the breath
  g.fillStyle(GOD_AURA_COLOR, 0.1 + 0.12 * pulse);
  g.fillCircle(0, 0, glowR);
  g.lineStyle(2, GOD_AURA_COLOR, 0.5 + 0.4 * pulse); // bright ring rides the same beat
  g.strokeCircle(0, 0, r * 1.35);
}

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

  /** The y a unit's layers (body, accessories, weapon) sort by. Normally its own transform.y — but a RIDER
   *  sorts by its SHIP's y (+2, just above the deck), so ALL its layers draw above the hull regardless of the
   *  rider's seat position (else an aft-seated rider's hat/weapon drops under the hull as the boat turns). The
   *  ONE home for this rule; every render layer reads it so they can never disagree. */
  sortY(e: Entity): number {
    if (e.riding) {
      const ship = this.world.byId(e.riding.shipId);
      if (ship?.transform) return ship.transform.y + 2;
    }
    return e.transform!.y;
  }

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
      const depth = this.sortY(e) + (rd.depthBias ?? 0); // top-down y-sort (rider layers sort by the ship — sortY)

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
      // GOD-MODE AURA (debug tell): a pulsing golden glow UNDER the body so you can SEE the tag is live. Purely
      // presentational — reads the same 'state.godMode' tag the sim gates on, so it follows possession (the
      // Moat: glow whoever you're driving). Drawn FIRST → the body paints over its center. Circle is
      // rotation-invariant, so gfx's aim-rotation doesn't skew it.
      if (e.tags?.has('state.godMode')) drawGodAura(gfx, t.r, now);
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
