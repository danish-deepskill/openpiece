import Phaser from 'phaser';
import { Accessories } from '../defs/accessories';
import { accessoryDraws } from '../draw/accessoryDraws';
import type { World } from '../ecs/World';
import type { RenderSystem } from './RenderSystem';

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
  ) {}

  update(): void {
    let usedImg = 0;
    let usedGfx = 0;
    for (const e of this.world.with('transform', 'accessories')) {
      if (e.health?.dead) continue;
      const t = e.transform!;
      const a = t.angle;
      for (const id of Object.values(e.accessories!.slots)) {
        if (!id) continue;
        const d = Accessories.get(id);
        const v = d.visual;
        const off = d.offset ?? 0;
        const x = t.x + Math.cos(a) * off;
        const y = t.y + Math.sin(a) * off;
        const alpha = this.renderSys.alphaById.get(e.id) ?? 1;
        const depth = t.y + (d.layer === 'under' ? -0.6 : 0.6); // just over/under the actor's y-sorted body

        if (v.kind === 'sprite') {
          let img = this.images[usedImg];
          if (!img) {
            img = this.scene.add.image(0, 0, id).setOrigin(0.5, 0.5);
            this.images[usedImg] = img;
          } else {
            img.setTexture(id);
          }
          usedImg++;
          const dia = t.r * 2 * v.scale;
          img
            .setPosition(x, y)
            .setRotation(d.rotates === false ? 0 : a + Math.PI / 2)
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
          .setRotation(d.rotates === false ? 0 : a)
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
