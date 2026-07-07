import Phaser from 'phaser';
import { Weapons } from '../defs/layers';
import { weaponAnchor } from '../draw/actorDraws';
import { rollProgress } from '../draw/rollAnim';
import type { World } from '../ecs/World';
import type { RenderSystem } from './RenderSystem';

/**
 * Renders sprite-visual weapons (WeaponDef.visual.kind === 'sprite') as pooled Images pinned to the SAME
 * weaponAnchor that drawActor uses for procedural weapons — one grip authority, two substrates, so the
 * drawn grip can never drift from the hitbox rig. Art convention: authored pointing UP with the canvas
 * BOTTOM at the grip point; drawn height maps to visual.length (SIM data — reach and hit span), so the
 * sprite's steel can never out-draw or under-draw what actually hits. Depth sits just under the owner's
 * body (hilt under the fists/torso, blade reading past the silhouette — same layering as procedural).
 */
export class WeaponSpriteSystem {
  private readonly imgs = new Map<number, Phaser.GameObjects.Image>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
    private readonly renderSys: RenderSystem, // weapons mirror the body's computed alpha (wade/blink)
  ) {}

  update(): void {
    const seen = new Set<number>();
    for (const e of this.world.with('transform', 'equipment', 'render')) {
      const wid = e.equipment!.weapon;
      const v = wid ? Weapons.get(wid).visual : undefined;
      if (!wid || v?.kind !== 'sprite') continue;
      seen.add(e.id);
      let img = this.imgs.get(e.id);
      if (!img) {
        img = this.scene.add.image(0, 0, wid); // origin (the grip point) is set per frame from the def's rig
        this.imgs.set(e.id, img);
      }
      if (rollProgress(e) !== null) {
        img.setVisible(false); // mid-roll: the figure is a tucked BALL (drawRollBall) — the weapon is tucked in, hidden
        continue;
      }
      const a = weaponAnchor(e);
      if (!a) {
        img.setVisible(false); // rubber arms out (Gomu stretch) — the weapon reads as stowed
        continue;
      }
      img.setTexture(wid);
      // grip rig: the hand holds at gripAt (fraction from the pommel end), the tip points along the aim,
      // and hand→tip maps EXACTLY to v.length (the sim reach) — the pommel side overhangs behind the hand
      const gripAt = v.gripAt ?? 0.08;
      const tipTop = (v.tipAt ?? 'top') === 'top';
      const h = v.length / Math.max(0.05, 1 - gripAt); // full art height so the tip-side span = length
      const w = h * (img.width / Math.max(1, img.height)); // keep the art's aspect; width is visual-only
      // ANIM SCALE: the body's jump/Geppo rise & submerge sink (RenderSystem publishes it — the body's own
      // gfx.setScale, applied about its center) must carry the blade too, or it detaches mid-jump. The grip
      // ANCHOR sits farther from center at 1.45×, so scale the anchor OFFSET; the steel grows by the same factor.
      const t = e.transform!; // narrowed by the with('transform', …) query
      const s = this.renderSys.scaleById.get(e.id) ?? 1;
      const ax = t.x + (a.x - t.x) * s;
      const ay = t.y + (a.y - t.y) * s;
      img
        .setOrigin(0.5, tipTop ? 1 - gripAt : gripAt) // origin = the grip point (rotation pivots at the hand)
        .setPosition(ax, ay)
        .setRotation(a.angle + (tipTop ? Math.PI / 2 : -Math.PI / 2)) // whichever end is the tip leads
        .setDisplaySize(w * s, h * s)
        // + the body's airborne lift so the blade rides up WITH the jumping body (keeps its -0.1 under-body order);
        // alpha reads the body's FINAL alpha (now incl. the jump-peak fade), so the steel fades exactly with it.
        .setDepth((this.renderSys.liftById.get(e.id) ?? 0) + this.renderSys.sortY(e) + (e.render!.depthBias ?? 0) - 0.1)
        .setAlpha(this.renderSys.alphaById.get(e.id) ?? 1)
        .setVisible(true);
    }
    // orphan sweep: entity despawned OR unequipped its sprite weapon since last frame
    for (const [id, img] of this.imgs) {
      if (!seen.has(id)) {
        img.destroy();
        this.imgs.delete(id);
      }
    }
  }
}
