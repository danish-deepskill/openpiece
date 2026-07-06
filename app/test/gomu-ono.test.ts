import { describe, expect, it } from 'vitest';
import { Abilities } from '../src/combat/Ability';
import { swingPose } from '../src/combat/swing';
import type { MeleeSwing } from '../src/ecs/components';

/**
 * Gomu Ono — the overhead axe-kick: the leg RISES (foot scales up, lifts up-screen) through a long readable
 * windup, then CRASHES down as an AoE slam. Locks in the punch-class telegraph + the rising-leg animation shape.
 */

const ONO = Abilities.get('ability.gomuOno');
const geom = { r: 12, reach: 20, weaponLen: 0 };

function poseAt(p: number) {
  const s: MeleeSwing = { ability: ONO.id, t: p, dur: 1, motion: 'axe', phases: ONO.shape!.phases!, side: 1, angle: 0, hitByVolume: [] };
  return swingPose(s, ONO.shape!, geom);
}

describe('Gomu Ono ability + axe motion', () => {
  it('is a committed AoE slam (readable windup, no swing hit — the AoE is the damage)', () => {
    const w = ONO.shape!.swingTime! * ONO.shape!.phases!.windup;
    expect(w).toBeCloseTo(0.55, 2); // ~550ms rising-leg tell — punch-class, well above the ~250ms reaction floor
    expect(ONO.shape!.noHit).toBe(true); // the swing lands nothing…
    expect(ONO.shape!.landRadius).toBeGreaterThan(0); // …the landing AoE is the hit
    expect(ONO.shape!.pattern).toBe('axe');
    expect(ONO.shape!.limb).toBe('foot');
  });

  it('RISES then SLAMS: the foot scales UP BIG through windup (centered on the body), back to 1 at the crash', () => {
    const mid = ONO.shape!.phases!.windup / 2; // mid-windup — the leg is towering
    const peak = poseAt(mid);
    expect(peak.scale ?? 1).toBeGreaterThan(1.5); // foot swollen large (towering to the sky — the height IS the scale)

    const planted = poseAt(0.99); // deep in recovery — foot back down, normal size
    expect(planted.scale ?? 1).toBeCloseTo(1, 2);

    // CENTERED: the foot capsule straddles the body origin (a short segment through 0,0), not lifted off-screen —
    // so it reads as "leg towers straight overhead, slams on his own spot" (matching the body-centered AoE).
    const mid2 = (peak.hx + peak.tx) / 2;
    const mid2y = (peak.hy + peak.ty) / 2;
    expect(Math.hypot(mid2, mid2y)).toBeCloseTo(0, 5); // capsule centered on the actor
  });

  it('LANDS exactly at windup-end (= when the AoE fires) — the impact syncs with the foot touching down', () => {
    const w = ONO.shape!.phases!.windup;
    // the rise-and-fall happens ENTIRELY within the windup: peaks partway through, then crashes to PLANTED by the
    // windup→active boundary — because AbilitySystem fires the slam AoE at that boundary (`p >= windup`). So the
    // damage coincides with the foot hitting the ground, not with it hanging at its peak.
    const midWindup = poseAt(w * 0.4); // still climbing
    const landed = poseAt(w - 0.001); // the instant before active starts = the impact frame
    expect(midWindup.scale ?? 1).toBeGreaterThan(1.5); // towering up mid-windup
    expect(landed.scale ?? 1).toBeCloseTo(1, 1); // …but PLANTED (scale ≈ 1) right as the slam lands
  });
});
