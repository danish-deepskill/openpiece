import { describe, expect, it } from 'vitest';
import type { AbilityShape } from '../src/combat/Ability';
import { activeSide, guardHand, swingPose, type SwingGeom } from '../src/combat/swing';
import type { MeleeSwing } from '../src/ecs/components';

const GEOM: SwingGeom = { r: 12, reach: 34, weaponLen: 0 };

/** Timing-neutral phases (all-active) — pose SHAPE tests that don't care about the clock use these. */
const ALL_ACTIVE = { windup: 0, active: 1, recover: 0 } as const;
/** The Gomu Pistol's authored profile — the stretch timeline tests assert against this clock. */
const PISTOL = { windup: 0.36, active: 0.22, recover: 0.42 } as const;

/** Build a swing instance + look up the pose for a given motion/shape/geometry. */
function pose(motion: string, swing: Partial<MeleeSwing>, shape: Partial<AbilityShape> = {}, geom: Partial<SwingGeom> = {}) {
  const s: MeleeSwing = { ability: 'ability.x', t: 0.5, dur: 1, motion, phases: ALL_ACTIVE, side: 1, angle: 0, hitByVolume: [], ...swing };
  const sh: AbilityShape = { range: 0, arc: 0.5, swing: 'melee', ...shape };
  return swingPose(s, sh, { ...GEOM, ...geom });
}

/** A stretch swing instance for activeSide tests (all-active clock: jab index maps 1:1 onto progress). */
const sw = (over: Partial<MeleeSwing>): MeleeSwing => ({
  ability: 'ability.x', t: 0, dur: 1, motion: 'stretch', phases: ALL_ACTIVE, side: 1, angle: 0, hitByVolume: [], ...over,
});

describe('swingPose — the drawn fist/blade/limb is the hitbox', () => {
  it('a jab thrusts forward FROM the acting hand (off-axis), not down the centerline', () => {
    const p = pose('stab', { t: 0.09, dur: 0.18, side: 1 }); // bare right fist at mid-swing
    expect(p.hx).toBeGreaterThan(0); // forward of the body
    expect(Math.abs(p.hy)).toBeGreaterThan(2); // and offset to the hand's side
  });

  it('left and right jabs land on opposite sides', () => {
    const right = pose('stab', { t: 0.09, dur: 0.18, side: 1 });
    const left = pose('stab', { t: 0.09, dur: 0.18, side: -1 });
    expect(Math.sign(right.hy)).toBe(-Math.sign(left.hy));
  });

  it('an armed swing keeps the hand near the body (twist) while the blade reaches out', () => {
    const p = pose('arc', { t: 0.09, dur: 0.18, side: 1 }, {}, { weaponLen: 30 }); // cutlass swing
    expect(Math.hypot(p.hx, p.hy)).toBeLessThan(18); // hand stays home (~body radius)
    expect(Math.hypot(p.tx, p.ty)).toBeGreaterThan(28); // blade tip reaches well past it
  });
});

describe('swingPose — Gomu rubber-arm stretch (on the Pistol\'s authored phase clock)', () => {
  const [bx] = guardHand(0, 1, 12); // the acting hand's GUARD (combat root) x — motions never start from idle
  const P = { phases: PISTOL };

  it('cocks the fist BACK during the windup', () => {
    expect(pose('stretch', { t: 0.1, ...P }, { range: 200 }).tx).toBeLessThan(bx); // behind the shoulder
  });

  it('snaps the fist out to its full reach at the punch peak, then retracts home', () => {
    let maxTx = -Infinity; // robust to the exact windup/punch timing
    for (let p = 0; p <= 1.0001; p += 0.02) maxTx = Math.max(maxTx, pose('stretch', { t: p, ...P }, { range: 200 }).tx);
    expect(maxTx).toBeCloseTo(bx + 200, 0); // reaches full extension at the end of the active phase
    expect(pose('stretch', { t: 1, ...P }, { range: 200 }).tx).toBeCloseTo(bx, 1); // back to rest at the end
  });

  it('a grab reaches forward with no wind-up (Gomu Rocket), unlike the punch', () => {
    expect(pose('stretch', { t: 0.2, ...P }, { range: 200, stretchMode: 'grab' }).tx).toBeGreaterThan(bx); // already forward
    expect(pose('stretch', { t: 0.2, ...P }, { range: 200 }).tx).toBeLessThan(bx); // punch is still mid wind-up
  });
});

describe('activeSide — a flurry alternates hands jab by jab', () => {
  it('the Gatling goes L → R → L → R', () => {
    expect(activeSide(sw({ t: 0.1, side: 1 }), 4)).toBe(1); // jab 0
    expect(activeSide(sw({ t: 0.3, side: 1 }), 4)).toBe(-1); // jab 1
    expect(activeSide(sw({ t: 0.6, side: 1 }), 4)).toBe(1); // jab 2
  });

  it('a single strike never switches hands', () => {
    expect(activeSide(sw({ t: 0.4, side: 1 }), 1)).toBe(1);
    expect(activeSide(sw({ t: 0.9, side: -1 }), 1)).toBe(-1);
  });
});
