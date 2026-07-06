import type Phaser from 'phaser';
import type { World } from '../ecs/World';
import type { InputSystem } from './InputSystem';

/** Distance ahead of the controlled unit (px) the reticle sits — far enough out to read as a clear aim marker. */
const RETICLE_DIST = 80;
const ARM = 6; // half-length of each crosshair stroke (px)
const GAP = 3; // center gap (px) — a classic open '+' reads cleaner than a solid plus

/**
 * The aim reticle — a small '+' drawn AHEAD of the controlled unit along its facing, so you can see exactly
 * where attacks point. Shown ONLY in shift-lock (Alt) mode — that's when the cursor is pinned and you can't see
 * your aim otherwise; free-cursor mode has the mouse pointer already. Presentation-only: reads the sim's aim
 * (`control` unit's transform.angle) + the InputSystem's shift-lock flag; draws nothing sim-side. Follows
 * possession (any controlled unit). Kept screen-upright under the shift-lock camera spin (setRotation −camRot).
 */
export class AimReticle {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private rot = 0; // counter-rotation to stay screen-upright (−camRot), set by WorldScene

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
    private readonly input: InputSystem,
  ) {
    this.gfx = scene.add.graphics();
    this.gfx.setDepth(9000); // above actors, below the HUD scene
  }

  /** WorldScene passes −camRot so the reticle stays level while the shift-lock view rotates. */
  setRotation(rot: number): void {
    this.rot = rot;
  }

  update(): void {
    // ONLY in shift-lock (Alt) mode — free-cursor aiming already has the mouse pointer to aim by; the '+' is the
    // aim readout for when the cursor is PINNED (mouselook). Hidden otherwise.
    const e = this.input.shiftLocked ? this.world.first('control') : undefined;
    const t = e?.transform;
    if (!t) {
      this.gfx.setVisible(false);
      return;
    }
    // place the '+' out along the aim; the crosshair strokes themselves stay screen-upright (this.rot)
    const cx = t.x + Math.cos(t.angle) * RETICLE_DIST;
    const cy = t.y + Math.sin(t.angle) * RETICLE_DIST;

    const g = this.gfx;
    g.setVisible(true);
    g.setPosition(cx, cy);
    g.setRotation(this.rot); // strokes are laid out in this frame, so screen-upright regardless of camera spin
    g.clear();
    g.lineStyle(1.5, 0xffffff, 0.95); // a plain white '+'
    g.lineBetween(GAP, 0, ARM, 0); // right
    g.lineBetween(-ARM, 0, -GAP, 0); // left
    g.lineBetween(0, GAP, 0, ARM); // down
    g.lineBetween(0, -ARM, 0, -GAP); // up
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
