import { describe, expect, it } from 'vitest';
import { ARENA, TILE } from '../src/config/constants';
import { Rng } from '../src/core/Rng';
import { factions } from '../src/defs/factions';
import { structureProblem, Structures } from '../src/defs/structures';
import { Units } from '../src/defs/units';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { Verbs, type VerbCtx } from '../src/systems/InteractionSystem';
import { placeStructure } from '../src/world/StructureIndex';
import { generateLevel } from '../src/world/WorldGen';

/**
 * THE DUEL GONG — a summoner structure: its roster is DATA on the def (structures.json `summon`), the verb is one rule
 * for every summoner, the instance remembers who it rang for. The arena's duel starts when someone is there to watch
 * it, and can be rung again once it's over.
 */

const summon = Verbs.find((v) => v.id === 'verb.summon')!;

function arena() {
  const world = new World();
  const level = generateLevel(new Rng(0));
  const rec = level.structures.find((s) => s.def === 'structure.duelGong')!;
  const gong = placeStructure(world, level.grid.structures, rec.def, rec.tx, rec.ty);
  const sp = new Spawner(world, new Rng(2));
  const hero = sp.spawnHero(gong.transform!.x, gong.transform!.y + 30);
  const ctx = { world, spawner: sp } as unknown as VerbCtx; // the verb reads the world + the spawner only
  const units = () => world.with('ai', 'identity').filter((e) => e.identity.name !== 'You');
  return { world, level, rec, gong, sp, hero, ctx, units };
}

describe('the def: a roster in data', () => {
  it('names the two duelists at mirrored offsets, both real units — and an empty roster is refused', () => {
    const d = Structures.get('structure.duelGong');
    expect(d.summon).toEqual([
      { unit: 'unit.zoroAdvanced', dx: -4, dy: 3 },
      { unit: 'unit.ronin', dx: 4, dy: 3 },
    ]);
    for (const r of d.summon!) expect(Units.has(r.unit)).toBe(true);
    expect(structureProblem(d)).toBeNull();
    expect(structureProblem({ ...d, summon: [] })).toMatch(/at least one/); // judged pure — never registered (a planted bad row poisons later lookups)
  });
});

describe('worldgen: the gong, not the duelists, is placed', () => {
  it('one gong just inside the north gap, a training post beside it; nobody stands in the ring at world-gen', () => {
    const level = generateLevel(new Rng(0));
    const gongs = level.structures.filter((s) => s.def === 'structure.duelGong');
    expect(gongs).toHaveLength(1);
    expect(gongs[0]).toMatchObject({ tx: ARENA.cx, ty: ARENA.cy - 3 });
    expect(level.structures.filter((s) => s.def === 'structure.trainingPost')).toHaveLength(1);
    expect(level.enemies.some((e) => e.unit === 'unit.ronin' || e.unit === 'unit.zoroAdvanced' || e.unit === 'unit.dummy')).toBe(false); // an empty floor for the duel
    // the post's roster lands on the south row, inside the ring
    const post = level.structures.find((s) => s.def === 'structure.trainingPost')!;
    for (const r of Structures.get('structure.trainingPost').summon!) {
      expect(post.ty + r.dy).toBe(ARENA.cy + 3);
      expect(Math.max(Math.abs(post.tx + r.dx - ARENA.cx), Math.abs(post.ty + r.dy - ARENA.cy))).toBeLessThan(4.8);
    }
    // both summon spots land on the arena floor, inside the wall band
    const d = Structures.get('structure.duelGong');
    for (const r of d.summon!) {
      const tx = gongs[0]!.tx + r.dx;
      const ty = gongs[0]!.ty + r.dy;
      expect(Math.max(Math.abs(tx - ARENA.cx), Math.abs(ty - ARENA.cy))).toBeLessThan(4.8);
      expect(level.grid.structures.blocks(tx, ty, { mode: 'foot', airborne: false, onLedge: false })).toBe(false);
    }
  });
});

