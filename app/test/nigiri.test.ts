import { describe, expect, it } from 'vitest';
import { Abilities, abilityProblem } from '../src/combat/Ability';
import { segmentOf, strikeFrameOf, volumeHits, type StrikeFrame } from '../src/combat/hitVolume';
import { swingGeomOf, swingPose, TWO_HAND_MOTIONS } from '../src/combat/swing';
import { events, type SwingFx } from '../src/core/EventBus';
import { Rng } from '../src/core/Rng';
import type { Entity } from '../src/ecs/components';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { EffectSystem } from '../src/systems/EffectSystem';
import type { StrikeResolver } from '../src/systems/StrikeResolver';

/**
 * NIGIRI — three double cuts, three SHAPES, both blades hitting. The constraints the overhaul was built to:
 *  (1) each step identifiable from a paused frame by the blades alone; (2) no two share a hit silhouette; (3) both drawn
 *  blades hit, as two half shares; (4) short · short · held; (5) the finisher leaves a mark; (6) the thrust's points converge.
 */
const TORO = Abilities.get('ability.toro');
const HIRAMEKI = Abilities.get('ability.hirameki');
const SAMON = Abilities.get('ability.samon');
const rel = (b: number, aim: number): number => Math.atan2(Math.sin(b - aim), Math.cos(b - aim));

function rig() {
  const world = new World();
  const sp = new Spawner(world, new Rng(6));
  const abilities = new AbilitySystem(world, new EffectSystem(world), {} as StrikeResolver, new Rng(1)); // contact never resolves here
  return { world, sp, abilities, zoro: sp.spawnUnit('unit.zoroAdvanced', 0, 0) };
}
/** Start `id` on a fresh Zoro and pose it at swing fraction `p`. */
function poseAt(id: string, p: number) {
  const { abilities, zoro } = rig();
  expect(abilities.activate(zoro, id)).toBe(true);
  const m = zoro.melee!;
  m.t = m.dur * p;
  const d = Abilities.get(id);
  return { zoro, m, d, pose: swingPose(m, d.shape!, swingGeomOf(zoro)) };
}
const spreadOf = (p: { bladeAngle?: number; off?: { angle: number } }, aim: number, side: number) => ({
  lead: rel(p.bladeAngle!, aim) * side,
  off: rel(p.off!.angle, aim) * side,
});

describe('(3) both blades hit — the off-blade segment', () => {
  it('an off-hand segment tests the OFF blade; without an off blade in the frame it hits nothing', () => {
    const base: StrikeFrame = { x: 0, y: 0, handX: 0, handY: 10, tipX: 40, tipY: 10, aim: 0, swingAngle: 0, segmentHalfW: 3, fromX: 0, fromY: 0 };
    const withOff: StrikeFrame = { ...base, off: { handX: 0, handY: -10, tipX: 40, tipY: -10 } };
    const lead = { kind: 'weaponSegment' } as const;
    const off = { kind: 'weaponSegment', hand: 'off' } as const;
    expect(volumeHits(lead, withOff, 20, 10, 2)).toBe(true);
    expect(volumeHits(lead, withOff, 20, -10, 2)).toBe(false); // the lead blade is not over there…
    expect(volumeHits(off, withOff, 20, -10, 2)).toBe(true); // …the off blade is
    expect(volumeHits(off, base, 20, -10, 2)).toBe(false); // no off blade posed: nothing to hit with
    expect(segmentOf(off, base)).toBeUndefined();
    expect(segmentOf(off, withOff)).toEqual([0, -10, 40, -10]);
  });

  it('a two-hand pose puts the off blade into the strike frame at the weapon\'s length; the rows carry two half shares', () => {
    const { zoro, m, d, pose } = poseAt('ability.toro', 0.5);
    const f = strikeFrameOf(zoro, m, d, pose);
    expect(f.off).toBeDefined();
    expect(Math.hypot(f.off!.tipX - f.off!.handX, f.off!.tipY - f.off!.handY)).toBeCloseTo(36, 6); // the pair's blade length
    for (const row of [TORO, HIRAMEKI, SAMON]) {
      const vols = row.shape!.hitVolumes!;
      expect(vols.map((v) => (v.kind === 'weaponSegment' ? v.hand ?? 'lead' : v.kind))).toEqual(['lead', 'off']);
      for (const v of vols) expect(v.damageMul).toBeLessThan(1); // a share each, not a full cut each
      expect(TWO_HAND_MOTIONS.has(row.shape!.pattern!)).toBe(true);
    }
  });

  it('refuses an off-blade segment on a one-hand pattern (it would never hit)', () => {
    expect(abilityProblem({ ...TORO, shape: { ...TORO.shape!, pattern: 'arc' } })).toMatch(/two-hand/);
    expect(abilityProblem(TORO)).toBeNull();
  });
});

