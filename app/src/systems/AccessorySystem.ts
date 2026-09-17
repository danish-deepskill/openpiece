import Phaser from 'phaser';
import { Accessories, type AccessorySlot } from '../defs/accessories';
import { accessoryDraws } from '../draw/accessoryDraws';
import { ANATOMY, BODY_FRAME_R, SLOT_ANCHOR } from '../draw/actorDraws';
import { rollHeadPlacement } from '../draw/rollAnim';
import type { World } from '../ecs/World';
import type { RenderSystem } from './RenderSystem';
import type { ViewPose } from './ViewPose';

/** Per-slot depth ladder over the body (an 'under' item drops below it instead). Distinct rungs per slot —
 *  two same-depth sprites would z-fight by POOL order, which reshuffles as units enter/leave view. Order
 *  bottom→top: back → chest → face → hair → head(hat). `hair` sits ABOVE the bare head/face but BELOW the
 *  hat, so a hat always covers hair while both are worn. */
const SLOT_DEPTH: Record<AccessorySlot, number> = { back: 0.35, chest: 0.45, face: 0.5, hair: 0.55, head: 0.6 };

/** Placeholder palette for `kind: 'auto'` visuals — hash-picked per def id, so two prototyped items read
 *  as distinct at a glance without any art decision having been made. */
const AUTO_COLORS = [0xe06c5a, 0x5aa0e0, 0x7fd17f, 0xf0b429, 0xc97fff, 0x62d6c4, 0xf28bc1, 0xa8b820];

const hashOf = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h >>> 0;
};

/**
 * Renders equipped accessories over/under each actor — one strategy per `Visual` kind (defs/visual.ts):
 * `sprite` = a pooled Image (texture key = def id, loaded by BootScene); `procedural`/`auto` = a pooled
 * Graphics (draw fn / placeholder disc). Presentation-only, outside the ECS; flipping a def's visual kind
 * changes WHICH pool serves it and nothing else. Sprites' "forward" is up (rotated a + 90°);
 * draw fns get forward = +x (rotated a).
 */
export class AccessorySystem {
  private readonly images: Phaser.GameObjects.Image[] = [];
  private readonly gfx: Phaser.GameObjects.Graphics[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
    private readonly renderSys: RenderSystem, // accessories mirror the body's computed alpha (wade/blink)
    private readonly view: ViewPose, // the body's DRAWN pose — slots are offsets from it
  ) {}

