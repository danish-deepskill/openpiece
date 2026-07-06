import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/Rng';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { Bodies } from '../src/defs/bodies';
import { Races } from '../src/defs/races';
import { Sizes } from '../src/defs/sizes';
import { Units } from '../src/defs/units';

// the RimWorld split: physical = BODY baseline × RACE multiplier × SIZE band.
describe('body × race × size — the three build axes compose', () => {
  it('every unit references a registered body + race + size (no dangling build ids)', () => {
    for (const u of Units.all()) {
      if (u.body) expect(() => Bodies.get(u.body!), `${u.id} body`).not.toThrow();
      if (u.race) expect(() => Races.get(u.race!), `${u.id} race`).not.toThrow();
      if (u.size) expect(() => Sizes.get(u.size!), `${u.id} size`).not.toThrow();
    }
  });

  it('humanoid body + human race + medium size resolves to exactly the body baseline (the identity)', () => {
    const b = Bodies.get('body.humanoid');
    const r = Races.get('race.human');
    const m = Sizes.get('size.medium').mult;
    expect(b.r * r.sizeMul * m).toBe(b.r);
    expect(b.reach * r.reachMul * m).toBe(b.reach);
  });

  it('race and size MULTIPLY the body baseline on size/reach/mass, but size leaves speed alone', () => {
    const world = new World();
    const sp = new Spawner(world, new Rng(1));
    // a large fishman: body.humanoid baseline × race.fishman × size.large on r/reach/mass; speed is race-only
    Units.register({
      id: 'unit.testBigFishman', name: 'Big Fishman', body: 'body.humanoid', race: 'race.fishman', size: 'size.large',
      tier: 'E', faction: 'bandits', aiProfile: 'ai.rusher',
    });
    const e = sp.spawnUnit('unit.testBigFishman', 0, 0);
    const base = Bodies.get('body.humanoid');
    const fm = Races.get('race.fishman');
    const lg = Sizes.get('size.large').mult;
    expect(e.transform!.r).toBeCloseTo(base.r * fm.sizeMul * lg, 5);
    expect(e.mover!.mass).toBeCloseTo(base.mass * fm.massMul * lg, 5);
    expect(e.mover!.speed).toBeCloseTo(base.speed * fm.speedMul, 5); // NOT × size — a big fishman isn't slower
  });

  it('SAME race, DIFFERENT body: a 2-arm and a (hypothetical) quadruped fishman share race stats, differ in rig', () => {
    const world = new World();
    const sp = new Spawner(world, new Rng(1));
    // the whole point of the split: race is the stat bonus, body is the rig. Proven here with cow as the
    // "other body" — a fishman-on-a-cow-body would keep race.fishman's mults but draw as a quadruped.
    Units.register({
      id: 'unit.testFishOnCow', name: 'Fish Cow', body: 'body.cow', race: 'race.fishman',
      tier: 'F', faction: 'wildlife', aiProfile: 'ai.critter',
    });
    const e = sp.spawnUnit('unit.testFishOnCow', 0, 0);
    expect(e.render!.draw).toBe('cow'); // the BODY decides the silhouette…
    expect(e.transform!.r).toBeCloseTo(Bodies.get('body.cow').r * Races.get('race.fishman').sizeMul, 5); // …and race scales it
  });

  it('a missing body/race/size falls back to humanoid/human/medium (spawn never NaNs)', () => {
    const world = new World();
    const sp = new Spawner(world, new Rng(1));
    Units.register({
      id: 'unit.testBare', name: 'Bare', tier: 'F',
      faction: 'bandits', aiProfile: 'ai.rusher',
    });
    const e = sp.spawnUnit('unit.testBare', 0, 0);
    const base = Bodies.get('body.humanoid');
    expect(e.transform!.r).toBe(base.r);
    expect(e.attributes!.get('reach')).toBe(base.reach);
    expect(e.render!.draw).toBe('actor');
  });

  it('the Brawler boss is BIG via race.giant on the plain humanoid body (no special boss rig)', () => {
    const world = new World();
    const sp = new Spawner(world, new Rng(1));
    const brawler = sp.spawnUnit('unit.brawler', 0, 0);
    const thug = sp.spawnUnit('unit.thug', 40, 0); // humanoid body + human race
    expect(brawler.transform!.r).toBeGreaterThan(thug.transform!.r); // giant multiplier towers over fodder
    expect(brawler.render!.draw).toBe('actor'); // SAME humanoid silhouette — big purely from race.giant
  });
});
