import Phaser from 'phaser';
import { Abilities } from '../combat/Ability';
import { fxThemeOf } from '../combat/fxTheme';
import { coatedKey, weaponTextureKey } from '../draw/coating';
import { Weapons } from '../defs/layers';
import { weaponAnchor, weaponHands } from '../draw/actorDraws';
import { isDowned } from '../combat/ragdoll';
import { rollProgress } from '../draw/rollAnim';
import type { World } from '../ecs/World';
import type { RenderSystem } from './RenderSystem';
import type { ViewPose } from './ViewPose';

/**
 * Renders sprite-visual weapons (WeaponDef.visual.kind === 'sprite') as pooled Images pinned to the SAME
 * weaponAnchor that drawActor uses for procedural weapons — one grip authority, two substrates, so the
 * drawn grip can never drift from the hitbox rig. Art convention: authored pointing UP with the canvas
 * BOTTOM at the grip point; drawn height maps to visual.length (SIM data — reach and hit span), so the
 * sprite's steel can never out-draw or under-draw what actually hits. Depth sits just under the owner's
 * body (hilt under the fists/torso, blade reading past the silhouette — same layering as procedural).
 * A PAIR (grip.hold 'each') is one image per hand, each pinned to its own hand's anchor.
 */
export class WeaponSpriteSystem {
  /** One image per (entity, hand) — keyed by `handSlot`, so a pair's two blades are two pooled images. */
  private readonly imgs = new Map<number, Phaser.GameObjects.Image>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
    private readonly renderSys: RenderSystem, // weapons mirror the body's computed alpha (wade/blink)
    private readonly view: ViewPose, // the body's DRAWN pose — the grip anchor is an offset from it
  ) {}

  update(): void {
    const seen = new Set<number>();
    for (const e of this.world.with('transform', 'equipment', 'render')) {
      const wid = e.equipment!.weapon;
      const wDef = wid ? Weapons.get(wid) : undefined;
      const v = wDef?.visual;
      if (!wDef || v?.kind !== 'sprite') continue;
      const tucked = rollProgress(e) !== null || isDowned(e); // mid-roll: a tucked BALL (drawRollBall), the weapon tucked in; DOWNED: it lies under him
      const theme = fxThemeOf(e); // the body's state picks the blade's look (coated = the baked themed variant; same dimensions, same rig)
      for (const side of weaponHands(e)) {
        const slot = handSlot(e.id, side);
        seen.add(slot);
        const base = weaponTextureKey(wDef, side);
        let img = this.imgs.get(slot);
        if (!img) {
          img = this.scene.add.image(0, 0, base); // origin (the grip point) is set per frame from the def's rig
          this.imgs.set(slot, img);
        }
        const a = tucked ? undefined : weaponAnchor(e, side);
        if (!a) {
          img.setVisible(false); // tucked, or rubber arms out (Gomu stretch) — the weapon reads as stowed
          continue;
        }
        img.setTexture(theme ? coatedKey(base, theme) : base);
        // grip rig: the hand holds at gripAt (fraction from the pommel end), the tip points along the aim,
        // and hand→tip maps EXACTLY to v.length (the sim reach) — the pommel side overhangs behind the hand.
        // The tip lives on whichever axis the art was DRAWN along: top/bottom = a VERTICAL weapon (a blade), the
        // tip on the height axis; left/right = a HORIZONTAL one (a musket barrel), the tip on the width axis.
        const gripAt = v.gripAt ?? 0.08;
        const tipAt = v.tipAt ?? 'top';
        const horizontal = tipAt === 'left' || tipAt === 'right';
        // `long` = the tip-axis art span that maps to length; `cross` = the other axis (visual-only, keeps aspect)
        const artLong = horizontal ? img.width : img.height;
        const artCross = horizontal ? img.height : img.width;
        const long = v.length / Math.max(0.05, 1 - gripAt); // full art span so the tip-side reach = length
        const cross = long * (artCross / Math.max(1, artLong)); // keep the art's aspect
        const w = horizontal ? long : cross;
        const h = horizontal ? cross : long;
        // the grip point as a Phaser origin (0..1 on each axis). On the tip axis it's `1 - gripAt` when the tip
        // is at the HIGH end (top/left of the origin's convention) — same math the vertical rig always used.
        const tipHigh = tipAt === 'top' || tipAt === 'left';
        const gripOnLong = tipHigh ? 1 - gripAt : gripAt;
        // aim offset per art rest-pose: a 'right' art already points along +x (aim 0); 'left' is flipped 180°;
        // a vertical 'top'/'bottom' art turns ±90° so its tip leads the aim. Add the live aim in all cases.
        const rest = tipAt === 'right' ? 0 : tipAt === 'left' ? Math.PI : tipAt === 'top' ? Math.PI / 2 : -Math.PI / 2;
        // ANIM SCALE: the body's jump/Geppo rise & submerge sink (RenderSystem publishes it — the body's own
        // gfx.setScale, applied about its center) must carry the blade too, or it detaches mid-jump. The grip
        // ANCHOR sits farther from center at 1.45×, so scale the anchor OFFSET; the steel grows by the same factor.
        const t = e.transform!; // narrowed by the with('transform', …) query
        const s = this.renderSys.scaleById.get(e.id) ?? 1;
        const ax = this.view.x(e) + (a.x - t.x) * s; // the anchor's OFFSET from the sim center, applied to the drawn center
        const ay = this.view.y(e) + (a.y - t.y) * s;
        // REVERSE-GRIP swing (musket butt-stroke): MIRROR the sprite end-for-end so the STOCK leads, not the
        // muzzle. setFlipX/Y mirrors the texture AROUND THE ORIGIN — and the origin IS the grip (the hand), so the
        // flip pivots in place: the hand stays fixed, the tip/butt swap ends. NO origin change (that double-
        // compensated and shoved it off the hand).
        const reverse = e.melee ? Abilities.get(e.melee.ability).shape?.reverseGrip === true : false;
        img
          .setFlipX(reverse && horizontal) // mirror along the barrel (horizontal art) — swaps muzzle/stock ends
          .setFlipY(reverse && !horizontal) // vertical art mirrors on its long axis instead
          .setOrigin(horizontal ? gripOnLong : 0.5, horizontal ? 0.5 : gripOnLong) // origin = the grip point (rotation pivots at the hand)
          .setPosition(ax, ay)
          .setRotation(a.angle + rest) // aim + the art's rest offset — the tip leads the aim for any orientation
          .setDisplaySize(w * s, h * s)
          // + the body's airborne lift so the blade rides up WITH the jumping body (keeps its -0.1 under-body order);
          // alpha reads the body's FINAL alpha (now incl. the jump-peak fade), so the steel fades exactly with it.
          .setDepth((this.renderSys.liftById.get(e.id) ?? 0) + this.renderSys.sortY(e) + (e.render!.depthBias ?? 0) - 0.1)
          .setAlpha(this.renderSys.alphaById.get(e.id) ?? 1)
          .setVisible(true);
      }
    }
    // orphan sweep: entity despawned, unequipped its sprite weapon, or swapped a pair for one blade since last frame
    for (const [id, img] of this.imgs) {
      if (!seen.has(id)) {
        img.destroy();
        this.imgs.delete(id);
      }
    }
  }
}

/** The image-pool key of one hand's blade: two slots per entity (lead = even, off = odd). */
function handSlot(entityId: number, side: 1 | -1): number {
  return entityId * 2 + (side === 1 ? 0 : 1);
}
