import Phaser from 'phaser';
import { Abilities } from '../combat/Ability';
import { Effects } from '../combat/Effect';
import { shotProcKey } from '../draw/projectileProc';
import type { World } from '../ecs/World';
import { shotArtKey } from '../scenes/BootScene';
import type { ViewPose } from './ViewPose';

/** Depth bias above the actor y-sort band — a flying ball reads ON TOP of the units at its own y (a bullet is
 *  chest-height, not on the ground). Actors sort by their y (hundreds–thousands), so the ball uses ITS y + this
 *  bias to sit just over whoever's at the same line, never buried under the ground plane (the Depth.Boat bug). */
const SHOT_DEPTH_BIAS = 40;

/**
 * Draws travelling shots — one pooled Image per live `projectile` entity, textured from its ability's shot
 * visual: an art PNG (`shotArt`) OR a GENERATED texture (`shotProc` — a proc ball, baked at boot in
 * draw/projectileProc). An ELECTRIC round (the `projectile.electric` flag) picks the crackling variant texture.
 * Presentation-only: ProjectileSystem owns the position + the hit; this pins a sprite and rotates it along the
 * travel heading. Orphan sweep frees the Image when the ball despawns. A shot with neither visual draws nothing.
 */
export class ProjectileRenderer {
  private readonly imgs = new Map<number, Phaser.GameObjects.Image>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
    private readonly view: ViewPose, // a ball crosses ~6 px per step — the smoothest thing on screen needs this most
  ) {}

  update(): void {
    const seen = new Set<number>();
    for (const e of this.world.with('projectile', 'transform')) {
      const pr = e.projectile;
      const shape = Abilities.get(pr.ability).shape;
      // texture key: an art PNG wins if set; else a GENERATED proc texture — a CHARGED round picks the crackling
      // variant themed by its effect's status color (the one home for the electric cyan; baked per color at boot).
      const procColor = pr.proc ? (Effects.get(pr.proc.effect).status?.color ?? 0xffffff) : undefined;
      const key = shape?.shotArt
        ? shotArtKey(shape.shotArt)
        : shape?.shotProc
          ? shotProcKey(shape.shotProc, procColor)
          : undefined;
      if (!key) continue; // artless + procless shot — nothing to draw (still flies + hits; just invisible)
      seen.add(e.id);
      let img = this.imgs.get(e.id);
      if (!img) {
        img = this.scene.add.image(0, 0, key);
        this.imgs.set(e.id, img);
      }
      const t = e.transform;
      const size = shape?.shotSize ?? 6;
      const vy = this.view.y(e);
      img
        .setPosition(this.view.x(e), vy)
        .setRotation(t.angle) // the ball points along its heading (matters for a directional art; harmless for a round ball)
        .setDisplaySize(size, size)
        .setDepth(vy + SHOT_DEPTH_BIAS) // y-sort with the actors (+bias = over them), NOT the fixed Depth.Boat (that buried it)
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
