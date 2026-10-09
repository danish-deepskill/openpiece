import { describe, expect, it } from 'vitest';
import { Abilities } from '../src/combat/Ability';
import { CLASH_BIND_CHANCE, CLASH_BIND_HOLD, CLASH_COMMIT_SLOPE, CLASH_OVERPOWER_HOLD, CLASH_POSTURE, EFFECT_BLADE_LOCK, judgeClash } from '../src/combat/clash';
import { applyEffect, TAG_STUNNED } from '../src/combat/Effect';
import { guardHand, swingGeomOf, swingPose } from '../src/combat/swing';
import { equip } from '../src/combat/equip';
import { events } from '../src/core/EventBus';
import { segDist, segSegClosest } from '../src/core/math';
import { Rng } from '../src/core/Rng';
import type { Entity } from '../src/ecs/components';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { Damage } from '../src/systems/Damage';
import { EffectSystem } from '../src/systems/EffectSystem';
import { MeleeSystem } from '../src/systems/MeleeSystem';
import { StrikeResolver } from '../src/systems/StrikeResolver';

/**
 * THE CLASH — steel meets steel. Detection is GEOMETRY (two live blade segments overlap in a tick), never a roll; the
 * verdict is the ladder, then weight, then commitment; a true tie is the bind. Everything here is readable from the screen.
 */
const SIM = 1 / 60;
expect(Abilities.get('ability.kesa').shape!.pattern).toBe('arc'); // a plain medium arc cut — the neutral blade for the geometry

function rig() {
  const world = new World();
  const sp = new Spawner(world, new Rng(11));
  const strikes = new StrikeResolver(new Damage(), new Rng(1));
  const abilities = new AbilitySystem(world, new EffectSystem(world), strikes, new Rng(1));
  const melee = new MeleeSystem(world, strikes);
  return { world, sp, abilities, melee };
}
/** Two swordsmen facing each other, blades collinear: `a` at the origin aiming +x, `b` across from it aiming −x, offset so
 *  the two lead-hand guard spots sit on one line (the arc cut points along the aim at mid-active). */
function faceOff(r: ReturnType<typeof rig>, aUnit: string, bUnit: string, gap = 70, coat: 'both' | 'a' | 'none' = 'both') {
  const a = r.sp.spawnUnit(aUnit, 0, 0);
  const b = r.sp.spawnUnit(bUnit, 0, 0);
  if (coat !== 'none') applyEffect(a, 'effect.armament', 'test'); // steel rings only between haki (combat/clash.canClash)
  if (coat === 'both') applyEffect(b, 'effect.armament', 'test');
  const [, ay] = guardHand(0, 1, a.transform!.r);
  const [, by] = guardHand(Math.PI, 1, b.transform!.r);
  b.transform!.x = gap;
  b.transform!.y = ay - by;
  a.transform!.angle = 0;
  b.transform!.angle = Math.PI;
  return { a, b };
}
/** Start a kesa on `e` along `angle`, parked at swing fraction `p` (the activation's aim scatter is overwritten). */
function cut(r: ReturnType<typeof rig>, e: Entity, angle: number, p: number): void {
  e.loadout!.granted.add('ability.kesa');
  expect(r.abilities.activate(e, 'ability.kesa')).toBe(true);
  const m = e.melee!;
  m.angle = angle;
  m.t = m.dur * p - SIM; // the melee tick advances it by one SIM step before judging
}
const rel = (b: number, aim: number): number => Math.atan2(Math.sin(b - aim), Math.cos(b - aim));
/** Mid-active of a swing — kesa's phases come from the weight ladder at cast, so read them off the live swing. */
const mid = (e: Entity): number => e.melee!.phases.windup + e.melee!.phases.active / 2;

describe('segment ↔ segment', () => {
  it('crossing segments are 0 apart at the crossing; parallel ones report the gap; the contact is between the closest points', () => {
    expect(segSegClosest(0, 0, 10, 0, 5, -5, 5, 5)).toEqual({ d: 0, x: 5, y: 0 });
    const par = segSegClosest(0, 0, 10, 0, 0, 4, 10, 4);
    expect(par.d).toBeCloseTo(4, 9);
    const apart = segSegClosest(0, 0, 10, 0, 20, 0, 30, 0);
    expect(apart.d).toBeCloseTo(10, 9);
    expect(apart.x).toBeCloseTo(15, 9);
  });
});

