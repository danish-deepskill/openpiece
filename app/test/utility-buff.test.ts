import { describe, expect, it } from 'vitest';
import { tryUtility } from '../src/ai/brains';
import type { AIContext } from '../src/ai/Brain';
import { equip, unequip } from '../src/combat/equip';
import { Rng } from '../src/core/Rng';
import { MOVE_SPEED_STAT } from '../src/combat/stats';
import { TERRAIN } from '../src/defs/terrains';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { EffectSystem } from '../src/systems/EffectSystem';
import { MovementSystem } from '../src/systems/MovementSystem';
import type { StrikeResolver } from '../src/systems/StrikeResolver';
import { Collision } from '../src/world/Collision';
import { TileGrid } from '../src/world/TileGrid';

/** An all-grass world: movement with no terrain modifier, so a speed ratio is the stat alone. */
function grassWorld() {
  const world = new World();
  const g = new TileGrid(20, 20);
  g.tiles = Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => TERRAIN.grass));
  return { world, movement: new MovementSystem(world, new Collision(g)), sp: new Spawner(world, new Rng(1)) };
}

describe('MOVE_SPEED_STAT — the one multiplier that changes walk speed', () => {
  it('a +30% modifier moves a walker 1.3× as far per step; the seed is 1 (identity)', () => {
    const { movement, sp } = grassWorld();
    const e = sp.spawnHero(160, 160);
    expect(e.attributes!.get(MOVE_SPEED_STAT)).toBe(1); // seeded neutral on every spawn
    const walk = (): number => {
      e.transform!.x = 160;
      e.mover!.vx = e.mover!.speed; // walking intent, full speed, +x
      e.mover!.vy = 0;
      movement.update(1 / 60);
      return e.transform!.x - 160;
    };
    const base = walk();
    expect(base).toBeGreaterThan(0);
    e.attributes!.add({ stat: MOVE_SPEED_STAT, op: 'mulPct', value: 0.3, source: 'test' });
    expect(walk()).toBeCloseTo(base * 1.3, 6);
    e.attributes!.removeBySource('test');
    expect(walk()).toBeCloseTo(base, 6);
  });
});

describe('utility — the C buff slot a style or fruit grants', () => {
  it('equipping kenjutsu routes its utility into the slot + grants it; unequipping clears both', () => {
    const { sp } = grassWorld();
    const e = sp.spawnHero(0, 0);
    expect(e.loadout!.utilities).toEqual([]);
    equip(e, 'style', 'style.kenjutsu');
    expect(e.loadout!.utilities).toEqual(['ability.kiai']);
    expect(e.loadout!.granted.has('ability.kiai')).toBe(true);
    expect(e.loadout!.dash).toBe('ability.shukuchi'); // the style's dash replaced the roll
    unequip(e, 'style', 'style.kenjutsu');
    expect(e.loadout!.utilities).toEqual([]);
    expect(e.loadout!.granted.has('ability.kiai')).toBe(false);
  });
});

describe('tryUtility — the brain fires a granted, ready, affordable buff', () => {
  function rig() {
    const { world, sp } = grassWorld();
    const abilities = new AbilitySystem(world, new EffectSystem(world), {} as StrikeResolver, new Rng(1)); // no strikes: a buff never hits
    const ctx = { abilities } as unknown as AIContext; // the buff beat reads only ctx.abilities (safe: see tryUtility)
    return { world, sp, abilities, ctx };
  }

  it('the samurai pops Kiai once: the effect is live (haste + tag), then it is on cooldown', () => {
    const { sp, ctx } = rig();
    const e = sp.spawnUnit('unit.samurai', 0, 0);
    expect(tryUtility(e, ctx)).toBe(true);
    expect(e.tags!.has('buff.kiai')).toBe(true);
    expect(e.attributes!.get(MOVE_SPEED_STAT)).toBeCloseTo(1.3, 6);
    expect(tryUtility(e, ctx)).toBe(false); // on cooldown — not spammed
  });

  it('never fires for a unit without a utility, while regrouping, or when it cannot pay', () => {
    const { sp, ctx } = rig();
    const bandit = sp.spawnUnit('unit.bandit', 0, 0); // no style → no utility
    expect(tryUtility(bandit, ctx)).toBe(false);
    const samurai = sp.spawnUnit('unit.samurai', 50, 0);
    samurai.ai!.bb.regrouping = true; // conserving the bar — a buff would spend it
    expect(tryUtility(samurai, ctx)).toBe(false);
    samurai.ai!.bb.regrouping = false;
    samurai.combatant!.stam = 3; // below Kiai's 12
    expect(tryUtility(samurai, ctx)).toBe(false);
  });
});
