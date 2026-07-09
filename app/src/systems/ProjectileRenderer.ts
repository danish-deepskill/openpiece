import Phaser from 'phaser';
import { Abilities } from '../combat/Ability';
import { Depth } from '../config/constants';
import type { World } from '../ecs/World';
import { shotArtKey } from '../scenes/BootScene';

/**
 * Draws travelling shots — one pooled Image per live `projectile` entity, textured from its ability's
 * `shotArt` (a musket ball, later a cannonball). Presentation-only: ProjectileSystem owns the position + the
 * hit; this just pins a sprite to it and rotates it along the travel heading. Orphan sweep frees the Image
 * when the ball despawns (contact/expiry). A shot with no `shotArt` draws nothing here (future: a proc dot).
 */
export class ProjectileRenderer {
  private readonly imgs = new Map<number, Phaser.GameObjects.Image>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
  ) {}

  update(): void {
    const seen = new Set<number>();
    for (const e of this.world.with('projectile', 'transform')) {
      const shape = Abilities.get(e.projectile.ability).shape;
      const art = shape?.shotArt;
      if (!art) continue; // artless shot — nothing to draw (the ball still flies + hits; it's just invisible)
      seen.add(e.id);
      const key = shotArtKey(art);
      let img = this.imgs.get(e.id);
      if (!img) {
        img = this.scene.add.image(0, 0, key).setDepth(Depth.Boat); // over the ground/structure, with the actors
        this.imgs.set(e.id, img);
      }
      const t = e.transform;
      const size = shape?.shotSize ?? 6;
      img
        .setPosition(t.x, t.y)
        .setRotation(t.angle) // the ball points along its heading (matters for a directional art; harmless for a round ball)
        .setDisplaySize(size, size)
        .setVisible(true);
    }
    // orphan sweep: the projectile despawned (hit a body/wall, or fizzled at range) since last frame
    for (const [id, img] of this.imgs) {
      if (!seen.has(id)) {
        img.destroy();
        this.imgs.delete(id);
      }
    }
  }
}
