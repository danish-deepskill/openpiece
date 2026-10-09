import { describe, expect, it } from 'vitest';
import { Abilities, abilityProblem } from '../src/combat/Ability';
import { applyEffect } from '../src/combat/Effect';
import { Rng } from '../src/core/Rng';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { Damage } from '../src/systems/Damage';
import { EffectSystem } from '../src/systems/EffectSystem';
import { HazardSystem } from '../src/systems/HazardSystem';
import { StrikeResolver } from '../src/systems/StrikeResolver';

/**
 * GROUND HAZARDS — Samon's scored X is a zone that keeps cutting: left where the blades were the tick the cut closes, ticking
 * on its own clock through the owner's strike path, at most N hits per body, gone when its life ends or its owner is.
 */
const SIM = 1 / 60;
const SAMON = Abilities.get('ability.samon');

function rig() {
  const world = new World();
  const sp = new Spawner(world, new Rng(8));
  const strikes = new StrikeResolver(new Damage(), new Rng(1));
  const abilities = new AbilitySystem(world, new EffectSystem(world), strikes, new Rng(1));
  const hazards = new HazardSystem(world, strikes);
  const zoro = sp.spawnUnit('unit.zoroAdvanced', 0, 0);
  return { world, sp, abilities, hazards, zoro };
}
/** Swing Samon and run the ability clock to just past the cut — the zone appears; returns it. */
function leaveX(r: ReturnType<typeof rig>) {
  const { abilities, zoro, world } = r;
  expect(abilities.activate(zoro, 'ability.samon')).toBe(true);
  const m = zoro.melee!;
  expect(world.with('hazard').length).toBe(0);
  m.t = m.dur * (m.phases.windup + m.phases.active) + 1e-6;
  abilities.update(SIM);
  const zones = world.with('hazard', 'transform');
  expect(zones).toHaveLength(1);
  return { zone: zones[0]!, m };
}
const run = (hazards: HazardSystem, seconds: number) => { for (let i = 0; i < Math.round(seconds / SIM); i++) hazards.update(SIM); };

describe('the zone is left where the blades were, once, shaped by the row', () => {
  it('spawns the tick the active phase closes: two strokes at ±0.65 off the committed aim, a blade\'s reach ahead, the owner\'s theme', () => {
    const r = rig();
    applyEffect(r.zoro, 'effect.armament', 'test'); // coated → the mark is cut black
    const { zone, m } = leaveX(r);
    const h = zone.hazard!;
    expect(h.owner).toBe(r.zoro.id);
    expect(h.ability).toBe('ability.samon');
    expect(h.strokes.map((s) => s.angle - m.angle).map((a) => Math.round(a * 100) / 100)).toEqual([-0.65, 0.65]);
    expect(Math.hypot(zone.transform!.x, zone.transform!.y)).toBeGreaterThan(20); // ahead of him, not under him
    expect(h.theme).toBe('haki');
    expect(h.maxHits).toBe(3);
    r.abilities.update(SIM); // the clock keeps running…
    expect(r.world.with('hazard').length).toBe(1); // …one zone per swing (latched)
  });

  it('validates the spec: a hazard needs a melee swing, strokes, positive numbers, an integer cap', () => {
    expect(abilityProblem(SAMON)).toBeNull();
    const h = SAMON.hazard!;
    expect(abilityProblem({ ...SAMON, hazard: { ...h, strokes: [] } })).toMatch(/stroke/);
    expect(abilityProblem({ ...SAMON, hazard: { ...h, maxHits: 2.5 } })).toMatch(/maxHits/);
    expect(abilityProblem({ ...SAMON, hazard: { ...h, life: 0 } })).toMatch(/life/);
    expect(abilityProblem({ ...SAMON, shape: undefined })).toMatch(/melee/);
  });
});

describe('standing in it keeps cutting — up to three times; step off and it stops', () => {
  it('a body on a stroke takes a hit every tick, capped at maxHits; a body beside the X takes none', () => {
    const r = rig();
    const { zone } = leaveX(r);
    const h = zone.hazard!;
    const zt = zone.transform!;
    const st = h.strokes[0]!;
    const on = r.sp.spawnUnit('unit.dummy', zt.x + Math.cos(st.angle) * 20, zt.y + Math.sin(st.angle) * 20); // 20px along a stroke
    const perp = st.angle + Math.PI / 2;
    const off = r.sp.spawnUnit('unit.dummy', zt.x + Math.cos(perp) * 60, zt.y + Math.sin(perp) * 60); // 60px beside it
    const hp0 = on.health!.hp;
    const hpOff = off.health!.hp;
    run(r.hazards, h.tickEvery * 0.9);
    expect(on.health!.hp).toBe(hp0); // the first tick has not come yet
    run(r.hazards, h.tickEvery * 0.2);
    const afterOne = on.health!.hp;
    expect(afterOne).toBeLessThan(hp0); // tick one
    run(r.hazards, h.tickEvery * 2);
    const afterThree = on.health!.hp;
    expect(afterThree).toBeLessThan(afterOne);
    expect(h.hits[String(on.id)]).toBe(3);
    run(r.hazards, h.tickEvery);
    expect(on.health!.hp).toBe(afterThree); // capped: no fourth cut
    expect(off.health!.hp).toBe(hpOff); // beside the X: untouched
    const mean = (hp0 - afterThree) / 3;
    expect(Math.abs(hp0 - afterOne - mean)).toBeLessThan(mean * 0.1); // three ticks of the same share (the resolver's per-hit spread aside)
  });

  it('expires at the end of its life; lapses at once if its owner is gone', () => {
    const r = rig();
    const { zone } = leaveX(r);
    run(r.hazards, zone.hazard!.maxLife + SIM);
    expect(r.world.with('hazard').length).toBe(0);
    const r2 = rig();
    leaveX(r2);
    r2.world.destroy(r2.zoro);
    run(r2.hazards, r2.world.with('hazard')[0]!.hazard!.tickEvery + SIM);
    expect(r2.world.with('hazard').length).toBe(0);
  });
});