describe('(1)(2) three shapes, readable from a still frame', () => {
  it('Tōrō CLOSES: blades wide at the start of the cut, a hair apart at its end, mirrored about the aim', () => {
    const w = TORO.shape!.phases!.windup;
    const a = TORO.shape!.phases!.active;
    const start = poseAt('ability.toro', w + a * 0.02);
    const end = poseAt('ability.toro', w + a * 0.98);
    const s0 = spreadOf(start.pose, start.m.angle, start.m.side);
    const s1 = spreadOf(end.pose, end.m.angle, end.m.side);
    expect(s0.lead).toBeGreaterThan(0.8); // wide…
    expect(s0.off).toBeLessThan(-0.8); // …on both sides
    expect(s1.lead).toBeLessThan(0.15); // closed to the front
    expect(s1.off).toBeGreaterThan(-0.15);
    expect(s1.lead).toBeGreaterThan(0); // never crossing
    expect(start.pose.drawAngle).toBeCloseTo(start.m.angle, 9); // the body stays square to the target
  });

  it('Samon OPENS: crossed-tight at the start of the cut, wide at its end — the opposite silhouette', () => {
    const w = SAMON.shape!.phases!.windup;
    const a = SAMON.shape!.phases!.active;
    const start = poseAt('ability.samon', w + a * 0.02);
    const end = poseAt('ability.samon', w + a * 0.98);
    const s0 = spreadOf(start.pose, start.m.angle, start.m.side);
    const s1 = spreadOf(end.pose, end.m.angle, end.m.side);
    expect(s0.lead).toBeLessThan(0.15);
    expect(s1.lead).toBeGreaterThan(0.85);
    expect(s1.off).toBeLessThan(-0.85);
  });

  it('(6) Hirameki THRUSTS: both hands shoot forward side by side and the tips CONVERGE — narrower than the hands', () => {
    const w = HIRAMEKI.shape!.phases!.windup;
    const a = HIRAMEKI.shape!.phases!.active;
    const cocked = poseAt('ability.hirameki', w * 0.95);
    const out = poseAt('ability.hirameki', w + a * 0.98);
    const fwd = (p: { hx: number; hy: number }, aim: number) => Math.cos(aim) * p.hx + Math.sin(aim) * p.hy;
    expect(fwd(out.pose, out.m.angle)).toBeGreaterThan(fwd(cocked.pose, cocked.m.angle) + 10); // the lunge
    const f = strikeFrameOf(out.zoro, out.m, out.d, out.pose);
    const handGap = Math.hypot(f.handX - f.off!.handX, f.handY - f.off!.handY);
    const tipGap = Math.hypot(f.tipX - f.off!.tipX, f.tipY - f.off!.tipY);
    expect(tipGap).toBeLessThan(handGap * 0.6); // the points pinch together
    expect(Math.abs(rel(out.pose.bladeAngle!, out.m.angle))).toBeLessThan(0.2); // near-parallel, not a scissor
  });
});

