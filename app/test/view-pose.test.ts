import { describe, expect, it } from 'vitest';
import { VIEW_TELEPORT_PX } from '../src/config/constants';
import { World } from '../src/ecs/World';
import { ViewPose } from '../src/systems/ViewPose';

/** A bare body — only the component under test. */
function body(world: World, x: number, y: number) {
  return world.create({ transform: { x, y, angle: 0, r: 10 } });
}

describe('ViewPose — draw between the last two sim positions (Fix Your Timestep)', () => {
  it('blends prev → cur by alpha; the endpoints are exact', () => {
    const w = new World();
    const v = new ViewPose(w);
    const e = body(w, 0, 0);
    v.capture(); // the step starts here …
    e.transform!.x = 10; // … and moves the body 10 px
    e.transform!.y = -4;
    v.setAlpha(0);
    expect(v.x(e)).toBe(0);
    v.setAlpha(0.5);
    expect(v.x(e)).toBe(5);
    expect(v.y(e)).toBe(-2);
    v.setAlpha(1);
    expect(v.x(e)).toBe(10);
  });

  it('with two steps in one frame, prev is the start of the LAST step', () => {
    const w = new World();
    const v = new ViewPose(w);
    const e = body(w, 0, 0);
    v.capture();
    e.transform!.x = 10; // step 1
    v.capture();
    e.transform!.x = 20; // step 2
    v.setAlpha(0.5);
    expect(v.x(e)).toBe(15); // 10 → 20, not 0 → 20
  });

  it('a body born mid-step (never captured) draws at its raw position', () => {
    const w = new World();
    const v = new ViewPose(w);
    v.capture();
    const e = body(w, 7, 7);
    v.setAlpha(0.5);
    expect(v.x(e)).toBe(7);
  });

  it('a TELEPORT (a jump beyond any per-step move) snaps instead of sliding across the world', () => {
    const w = new World();
    const v = new ViewPose(w);
    const e = body(w, 0, 0);
    v.capture();
    e.transform!.x = VIEW_TELEPORT_PX + 1; // a respawn-class jump
    v.setAlpha(0.5);
    expect(v.x(e)).toBe(VIEW_TELEPORT_PX + 1);
    e.transform!.x = VIEW_TELEPORT_PX - 1; // just under: a fast but legal move still blends
    expect(v.x(e)).toBe((VIEW_TELEPORT_PX - 1) / 2);
  });

  it('alpha is clamped to [0, 1] — a spiral-guarded accumulator can never draw past the current step', () => {
    const w = new World();
    const v = new ViewPose(w);
    const e = body(w, 0, 0);
    v.capture();
    e.transform!.x = 10;
    v.setAlpha(1.7);
    expect(v.x(e)).toBe(10);
    v.setAlpha(-0.3);
    expect(v.x(e)).toBe(0);
  });

  it('destroyed bodies are pruned at the next capture (no unbounded growth)', () => {
    const w = new World();
    const v = new ViewPose(w);
    const a = body(w, 0, 0);
    const b = body(w, 5, 5);
    v.capture();
    w.destroy(b);
    v.capture();
    // the map is private; prove the prune through behaviour: a re-created id would blend from nothing
    expect(v.x(a)).toBe(0);
    expect(v.renderAlpha).toBe(0);
    const c = w.create({ transform: { x: 100, y: 0, angle: 0, r: 10 } });
    expect(v.x(c)).toBe(100); // no stale entry under a new id
  });

  it('pixel snap rounds drawn positions to the buffer grid; 0 turns it off', () => {
    const w = new World();
    const v = new ViewPose(w);
    const e = body(w, 5.1, 2.9);
    v.capture();
    v.setGrid(3); // 3 buffer px per world px (1080p at the default zoom): steps of 1/3
    expect(v.x(e)).toBeCloseTo(5, 10); // 15.3 → 15 → 5.000
    expect(v.y(e)).toBeCloseTo(3, 10); // 8.7 → 9 → 3.000
    v.setGrid(0);
    expect(v.x(e)).toBe(5.1);
  });
});
