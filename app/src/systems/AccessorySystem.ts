import Phaser from 'phaser';
import { Accessories } from '../defs/accessories';
import type { World } from '../ecs/World';
import type { RenderSystem } from './RenderSystem';

/**
 * Renders equipped accessory sprites (hats/helmets) over each actor, rotated to its aim. Presentation-only,
 * outside the ECS, reusing a pooled Image per visible accessory. The sprites' "forward" is up, so a hat
 * facing the aim angle `a` is rotated by a + 90°.
 */
export class AccessorySystem {
  private readonly pool: Phaser.GameObjects.Image[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
    private readonly renderSys: RenderSystem, // hats mirror the body's computed alpha (wade/blink)
  ) {}

  update(): void {
    let used = 0;
    for (const e of this.world.with('transform', 'accessories')) {
      if (e.health?.dead) continue;
      const t = e.transform!;
      const a = t.angle;
      for (const id of Object.values(e.accessories!.slots)) {
        if (!id) continue;
        const d = Accessories.get(id);
        let img = this.pool[used];
        if (!img) {
          img = this.scene.add.image(0, 0, id).setOrigin(0.5, 0.5);
          this.pool[used] = img;
        } else {
          img.setTexture(id);
        }
        used++;
        const dia = t.r * 2 * d.scale;
        const off = d.offset ?? 0;
        img
          .setPosition(t.x + Math.cos(a) * off, t.y + Math.sin(a) * off)
          .setRotation(d.rotates === false ? 0 : a + Math.PI / 2)
          .setDisplaySize(dia, dia)
          .setAlpha(this.renderSys.alphaById.get(e.id) ?? 1) // mirror the body's computed alpha (wade/blink)
          .setDepth(t.y + (d.layer === 'under' ? -0.6 : 0.6)) // just over/under the actor's own y-sorted body
          .setVisible(true);
      }
    }
    for (let i = used; i < this.pool.length; i++) this.pool[i].setVisible(false);
  }
}
