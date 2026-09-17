import type Phaser from 'phaser';
import { isRanged } from '../combat/equip';
import type { World } from '../ecs/World';
import type { InputSystem } from './InputSystem';
import type { ViewPose } from './ViewPose';

/** Distance ahead of the controlled unit (px) the reticle sits — far enough out to read as a clear aim marker. */
const RETICLE_DIST = 80;
const ARM = 6; // half-length of each crosshair stroke (px)
const GAP = 3; // center gap (px) — a classic open '+' reads cleaner than a solid plus
/** Radius (px) of the spread-cone wedge — short enough to read as an aim marker, not fill the screen. */
const CONE_RADIUS = 90;
const CONE_COLOR = 0xffffff;

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
    private readonly view: ViewPose,
  ) {
    this.gfx = scene.add.graphics();
    this.gfx.setDepth(9000); // above actors, below the HUD scene
  }

  /** WorldScene passes −camRot so the reticle stays level while the shift-lock view rotates. */
  setRotation(rot: number): void {
    this.rot = rot;
  }

  update(): void {
    const g = this.gfx;
    const controlled = this.world.first('control');
    const t = controlled?.transform;
    g.clear();
    if (!t) {
      this.gfx.setVisible(false);
      return;
    }
    g.setVisible(true);
    const px = this.view.x(controlled!); // the DRAWN pose (see the `controlled!` note below); px/py — vx/vy below are screen unit vectors
    const py = this.view.y(controlled!);

    // SPREAD CONE — shown ONLY while AIMING (holding RMB): a translucent WEDGE from the muzzle spanning
    // ±spread (combatant.spread), your live accuracy readout. It NARROWS as you settle (aim + stand still),
    // WIDENS as you move — the #19 honesty contract. Hidden when not aiming (the cone IS the aim readout, so a
    // lowered/port-carry musket shows none). Same wedge primitive the AI VISION cone uses (DebugOverlay
    // g.slice) — one cone look. World space (rotates with aim).
    // `controlled!` safe: the `if (!t) return` above already proved the entity exists (t = controlled?.transform)
    const cone = isRanged(controlled!) && controlled!.combatant?.aiming ? (controlled!.combatant.spread ?? 0) : 0;
    if (cone > 0) {
      g.setPosition(0, 0).setRotation(0);
      const a = t.angle;
      g.fillStyle(CONE_COLOR, 0.08); // translucent fill (matches the vision wedge's weight)
      g.slice(px, py, CONE_RADIUS, a - cone, a + cone, false);
      g.fillPath();
      g.lineStyle(1, CONE_COLOR, 0.35); // a faint stroked edge
      g.slice(px, py, CONE_RADIUS, a - cone, a + cone, false);
      g.strokePath();
    }

    // '+' RETICLE — ONLY in shift-lock (Alt) mode: free-cursor aiming has the mouse pointer already; the '+' is
    // the aim readout for when the cursor is PINNED (mouselook). The cone above is drawn in WORLD space, so it
    // must be laid down BEFORE we move/rotate the graphic here for the screen-upright '+'.
    if (this.input.shiftLocked) {
      const cx = px + Math.cos(t.angle) * RETICLE_DIST;
      const cy = py + Math.sin(t.angle) * RETICLE_DIST;
      // the '+' is drawn relative to the graphic's origin, so shift it out by the reticle offset in world space
      g.lineStyle(1.5, 0xffffff, 0.95);
      const ux = Math.cos(this.rot);
      const uy = Math.sin(this.rot); // screen-right after the camera counter-rotation
      const vx = -uy;
      const vy = ux; // screen-down
      const seg = (a1: number, a2: number): void => {
        g.lineBetween(cx + ux * a1, cy + uy * a1, cx + ux * a2, cy + uy * a2);
      };
      const segV = (a1: number, a2: number): void => {
        g.lineBetween(cx + vx * a1, cy + vy * a1, cx + vx * a2, cy + vy * a2);
      };
      seg(GAP, ARM); // right
      seg(-ARM, -GAP); // left
      segV(GAP, ARM); // down
      segV(-ARM, -GAP); // up
    }
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