describe('(4)(5) the rhythm and the mark', () => {
  it('short · short · held: the finisher is the slow, charge-held one with the posture; the chain links in order', () => {
    expect(TORO.comboNext).toBe('ability.hirameki');
    expect(HIRAMEKI.comboNext).toBe('ability.samon');
    expect(SAMON.comboNext).toBeUndefined();
    expect(SAMON.shape!.swingTime!).toBeGreaterThan(Math.max(TORO.shape!.swingTime!, HIRAMEKI.shape!.swingTime!) * 1.3);
    expect(SAMON.shape!.chargeHold).toBe(true);
    expect(SAMON.posture).toBeGreaterThan(TORO.posture ?? 0);
  });

  it('each step emits its own visual: two mirrored crescents (scissors), one thrust line (flash), and Samon scores the X', () => {
    const emitted = (id: string): SwingFx[] => {
      const { abilities, zoro } = rig();
      const seen: SwingFx[] = [];
      const off = events.on('fx:swing', (fx) => { seen.push(fx); });
      expect(abilities.activate(zoro, id)).toBe(true);
      off();
      return seen;
    };
    const toro = emitted('ability.toro');
    expect(toro.filter((f) => f.type === 'melee')).toHaveLength(2);
    expect(toro.filter((f) => f.type === 'melee' && f.mirror).length).toBe(1); // one sweeps each way: they meet
    const hirameki = emitted('ability.hirameki');
    expect(hirameki.map((f) => f.type)).toEqual(['thrust']);
    const samon = emitted('ability.samon');
    expect(samon.filter((f) => f.type === 'melee')).toHaveLength(2);
    expect(samon.some((f) => f.type === 'trail')).toBe(false); // the X is no longer a drawing: it is a HAZARD entity (test/hazard)
    expect(SAMON.hazard).toBeDefined();
    expect(TORO.hazard).toBeUndefined(); // only the finisher marks the ground
  });

  it('Samon FOLLOWS THROUGH: after the cut both blades carry on way back past the shoulders, the hands swinging back with them', () => {
    const w = SAMON.shape!.phases!.windup;
    const a = SAMON.shape!.phases!.active;
    const cutEnd = poseAt('ability.samon', w + a * 0.98);
    const carried = poseAt('ability.samon', w + a + (1 - w - a) * 0.45); // the end of the follow-through
    const home = poseAt('ability.samon', 0.999);
    const sEnd = spreadOf(cutEnd.pose, cutEnd.m.angle, cutEnd.m.side);
    const sCar = spreadOf(carried.pose, carried.m.angle, carried.m.side);
    expect(sCar.lead).toBeGreaterThan(2.2); // way back — past the cut's 0.95…
    expect(sCar.off).toBeLessThan(-2.2); // …on both sides
    expect(sCar.lead).toBeGreaterThan(sEnd.lead + 1);
    const fwd = (p: { hx: number; hy: number }, aim: number) => Math.cos(aim) * p.hx + Math.sin(aim) * p.hy;
    expect(fwd(carried.pose, carried.m.angle)).toBeLessThan(fwd(cutEnd.pose, cutEnd.m.angle) - 5); // the hands went back with the blades
    expect(Math.abs(spreadOf(home.pose, home.m.angle, home.m.side).lead)).toBeLessThan(0.1); // and everything comes home
    expect(Math.abs(rel(home.pose.off!.angle, home.m.angle))).toBeLessThan(0.1);
  });
});

describe('the drawn off blade is the tested off blade', () => {
  it('strikeFrame.off matches where the renderer anchors the off-hand sprite', async () => {
    const { weaponAnchor } = await import('../src/draw/actorDraws');
    const { zoro, m, d, pose } = poseAt('ability.samon', 0.6);
    const f = strikeFrameOf(zoro, m, d, pose);
    const a = weaponAnchor(zoro as Entity, -1)!;
    expect(a.x).toBeCloseTo(f.off!.handX, 6);
    expect(a.y).toBeCloseTo(f.off!.handY, 6);
    expect(a.angle).toBeCloseTo(Math.atan2(f.off!.tipY - f.off!.handY, f.off!.tipX - f.off!.handX), 6);
  });
});