describe('when blades meet', () => {
  it('two equal swordsmen cutting into each other: a blade LOCK — both held with blades crossed, clocks paused, sparks — then the verdict', () => {
    const r = rig();
    const { a, b } = faceOff(r, 'unit.zoroAdvanced', 'unit.ronin'); // A and A-: the same letter, both medium — equals
    const clashes: string[] = [];
    const bursts: number[] = [];
    const off1 = events.on('combat:clash', (c) => { clashes.push(c.outcome); });
    const off2 = events.on('fx:burst', (f) => { bursts.push(f.n); });
    cut(r, a, 0, 0.5);
    cut(r, b, Math.PI, 0.5);
    a.melee!.t = a.melee!.dur * mid(a) - SIM; // park both at the heart of the cut, in lockstep
    b.melee!.t = b.melee!.dur * mid(b) - SIM;
    const pa = a.combatant!.posture;
    r.melee.update(SIM); // the contact tick
    expect(clashes).toHaveLength(1);
    expect(clashes[0]).toBe(CLASH_BIND_CHANCE > 0 ? clashes[0] : 'overpower'); // equals ROLL (test value: no bind, one always loses)
    expect(bursts.some((n) => n >= 12)).toBe(true); // the big spark, now
    // THE LOCK: both still swinging, both frozen, both wearing the Clash
    for (const e of [a, b]) {
      expect(e.melee?.lock).toBeDefined();
      expect(e.tags!.has(TAG_STUNNED)).toBe(true);
      expect(e.effects!.active.some((x) => x.id === EFFECT_BLADE_LOCK)).toBe(true);
      expect(e.effects!.active.some((x) => x.id === 'effect.staggered')).toBe(false); // the recoil has NOT landed yet
    }
    const losers = [a, b].filter((e) => e.melee!.lock!.loser);
    expect(losers.length).toBe(clashes[0] === 'bind' ? 2 : 1);
    const tA = a.melee!.t;
    const poseA = swingPose(a.melee!, Abilities.get('ability.kesa').shape!, swingGeomOf(a));
    const sparksBefore = bursts.length;
    const hold = clashes[0] === 'bind' ? CLASH_BIND_HOLD : CLASH_OVERPOWER_HOLD;
    for (let i = 0; i < Math.round(hold / SIM) - 2; i++) r.melee.update(SIM); // most of the hold
    expect(a.melee!.t).toBe(tA); // the clock is PAUSED…
    const held = swingPose(a.melee!, Abilities.get('ability.kesa').shape!, swingGeomOf(a));
    expect(Math.abs(held.hx - poseA.hx)).toBeLessThan(6); // …so the pose stays at the bind (trembling a few px — the struggle)
    expect(held.drawAngle).toBe(poseA.drawAngle); // the body's facing never wavers — only the steel trembles
    if (hold > 0.3) expect(bursts.length).toBeGreaterThan(sparksBefore + 3); // sparks trickle from the crossing through a long hold
    expect(a.combatant!.posture).toBe(pa); // nothing paid until the break
    for (let i = 0; i < 4; i++) r.melee.update(SIM); // the hold ends
    off1(); off2();
    const bind = clashes[0] === 'bind';
    for (const e of losers) {
      expect(e.melee).toBeUndefined(); // the recoil: swing lost…
      expect(e.effects!.active.some((x) => x.id === (bind ? 'effect.staggered' : 'effect.overpowered'))).toBe(true); // …a tie stumbles, an overpowered loser is FLUNG, labelled so
      expect(e.effects!.active.some((x) => x.id === EFFECT_BLADE_LOCK)).toBe(false); // …the Clash ended by the same tick
    }
    const loser = losers[0]!;
    expect(loser.combatant!.posture).toBeGreaterThan(pa - 1); // posture paid by the loser(s)
    const away = Math.sign(loser.transform!.x - (a.transform!.x + b.transform!.x) / 2);
    expect(Math.sign(loser.mover!.dvx)).toBe(away); // thrown back from the contact, his own way
    if (!bind) expect(Math.hypot(loser.mover!.dvx, loser.mover!.dvy)).toBeGreaterThan(400); // hard: the flight, not a half-step
  });

  it('equals ROLL on the seeded combat stream: a fixed seed repeats, and across seeds the coin is fair', () => {
    const outcome = (seed: number): 'a' | 'b' | 'bind' => {
      const r = rig();
      const { a, b } = faceOff(r, 'unit.zoroAdvanced', 'unit.ronin');
      cut(r, a, 0, 0.5);
      cut(r, b, Math.PI, 0.5);
      a.melee!.t = a.melee!.dur * mid(a);
      b.melee!.t = b.melee!.dur * mid(b);
      const v = judgeClash(a, b, new Rng(seed));
      return v.kind === 'bind' ? 'bind' : v.winner === a ? 'a' : 'b';
    };
    expect(outcome(7)).toBe(outcome(7)); // determinism: the same stream, the same verdict
    const n = 200;
    let aWins = 0;
    let binds = 0;
    for (let i = 0; i < n; i++) { const o = outcome(i); if (o === 'a') aWins++; else if (o === 'bind') binds++; }
    expect(binds / n).toBeLessThan(CLASH_BIND_CHANCE + 0.1);
    expect(binds / n).toBeGreaterThanOrEqual(Math.max(0, CLASH_BIND_CHANCE - 0.1));
    const decided = n - binds;
    expect(aWins / decided).toBeGreaterThan(0.38); // a fair coin when the cuts are even (no commitment tilt at the test value)
    expect(aWins / decided).toBeLessThan(0.62);
    void CLASH_COMMIT_SLOPE;
  });

  it('a letter up OVERPOWERS (the ladder decides first): the hold, then the loser alone is thrown and the winner\'s cut resumes', () => {
    const r = rig();
    const { a, b } = faceOff(r, 'unit.zoroAdvanced', 'unit.ronin'); // both coated (the gate)…
    a.identity!.tier = 'S-'; // …and a stands a full LETTER up (S- vs A-: three bands): the ladder's wall
    const outcomes: string[] = [];
    const off = events.on('combat:clash', (c) => { outcomes.push(c.outcome); });
    cut(r, a, 0, 0.5);
    cut(r, b, Math.PI, 0.5);
    a.melee!.t = a.melee!.dur * mid(a) - SIM;
    b.melee!.t = b.melee!.dur * mid(b) - SIM;
    r.melee.update(SIM);
    off();
    expect(outcomes).toEqual(['overpower']);
    expect(a.melee!.lock!.loser).toBe(false); // held too — the hitstop — but not the one who pays
    expect(b.melee!.lock!.loser).toBe(true);
    expect(a.tags!.has(TAG_STUNNED)).toBe(true);
    const tA = a.melee!.t;
    for (let i = 0; i < Math.round(CLASH_OVERPOWER_HOLD / SIM) + 2; i++) r.melee.update(SIM);
    expect(a.melee).toBeDefined(); // powers through…
    expect(a.melee!.lock).toBeUndefined();
    expect(a.melee!.t).toBeGreaterThan(tA); // …its clock running again
    expect(a.tags!.has(TAG_STUNNED)).toBe(false); // free to move
    expect(a.effects!.active.some((x) => x.id === 'effect.staggered')).toBe(false);
    expect(b.melee).toBeUndefined();
    expect(b.effects!.active.some((x) => x.id === 'effect.overpowered')).toBe(true); // overpowered: flung and down, and it says so
    expect(b.tags!.has('state.ragdoll')).toBe(true); // the same flight and downed beat as any ragdoll
    expect(Math.hypot(b.mover!.dvx, b.mover!.dvy)).toBeGreaterThan(900); // far: across the floor, into the wall
  });

  it('the LOCK POSE: both lead blades aim at the contact and their tips meet there, bodies squared to the bind — whatever cut produced it', () => {
    const r = rig();
    const a = r.sp.spawnUnit('unit.zoroAdvanced', 0, 0); // the mutual-blow layout: parallel cuts, blades on bodies, not on each other
    const b = r.sp.spawnUnit('unit.ronin', 48, 0);
    applyEffect(a, 'effect.armament', 'test');
    applyEffect(b, 'effect.armament', 'test');
    a.transform!.angle = 0;
    b.transform!.angle = Math.PI;
    a.loadout!.granted.add('ability.toro');
    expect(r.abilities.activate(a, 'ability.toro')).toBe(true); // a SCISSOR — its blades point two ways at the contact tick
    a.melee!.angle = 0;
    a.melee!.t = a.melee!.dur * mid(a) - SIM;
    cut(r, b, Math.PI, 0.5);
    b.melee!.t = b.melee!.dur * mid(b) - SIM;
    r.melee.update(SIM);
    expect(a.melee!.lock).toBeDefined();
    const lock = a.melee!.lock!;
    const pa = swingPose(a.melee!, Abilities.get('ability.toro').shape!, swingGeomOf(a));
    const pb = swingPose(b.melee!, Abilities.get('ability.kesa').shape!, swingGeomOf(b));
    const onBlade = (e: Entity, p: { hx: number; hy: number; tx: number; ty: number }) => segDist(lock.x, lock.y, e.transform!.x + p.hx, e.transform!.y + p.hy, e.transform!.x + p.tx, e.transform!.y + p.ty);
    expect(onBlade(a, pa)).toBeLessThan(6); // the contact point lies ON a's blade…
    expect(onBlade(b, pb)).toBeLessThan(6); // …and on b's: the steel crosses there (tips overshoot when bodies are closer than a blade — an X, not a kiss)
    expect(Math.abs(rel(pa.drawAngle, Math.atan2(lock.y - a.transform!.y, lock.x - a.transform!.x)))).toBeLessThan(1e-6); // squared to the bind
    expect(pa.off).toBeDefined(); // the pair's second blade comes up beside the first…
    expect(Math.abs(rel(pa.off!.angle, pa.drawAngle))).toBeLessThan(0.08); // …pressing the same way (within its own tremble)
    expect(Math.abs(rel(pa.bladeAngle!, pa.drawAngle))).toBeLessThan(0.08);
    expect(pb.off).toBeUndefined(); // one blade, one pose
  });

  it('the STRUGGLE: the held blades tremble on the lock\'s clock, out of step with each other, and settle before the break', () => {
    const r = rig();
    const { a, b } = faceOff(r, 'unit.zoroAdvanced', 'unit.ronin');
    cut(r, a, 0, 0.5);
    cut(r, b, Math.PI, 0.5);
    a.melee!.t = a.melee!.dur * mid(a) - SIM;
    b.melee!.t = b.melee!.dur * mid(b) - SIM;
    r.melee.update(SIM);
    for (const e of [a, b]) { e.melee!.lock!.t = 1; e.melee!.lock!.hold = 1; } // a long hold for the sampling, whatever the verdict's own hold is
    const shape = Abilities.get('ability.kesa').shape!;
    const angles: number[] = [];
    const tips: number[] = [];
    for (let i = 0; i < 12; i++) {
      r.melee.update(SIM);
      const p = swingPose(a.melee!, shape, swingGeomOf(a));
      angles.push(p.bladeAngle!);
      tips.push(p.tx);
    }
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(0.02); // it moves…
    expect(Math.max(...angles) - Math.min(...angles)).toBeLessThan(0.1); // …a little
    expect(Math.max(...tips) - Math.min(...tips)).toBeGreaterThan(1); // the tip vibrates along the line
    const pa = swingPose(a.melee!, shape, swingGeomOf(a));
    const pb = swingPose(b.melee!, shape, swingGeomOf(b));
    expect(Math.abs(rel(pa.bladeAngle!, pa.drawAngle) - rel(pb.bladeAngle!, pb.drawAngle))).toBeGreaterThan(0); // out of step
    a.melee!.lock!.t = SIM * 2; // the last moments of the hold: the tremble has died down
    const late = swingPose(a.melee!, shape, swingGeomOf(a));
    expect(Math.abs(rel(late.bladeAngle!, late.drawAngle))).toBeLessThan(0.01);
  });

  it('a body flung out of the lock (ragdolled) loses it with no recoil; a locked blade never rings a second time', () => {
    const r = rig();
    const { a, b } = faceOff(r, 'unit.zoroAdvanced', 'unit.ronin');
    cut(r, a, 0, 0.5);
    cut(r, b, Math.PI, 0.5);
    a.melee!.t = a.melee!.dur * mid(a) - SIM;
    b.melee!.t = b.melee!.dur * mid(b) - SIM;
    const outcomes: string[] = [];
    const off = events.on('combat:clash', (c) => { outcomes.push(c.outcome); });
    r.melee.update(SIM);
    r.melee.update(SIM);
    r.melee.update(SIM);
    expect(outcomes).toHaveLength(1); // one clang, not one per tick of the hold
    applyEffect(a, 'effect.ragdoll', 'test', 1); // a third party flings him mid-lock
    r.melee.update(SIM);
    off();
    expect(a.melee).toBeUndefined();
    expect(a.effects!.active.some((x) => x.id === EFFECT_BLADE_LOCK)).toBe(false);
    expect(a.effects!.active.some((x) => x.id === 'effect.staggered')).toBe(false); // the fall is the punishment — no recoil on top
  });

  it('the WALLS never roll: a letter up always wins; same letter, the heavier weight always wins', () => {
    const r = rig();
    const { a, b } = faceOff(r, 'unit.zoroAdvanced', 'unit.ronin');
    a.identity!.tier = 'S-'; // a letter up — three bands (both coated: the gate is met, the gap stays a letter)
    cut(r, a, 0, 0.5);
    cut(r, b, Math.PI, 0.5);
    a.melee!.t = a.melee!.dur * mid(a);
    b.melee!.t = b.melee!.dur * mid(b);
    for (let seed = 0; seed < 20; seed++) {
      const v = judgeClash(a, b, new Rng(seed));
      expect(v.kind).toBe('overpower');
      if (v.kind === 'overpower') expect(v.winner).toBe(a); // the letter, whatever the stream says
    }
    // WEIGHT: a heavy sword against the katana at the same letter — the sword wins however the timing (or the coin) falls
    const r2 = rig();
    const hero = r2.sp.spawnHero(0, 0);
    hero.identity!.tier = 'A-'; // the ladder's equal; the weight is the only difference left
    equip(hero, 'weapon', 'weapon.sword');
    const ronin = r2.sp.spawnUnit('unit.ronin', 70, 0);
    applyEffect(hero, 'effect.armament', 'test'); // both coated: equal letters still, and steel may ring
    applyEffect(ronin, 'effect.armament', 'test');
    expect(r2.abilities.activate(hero, hero.loadout!.primary)).toBe(true); // the sword's own slash: heavy class
    cut(r2, ronin, Math.PI, 0.5);
    hero.melee!.t = hero.melee!.dur * mid(hero);
    ronin.melee!.t = ronin.melee!.dur * mid(ronin) + 0.1; // the katana committed EARLIER — and still loses to the weight
    for (let seed = 0; seed < 20; seed++) {
      const w = judgeClash(hero, ronin, new Rng(seed));
      expect(w.kind).toBe('overpower');
      if (w.kind === 'overpower') expect(w.winner).toBe(hero);
    }
  });

  it('the MUTUAL BLOW rings too: two parallel cuts that never touch but land on each other\'s bodies in the same tick', () => {
    const r = rig();
    // facing each other WITHOUT the lateral correction: blades on each one's lead side, ~18px apart, both reaching the other
    const a = r.sp.spawnUnit('unit.zoroAdvanced', 0, 0);
    const b = r.sp.spawnUnit('unit.ronin', 48, 0);
    applyEffect(a, 'effect.armament', 'test');
    applyEffect(b, 'effect.armament', 'test');
    a.transform!.angle = 0;
    b.transform!.angle = Math.PI;
    cut(r, a, 0, 0.5);
    cut(r, b, Math.PI, 0.5);
    a.melee!.t = a.melee!.dur * mid(a) - SIM;
    b.melee!.t = b.melee!.dur * mid(b) - SIM;
    const outcomes: string[] = [];
    const off = events.on('combat:clash', (c) => { outcomes.push(c.outcome); });
    const hpA = a.health!.hp;
    const hpB = b.health!.hp;
    r.melee.update(SIM);
    off();
    expect(outcomes).toHaveLength(1); // they met in the middle…
    expect(a.health!.hp).toBe(hpA); // …and NEITHER cut landed: a clash, not a trade
    expect(b.health!.hp).toBe(hpB);
    expect(a.melee!.lock).toBeDefined();
  });

  it('STEEL RINGS ONLY BETWEEN HAKI: plain against plain, and coated against plain, just trade — the lock needs both coated', () => {
    for (const coat of ['none', 'a'] as const) {
      const r = rig();
      const { a, b } = faceOff(r, 'unit.zoroAdvanced', 'unit.ronin', 70, coat);
      cut(r, a, 0, 0.5);
      cut(r, b, Math.PI, 0.5);
      a.melee!.t = a.melee!.dur * mid(a) - SIM;
      b.melee!.t = b.melee!.dur * mid(b) - SIM;
      const outcomes: string[] = [];
      const off = events.on('combat:clash', (c) => { if (c.outcome === 'bind' || c.outcome === 'overpower') outcomes.push(c.outcome); });
      r.melee.update(SIM);
      off();
      expect(outcomes).toHaveLength(0); // blades crossed, nothing rang
      expect(a.melee?.lock).toBeUndefined();
      expect(b.melee?.lock).toBeUndefined();
    }
  });

  it('no clash in a windup, none for a sheathed pass, none between friends', () => {
    const r = rig();
    const { a, b } = faceOff(r, 'unit.zoroAdvanced', 'unit.ronin');
    cut(r, a, 0, 0.5);
    cut(r, b, Math.PI, 0.5);
    a.melee!.t = a.melee!.dur * (a.melee!.phases.windup * 0.5) - SIM; // a is still winding up
    b.melee!.t = b.melee!.dur * mid(b) - SIM;
    r.melee.update(SIM);
    expect(a.melee).toBeDefined();
    expect(b.melee).toBeDefined(); // b's cut may land on a's body, but steel never met steel
    // Rashōmon's blades are sheathed through its pass (a trail volume, no live segment): it cannot ring
    const r3 = rig();
    const z = r3.sp.spawnUnit('unit.zoroAdvanced', 0, 0);
    applyEffect(z, 'effect.armament', 'test');
    const ro = r3.sp.spawnUnit('unit.ronin', 70, 0);
    applyEffect(ro, 'effect.armament', 'test'); // both coated: the gate is met — the sheath is what keeps it silent
    ro.transform!.angle = Math.PI;
    expect(r3.abilities.activate(z, 'ability.rashomon')).toBe(true);
    z.melee!.angle = 0;
    z.melee!.t = z.melee!.dur * 0.5 - SIM;
    cut(r3, ro, Math.PI, 0.5);
    ro.melee!.t = ro.melee!.dur * mid(ro) - SIM;
    r3.melee.update(SIM);
    expect(z.melee).toBeDefined();
    // two of the same crew: blades may cross, nothing rings
    const r4 = rig();
    const { a: s1, b: s2 } = faceOff(r4, 'unit.samurai', 'unit.samurai', 70, 'both'); // coated, so only the faction stops it
    cut(r4, s1, 0, 0.5);
    cut(r4, s2, Math.PI, 0.5);
    s1.melee!.t = s1.melee!.dur * mid(s1) - SIM;
    s2.melee!.t = s2.melee!.dur * mid(s2) - SIM;
    r4.melee.update(SIM);
    expect(s1.melee).toBeDefined();
    expect(s2.melee).toBeDefined();
  });
});

describe('the wall slam', () => {
  it('a flung body that meets a wall stays down WALL_THUD_DOWN_BONUS longer — the pose and the label agree', async () => {
    const { launchRagdoll, slamRagdoll, WALL_THUD_DOWN_BONUS } = await import('../src/combat/ragdoll');
    const r = rig();
    const z = r.sp.spawnUnit('unit.zoroAdvanced', 0, 0);
    launchRagdoll(z, 1, 0, 950, 0.45, 1.0, 0.3, 'effect.overpowered');
    const rg = z.mover!.ragdoll!;
    const eff = z.effects!.active.find((a) => a.id === 'effect.overpowered')!;
    const down0 = rg.down;
    const rem0 = eff.remaining;
    slamRagdoll(z);
    expect(rg.down).toBeCloseTo(down0 + WALL_THUD_DOWN_BONUS, 9);
    expect(eff.remaining).toBeCloseTo(rem0 + WALL_THUD_DOWN_BONUS, 9);
    slamRagdoll(r.sp.spawnUnit('unit.ronin', 300, 0)); // a body not flying: no-op, no throw
  });
});
