import { describe, expect, it } from 'vitest';
import { Abilities } from '../src/combat/Ability';
import { applyEffect, Effects } from '../src/combat/Effect';
import { StatBlock } from '../src/combat/StatBlock';
import { BLOCK_DEFLECT_ARC, guardCovers } from '../src/combat/guard';
import { angleDiff } from '../src/core/math';
import { Rng } from '../src/core/Rng';
import { TERRAIN } from '../src/defs/terrains';
import { DEFLECT_STAT } from '../src/combat/stats';
import type { Entity, FactionId } from '../src/ecs/components';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { Damage } from '../src/systems/Damage';
import { ProjectileSystem } from '../src/systems/ProjectileSystem';
import { StrikeResolver } from '../src/systems/StrikeResolver';
import { Collision } from '../src/world/Collision';
import { TileGrid } from '../src/world/TileGrid';

const T = 32;
function grassGrid(): TileGrid {
  const g = new TileGrid(30, 30);
  g.tiles = Array.from({ length: 30 }, () => Array.from({ length: 30 }, () => TERRAIN.grass));
  return g;
}
function sysFor(world: World, seed = 1): ProjectileSystem {
  return new ProjectileSystem(world, new StrikeResolver(new Damage(), new Rng(1)), new Collision(grassGrid()), new Rng(seed));
}
/** A bare body with the three components a shot needs, plus an optional deflect stat. */
function body(world: World, x: number, y: number, faction: FactionId, deflect = 0): Entity {
  return world.create({
    transform: { x, y, angle: 0, r: 11 },
    health: { hp: 50, maxHp: 50, dead: false, hitFlash: 0, iframes: 0 },
    faction: { id: faction },
    attributes: new StatBlock({ atk: 10, atkSpeed: 1, [DEFLECT_STAT]: deflect }),
  });
}
function shot(world: World, owner: Entity, x: number, y: number, vx: number): Entity {
  return world.create({
    transform: { x, y, angle: 0, r: 2 },
    projectile: { owner: owner.id, ability: 'ability.musketShot', vx, vy: 0, life: 2, hit: [], kind: 'ball', scale: 1 },
  });
}

describe('deflect — a ball that would strike a deflecting body turns back on its shooter', () => {
  it('with chance 1 the ball reverses, changes owner, spares the target, and later hits the shooter', () => {
    const world = new World();
    const marine = body(world, 5 * T, 5 * T, 'marine'); // the shooter
    const samurai = body(world, 8 * T, 5 * T, 'pirates', 1); // certain deflect
    const ball = shot(world, marine, 8 * T - 20, 5 * T, 600); // flying +x, one tick from contact
    const sys = sysFor(world);
    sys.update(1 / 60);
    expect(world.byId(ball.id)).toBeDefined(); // not spent
    expect(samurai.health!.hp).toBe(50); // untouched
    expect(ball.projectile!.owner).toBe(samurai.id); // it is HIS shot now
    expect(ball.projectile!.vx).toBeLessThan(0); // heading back toward the marine (−x)
    expect(ball.transform!.angle).toBeCloseTo(Math.PI, 3); // the art turned with it
    for (let i = 0; i < 60 && world.byId(ball.id); i++) sys.update(1 / 60); // fly home
    expect(world.byId(ball.id)).toBeUndefined(); // spent on contact …
    expect(marine.health!.hp).toBeLessThan(50); // … with its own shooter
  });

  it('with chance 0 (the base case) the ball simply hits', () => {
    const world = new World();
    const marine = body(world, 5 * T, 5 * T, 'marine');
    const target = body(world, 8 * T, 5 * T, 'pirates');
    const ball = shot(world, marine, 8 * T - 20, 5 * T, 600);
    sysFor(world).update(1 / 60);
    expect(world.byId(ball.id)).toBeUndefined();
    expect(target.health!.hp).toBeLessThan(50);
  });

  it('shukuchi grants the deflect window (0.5 for 0.3s) instead of i-frames; melee is NOT blocked', () => {
    expect(Abilities.get('ability.shukuchi').grantEffect).toBe('effect.deflecting');
    const row = Effects.get('effect.deflecting');
    expect(row.durationSec).toBe(0.3);
    expect(row.grantTags ?? []).not.toContain('state.invuln'); // no invulnerability — a cut still lands mid-dash
    const e = new Spawner(new World(), new Rng(1)).spawnUnit('unit.samurai', 0, 0);
    expect(e.attributes!.get(DEFLECT_STAT)).toBe(0); // nobody deflects by default
    applyEffect(e, 'effect.deflecting', 'test');
    expect(e.attributes!.get(DEFLECT_STAT)).toBeCloseTo(0.5, 6);
  });
});

describe('guardCovers — the block half of the guard arc, as a pure query', () => {
  it('true only while BLOCKING with the guard facing where the blow comes from', () => {
    const world = new World();
    const e = new Spawner(world, new Rng(1)).spawnUnit('unit.samurai', 100, 100);
    e.transform!.angle = Math.PI; // facing −x
    expect(guardCovers(e, 0, 100)).toBe(false); // not blocking
    e.combatant!.blocking = true;
    expect(guardCovers(e, 0, 100)).toBe(true); // a blow from −x, straight into the guard
    expect(guardCovers(e, 200, 100)).toBe(false); // from behind
  });
});

describe('a raised guard GLANCES a ball off about half the time, within ±60° of the facing', () => {
  it('over many seeds: roughly half deflect as the blocker\'s shot inside the arc, the rest are blocked (no HP lost)', () => {
    let deflected = 0;
    let blocked = 0;
    const SEEDS = 40;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const world = new World();
      const sp = new Spawner(world, new Rng(seed));
      const marine = sp.spawnUnit('unit.marineOfficer', 5 * T, 5 * T);
      const samurai = sp.spawnUnit('unit.samurai', 8 * T, 5 * T);
      samurai.transform!.angle = Math.PI; // guard raised toward the shooter
      samurai.combatant!.blocking = true;
      const hp = samurai.health!.hp;
      const ball = shot(world, marine, 8 * T - 24, 5 * T, 600);
      const sys = sysFor(world, seed);
      for (let i = 0; i < 10 && world.byId(ball.id) && ball.projectile!.owner === marine.id; i++) sys.update(1 / 60); // fly until it lands or turns
      expect(samurai.health!.hp).toBe(hp); // either way the body takes no HP: glanced, or blocked
      if (world.byId(ball.id)) {
        deflected++;
        expect(ball.projectile!.owner).toBe(samurai.id);
        const heading = Math.atan2(ball.projectile!.vy, ball.projectile!.vx);
        expect(Math.abs(angleDiff(heading, samurai.transform!.angle))).toBeLessThanOrEqual(BLOCK_DEFLECT_ARC + 1e-9);
      } else {
        blocked++;
      }
    }
    expect(deflected + blocked).toBe(SEEDS);
    expect(deflected).toBeGreaterThanOrEqual(8); // ~50% with a wide tolerance (seeded, so this is stable)
    expect(deflected).toBeLessThanOrEqual(32);
  });
});