describe('the verb: ring, refuse while the duel is on, ring again after', () => {
  it('offers itself beside the gong only, spawns the roster at its offsets facing each other, and records the ids', () => {
    const { level, world, gong, hero, ctx, units, rec } = arena();
    expect(summon.can(hero, gong, ctx)).toBe(true);
    const wall = level.structures.find((s) => s.def === 'structure.stoneWall')!;
    expect(summon.can(hero, placeStructure(world, level.grid.structures, wall.def, wall.tx, wall.ty), ctx)).toBe(false); // a plain structure rings for nobody
    expect(units()).toHaveLength(0);
    summon.run(hero, gong, ctx);
    const spawned = units();
    expect(spawned.map((e) => e.identity.name).sort()).toEqual(['Ronin', 'Zoro (Advanced)']);
    const zoro = spawned.find((e) => e.identity.name === 'Zoro (Advanced)')!;
    const ronin = spawned.find((e) => e.identity.name === 'Ronin')!;
    expect(zoro.transform!.x).toBe((rec.tx - 4 + 0.5) * TILE); // west…
    expect(ronin.transform!.x).toBe((rec.tx + 4 + 0.5) * TILE); // …and east, four tiles off the center
    expect(zoro.transform!.y).toBe(ronin.transform!.y);
    expect(zoro.transform!.angle).toBeCloseTo(0, 6); // facing east, at the Ronin…
    expect(Math.abs(ronin.transform!.angle)).toBeCloseTo(Math.PI, 6); // …who faces west, at him
    expect(gong.structure!.summoned!.sort()).toEqual([zoro.id, ronin.id].sort());
    expect(factions.isHostile(zoro.faction!.id, ronin.faction!.id)).toBe(true); // the duel starts on its own
    expect(zoro.ai!.bb.state).toBe('wander'); // awake from the first tick — no dormancy needed
  });

  it('rung again mid-duel it RESETS: the live pair is removed and a fresh pair steps up from the marks; a dead pair just respawns', () => {
    const { gong, hero, ctx, units, world } = arena();
    summon.run(hero, gong, ctx);
    const first = units();
    expect(first).toHaveLength(2);
    const [a, b] = first;
    a!.transform!.x += 100; // they've moved into the fight
    summon.run(hero, gong, ctx); // the reset
    const second = units();
    expect(second).toHaveLength(2); // nothing stacked…
    expect(world.byId(a!.id)).toBeUndefined(); // …the old pair is gone…
    expect(world.byId(b!.id)).toBeUndefined();
    expect(second.map((e) => e.id)).not.toContain(a!.id);
    expect(gong.structure!.summoned!.sort()).toEqual(second.map((e) => e.id).sort()); // the roster is the new pair
    const zoro = second.find((e) => e.identity.name === 'Zoro (Advanced)')!;
    expect(Math.round(zoro.transform!.x)).toBe(Math.round((gong.structure!.tx - 4 + 0.5) * TILE)); // back on his mark
    for (const e of second) e.health!.dead = true; // the duel ended
    summon.run(hero, gong, ctx);
    expect(units().filter((e) => !e.health!.dead)).toHaveLength(2); // a fresh pair (the corpses stay until the world sweeps them)
    const refuse = { ...Structures.get('structure.duelGong'), reRing: undefined };
    expect(structureProblem(refuse)).toBeNull(); // the default mode (refuse) is still a valid summoner
  });
});

describe('the training post — a summoner you can also clear', () => {
  it('sets three dummies on the south row; a second use clears them; the gong, by contrast, resets its duel', () => {
    const world = new World();
    const level = generateLevel(new Rng(0));
    const rec = level.structures.find((s) => s.def === 'structure.trainingPost')!;
    const post = placeStructure(world, level.grid.structures, rec.def, rec.tx, rec.ty);
    const sp = new Spawner(world, new Rng(5));
    const hero = sp.spawnHero(post.transform!.x, post.transform!.y + 30);
    const ctx = { world, spawner: sp } as unknown as VerbCtx;
    const dummies = () => world.with('ai', 'identity').filter((e) => e.identity.name === 'Training Dummy');
    expect(summon.label(hero, post)).toBe('Set up the dummies');
    summon.run(hero, post, ctx);
    expect(dummies()).toHaveLength(3);
    for (const d of dummies()) expect(Math.floor(d.transform!.y / TILE)).toBe(ARENA.cy + 3);
    expect(summon.label(hero, post)).toBe('Clear the training post');
    summon.run(hero, post, ctx); // the second use clears
    expect(dummies()).toHaveLength(0);
    expect(post.structure!.summoned).toEqual([]);
    summon.run(hero, post, ctx); // and a third sets them again
    expect(dummies()).toHaveLength(3);
    expect(Structures.get('structure.duelGong').reRing).toBe('reset'); // the gong restarts the duel, the post clears its dummies
    expect(Structures.get('structure.trainingPost').reRing).toBe('clear');
    expect(structureProblem({ ...Structures.get('structure.wall'), reRing: 'clear' })).toMatch(/summoner/);
  });
});
