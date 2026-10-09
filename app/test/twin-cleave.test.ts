import { describe, expect, it } from 'vitest';
import { Abilities } from '../src/combat/Ability';
import { applyEffect, TAG_PUMPED } from '../src/combat/Effect';
import { swingGeomOf, swingPose } from '../src/combat/swing';
import { Rng } from '../src/core/Rng';
import { weaponAnchor } from '../src/draw/actorDraws';
import { HAND_AURA_BY_TAG, handAuraOf } from '../src/draw/handAuras';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { EffectSystem } from '../src/systems/EffectSystem';
import type { StrikeResolver } from '../src/systems/StrikeResolver';

/** NIGORI ZAKE as ONE blow: both blades raised together, held, brought down across the front — and the pump that unlocks it
 *  shows on the body (a hand aura from the tag), not only as a label. */
const ZAKE = Abilities.get('ability.nigoriZake');
const rel = (b: number, aim: number): number => Math.atan2(Math.sin(b - aim), Math.cos(b - aim));

function rig() {
  const world = new World();
  const sp = new Spawner(world, new Rng(5));
  const abilities = new AbilitySystem(world, new EffectSystem(world), {} as StrikeResolver, new Rng(1)); // contact never resolves here
  const zoro = sp.spawnUnit('unit.zoroAdvanced', 0, 0);
  applyEffect(zoro, 'effect.niGorilla', 'test');
  expect(abilities.activate(zoro, 'ability.nigoriZake')).toBe(true);
  return { zoro, m: zoro.melee!, geom: swingGeomOf(zoro) };
}

describe('the pump shows on the fists', () => {
  it('a pumped body carries the hand aura; a plain one none; the table is keyed by the tag', () => {
    const sp = new Spawner(new World(), new Rng(1));
    const e = sp.spawnUnit('unit.zoroAdvanced', 0, 0);
    expect(handAuraOf(e)).toBeUndefined();
    applyEffect(e, 'effect.niGorilla', 'test');
    expect(handAuraOf(e)).toBe(HAND_AURA_BY_TAG[0]);
    expect(HAND_AURA_BY_TAG[0]!.tag).toBe(TAG_PUMPED);
  });
});

describe('twinCleave — both blades as one', () => {
  it('is ONE window on the blades plus the force arc — no alternating cuts', () => {
    const vols = ZAKE.shape!.hitVolumes!;
    expect(vols.filter((v) => v.kind === 'weaponSegment')).toHaveLength(1);
    expect(vols.some((v) => v.kind === 'arc')).toBe(true);
    expect(ZAKE.shape!.pattern).toBe('twinCleave');
  });

  it('held at the top of the windup: both hands raised on the LEAD side, blades parallel and leaning back; the body faces the aim', () => {
    const { zoro, m, geom } = rig();
    m.t = m.dur * m.phases.windup * 0.9; // deep in the charge-hold
    const pose = swingPose(m, ZAKE.shape!, geom);
    const side = m.side;
    const handAng = Math.atan2(pose.hy, pose.hx);
    expect(rel(handAng, m.angle) * side).toBeCloseTo(1.7, 1); // the lead hand high on the lead side
    expect(pose.off).toBeDefined();
    const offAng = Math.atan2(pose.off!.hy, pose.off!.hx);
    expect(rel(offAng, m.angle) * side).toBeGreaterThan(1.0); // the off hand came ACROSS to the same side, a step inside
    expect(rel(offAng, m.angle) * side).toBeLessThan(rel(handAng, m.angle) * side);
    expect(pose.off!.angle).toBeCloseTo(pose.bladeAngle!, 9); // parallel blades
    expect(rel(pose.bladeAngle!, m.angle) * side).toBeGreaterThan(2.0); // leaning back past the hands
    expect(rel(pose.drawAngle, m.angle) * side).toBeCloseTo(0.5, 6); // the torso wound toward the raise
    const off = weaponAnchor(zoro, -1)!;
    expect(off.x).toBeCloseTo(pose.off!.hx, 6); // the drawn off blade is where the motion put it
    expect(off.angle).toBeCloseTo(pose.off!.angle, 9);
  });

  it('through the active phase the hands cross the WHOLE front: lead side → far side, the torso twisting through', () => {
    const { m, geom } = rig();
    const side = m.side;
    const w = m.phases.windup;
    const a = m.phases.active;
    const at = (f: number) => { m.t = m.dur * (w + a * f); return swingPose(m, ZAKE.shape!, geom); };
    const start = at(0.02);
    const mid = at(0.5);
    const end = at(0.98);
    const ang = (p: { hx: number; hy: number }) => rel(Math.atan2(p.hy, p.hx), m.angle) * side;
    expect(ang(start)).toBeGreaterThan(1.4); // from high on the lead side…
    expect(Math.abs(ang(mid))).toBeLessThan(0.3); // …through the front…
    expect(ang(end)).toBeLessThan(-1.4); // …to the far side
    expect(rel(start.drawAngle, m.angle) * side).toBeGreaterThan(0.3);
    expect(rel(end.drawAngle, m.angle) * side).toBeLessThan(-0.3);
    expect(mid.off!.angle).toBeCloseTo(mid.bladeAngle!, 9); // still parallel mid-cut
  });

  it('settles both hands back to guard by the end of the recovery', () => {
    const { m, geom } = rig();
    m.t = m.dur * 0.999;
    const pose = swingPose(m, ZAKE.shape!, geom);
    expect(Math.abs(rel(pose.bladeAngle!, m.angle))).toBeLessThan(0.1);
    expect(Math.abs(rel(pose.drawAngle, m.angle))).toBeLessThan(0.05);
  });
});
