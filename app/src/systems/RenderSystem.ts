import type Phaser from 'phaser';
import type { World } from '../ecs/World';

/** Syncs each entity's Graphics to its transform, depth-sorts by y, and runs its procedural draw. */
export class RenderSystem {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
  ) {}

  update(dt: number): void {
    const now = this.scene.time.now;
    for (const e of this.world.with('transform', 'render')) {
      const t = e.transform!;
      const rd = e.render!;
      if (rd.swingT && rd.swingT > 0) rd.swingT = Math.max(0, rd.swingT - dt);
      rd.gfx.setPosition(t.x, t.y);
      rd.gfx.setRotation(rd.rotateToAngle ? t.angle : 0);
      rd.gfx.setDepth(t.y + (rd.depthBias ?? 0)); // top-down y-sort
      // brief invulnerability blink
      let alpha = 1;
      if (e.health && e.health.iframes > 0 && Math.floor(now / 50) % 2 === 0) alpha = 0.45;
      rd.gfx.setAlpha(alpha);
      rd.gfx.clear();
      rd.draw(rd.gfx, e);
    }
  }
}
