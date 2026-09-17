import { VIEW_TELEPORT_PX } from '../config/constants';
import type { Entity } from '../ecs/components';
import type { World } from '../ecs/World';

/**
 * WHERE TO DRAW a body THIS FRAME — render interpolation between fixed sim steps (Fiedler, "Fix Your Timestep!";
 * Minecraft's partialTicks, Unity's Rigidbody.Interpolate). The sim advances in SIM_DT quanta (60 Hz); the
 * display refreshes at ITS rate (60/120/144 Hz). Drawing raw sim positions at 120 Hz shows every position twice —
 * 60 Hz stepped motion on a 120 Hz panel — and a camera that smooths every render frame then chases a target
 * that only moves every other frame, so the controlled unit VIBRATES on screen at 60 Hz (~2 px at sprint):
 * the "blurry when running" report. The fix: remember each body's position at the START of the last step and
 * draw prev + (cur − prev) × alpha, alpha = the accumulator's fraction into the next step. Positions read up to
 * one step (16 ms) old — the accepted price everywhere; extrapolating ahead overshoots every collision instead.
 *
 * A PRESENTATION service (no Phaser, so it's testable headless), the Damage-pattern: injected into every system
 * that PLACES something on screen (bodies, worn layers, nameplates, projectiles, reticle, rings, the camera).
 * The sim never reads it; DebugOverlay deliberately draws the sim TRUTH (raw transforms), not the view.
 * `transform.x/y` stays every body's world projection (deck parenting keeps it fresh per step), so a rider
 * interpolates like anyone else. Angle is NOT interpolated: aim updates at 60 Hz read fine — a rotation step is
 * sub-pixel at body radius — and the cost of touching every local-space draw isn't worth it.
 */
interface Prev {
  x: number;
  y: number;
  tick: number; // the capture that last refreshed this entry — an entry not refreshed was destroyed: prune
}

export class ViewPose {
  private readonly prev = new Map<number, Prev>();
  private tick = 0;
  private alpha = 0;
  private grid = 0; // buffer px per world px to snap drawn positions to; 0 = off (WorldScene sets it)

  constructor(private readonly world: World) {}

  /** Call right BEFORE each sim step: every body's position NOW becomes the interpolation's `from`. With two
   *  steps in one render frame the second capture wins — prev is always the start of the LAST step (Fiedler). */
  capture(): void {
    this.tick++;
    for (const e of this.world.with('transform')) {
      const p = this.prev.get(e.id);
      if (p) {
        p.x = e.transform.x; // reuse the entry — no per-step allocation for a live body
        p.y = e.transform.y;
        p.tick = this.tick;
      } else {
        this.prev.set(e.id, { x: e.transform.x, y: e.transform.y, tick: this.tick });
      }
    }
    for (const [id, p] of this.prev) if (p.tick !== this.tick) this.prev.delete(id); // destroyed since last step
  }

  /** After the step loop: how far the accumulator is into the NEXT step (acc / SIM_DT), clamped to [0, 1]. */
  setAlpha(a: number): void {
    this.alpha = a < 0 ? 0 : a > 1 ? 1 : a;
  }

  /** PIXEL SNAP: round drawn positions to the buffer-pixel grid (`bufferPxPerWorldPx` = the camera's total zoom)
   *  so a body's origin lands on a whole device pixel every frame — the antialiasing pattern of its edges then
   *  holds still from frame to frame instead of swimming as the fractional offset drifts. 0 = off. Steps are
   *  1/zoom world px (a third of a pixel at 1080p, a sixth at 4K) — invisible. Only meaningful with the camera
   *  scroll snapped to the same grid (WorldScene) and at rest (a rotating/zooming view aligns to no grid). */
  setGrid(bufferPxPerWorldPx: number): void {
    this.grid = bufferPxPerWorldPx > 0 ? bufferPxPerWorldPx : 0;
  }

  x(e: Entity): number {
    return this.snap(this.blend(e, 'x'));
  }

  y(e: Entity): number {
    return this.snap(this.blend(e, 'y'));
  }

  /** Whether this frame is drawing an interpolated (not raw) pose for `e` — tests + debug readouts. */
  get renderAlpha(): number {
    return this.alpha;
  }

  private blend(e: Entity, axis: 'x' | 'y'): number {
    const t = e.transform!; // every caller places a transform-bearing entity (with('transform')-narrowed at the call site)
    const cur = t[axis];
    const p = this.prev.get(e.id);
    if (!p) return cur; // born mid-step, or the first frame: nothing to blend from
    // TELEPORT: a jump larger than any legal per-step move (respawn, a frame hop's projection change, a debug
    // move) snaps — sliding across it would draw a ghost trip through walls. Judged on the full 2-D distance.
    const dx = t.x - p.x;
    const dy = t.y - p.y;
    if (dx * dx + dy * dy > VIEW_TELEPORT_PX * VIEW_TELEPORT_PX) return cur;
    return p[axis] + (cur - p[axis]) * this.alpha;
  }

  private snap(v: number): number {
    return this.grid > 0 ? Math.round(v * this.grid) / this.grid : v;
  }
}