  update(): void {
    let usedImg = 0;
    let usedGfx = 0;
    for (const e of this.world.with('transform', 'accessories')) {
      if (e.health?.dead) continue;
      const t = e.transform!;
      const a = t.angle;
      const vx = this.view.x(e);
      const vy = this.view.y(e);
      // ROLL: the head tumbles over→under (drawRollPose). A HAT sits on the crown, so it RIDES the head — pinned
      // to the shared head placement, scaled with it, and FADED OUT while the head is tucked under (its crown
      // faces the ground, so the hat is on the head's hidden far side). Non-head accessories (chest/back) have no
      // clean roll placement, so they stay hidden for the roll.
      const head = rollHeadPlacement(e);
      for (const id of Object.values(e.accessories!.slots)) {
        if (!id) continue;
        const d = Accessories.get(id);
        const rollingHat = head !== null && (d.slot === 'head' || d.slot === 'face' || d.slot === 'hair'); // hair rides the tumbling head too
        if (head !== null && !rollingHat) continue; // mid-roll non-head accessory → hidden (falls into the pool sweep)
        const v = d.visual;
        // a 'body'-frame sprite is REGISTERED to the mannequin (canvas center = body center) — its content
        // is already positioned by the artist on the template, so it takes no slot-anchor offset
        const registered = v.kind === 'sprite' && v.frame === 'body';
        // ANIM SCALE: ride the body's jump/Geppo rise & submerge sink (RenderSystem publishes it — the body's
        // own gfx.setScale) so a hat/mask stays glued through the arc instead of hovering at flat size. Because
        // the body scales about its center, the anchor OFFSET grows with it too (a crown pin sits farther out at
        // 1.45×), so this multiplies BOTH the offset and the drawn size. Rolling hat has its own scale channel.
        const animScale = rollingHat ? 1 : (this.renderSys.scaleById.get(e.id) ?? 1);
        const off = ((registered ? 0 : SLOT_ANCHOR[d.slot] * t.r) + (d.offset ?? 0)) * animScale;
        // normal: pinned along the aim. Rolling hat: pinned to the tumbling head instead.
        const x = rollingHat ? vx + head!.dx : vx + Math.cos(a) * off;
        const y = rollingHat ? vy + head!.dy : vy + Math.sin(a) * off;
        const baseAlpha = this.renderSys.alphaById.get(e.id) ?? 1;
        const alpha = rollingHat ? baseAlpha * head!.crownAlpha : baseAlpha; // fade the hat out as the head tucks under
        // add the body's airborne depth-lift so a hat/mask rides ABOVE grounded units WITH the jumping body (its
        // +SLOT_DEPTH over the body is preserved, so it still sits on top of the body it's worn on).
        const lift = this.renderSys.liftById.get(e.id) ?? 0;
        const depth = lift + (rollingHat
          ? this.renderSys.sortY(e) + (head!.overTop ? 0.5 : -0.5) // over the top → above body; under → behind it
          : this.renderSys.sortY(e) + (d.layer === 'under' ? -0.6 : SLOT_DEPTH[d.slot])); // slot ladder over the y-sorted body (sortY handles riders)

        if (v.kind === 'sprite') {
          let img = this.images[usedImg];
          if (!img) {
            img = this.scene.add.image(0, 0, id).setOrigin(0.5, 0.5);
            this.images[usedImg] = img;
          } else {
            img.setTexture(id);
          }
          usedImg++;
          // item-frame size basis is the slot's CANVAS: head/face sprites scale against the HEAD diameter
          // (scale 1.6 = 1.6 heads — a hat keeps fitting if the anatomy retunes), other slots against the
          // body diameter. body frame: the canvas spans the full ±BODY_FRAME_R·r regardless of slot.
          const basis = d.slot === 'head' || d.slot === 'face' || d.slot === 'hair' ? ANATOMY.headR * 2 * t.r : 2 * t.r;
          const dia = (registered ? BODY_FRAME_R * 2 * t.r * v.scale : basis * v.scale) * (rollingHat ? head!.scale : animScale); // shrink w/ tumbling head, else ride the jump/sink arc
          // rolling hat orients to the TRAVEL direction (it tumbles the way you roll), not the unit's aim
          const rot = d.rotates === false ? 0 : (rollingHat ? head!.travel : a) + Math.PI / 2;
          img
            .setPosition(x, y)
            .setRotation(rot)
            .setDisplaySize(dia, dia)
            .setAlpha(alpha)
            .setDepth(depth)
            .setVisible(true);
          continue;
        }

        let g = this.gfx[usedGfx];
        if (!g) {
          g = this.scene.add.graphics();
          this.gfx[usedGfx] = g;
        }
        usedGfx++;
        g.setPosition(x, y)
          .setRotation(d.rotates === false ? 0 : (rollingHat ? head!.travel : a)) // rolling hat follows travel, not aim
          .setScale(animScale) // ride the body's jump/sink arc (animScale is forced to 1 while rolling, above)
          .setAlpha(alpha)
          .setDepth(depth)
          .setVisible(true);
        g.clear();
        if (v.kind === 'procedural') {
          accessoryDraws[v.draw]!(g, e, d); // key existence is boot-validated (BootScene sweep) — a miss can't reach here
        } else {
          // auto placeholder: a hash-colored disc + rim + facing notch — enough to SEE the item while the
          // mechanic is being proven, distinct from its neighbors, zero art authored
          const r = t.r * 0.6;
          const color = AUTO_COLORS[hashOf(d.id) % AUTO_COLORS.length];
          g.fillStyle(color, 1);
          g.fillCircle(0, 0, r);
          g.lineStyle(2, 0x20242a, 0.9);
          g.strokeCircle(0, 0, r);
          g.fillStyle(0x20242a, 0.9);
          g.fillRect(r * 0.4, -1.5, r * 0.7, 3); // notch marks the facing so rotation reads even on a disc
        }
      }
    }
    for (let i = usedImg; i < this.images.length; i++) this.images[i].setVisible(false);
    for (let i = usedGfx; i < this.gfx.length; i++) this.gfx[i].setVisible(false);
  }
}
