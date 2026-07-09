import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/Rng';
import { TERRAIN } from '../src/defs/terrains';
import type { Entity, FactionId } from '../src/ecs/components';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { Damage } from '../src/systems/Damage';
import { EffectSystem } from '../src/systems/EffectSystem';
import { ProjectileSystem } from '../src/systems/ProjectileSystem';
import { StrikeResolver } from '../src/systems/StrikeResolver';
import { StatBlock } from '../src/combat/StatBlock';
import { Collision } from '../src/world/Collision';
import { placeStructure } from '../src/world/StructureIndex';
import { TileGrid } from '../src/world/TileGrid';

/**
 * The TRAVELLING-shot substrate (docs DESIGN_BACKLOG #19): a musket ball is its own entity that moves each
 * tick and resolves on a SWEPT contact test — so it can be dodged, a wall stops it (physical cover for free),
 * and a fast ball can't tunnel past a body/wall between ticks. The hit itself goes through the SAME
 * StrikeResolver a melee contact uses, so guard/faction/ally rules apply with no duplicated combat code.
 */

const T = 32;
function grassGrid(w = 30, h = 30): TileGrid {
  const g = new TileGrid(w, h);
  g.tiles = Array.from({ length: h }, () => Array.from({ length: w }, () => TERRAIN.grass));
  return g;
}

function sysFor(world: World, g: TileGrid): ProjectileSystem {
  const strikes = new StrikeResolver(new Damage(), new Rng(1));
  return new ProjectileSystem(world, strikes, new Collision(g));
}

/** A minimal combat body — faction + health + attributes so StrikeResolver can land a hit on it. */
function body(world: World, x: number, y: number, faction: FactionId, hp = 50): Entity {
  return world.create({
    transform: { x, y, angle: 0, r: 11 },
    health: { hp, maxHp: hp, dead: false, hitFlash: 0, iframes: 0 },
    faction: { id: faction },
    attributes: new StatBlock({ atk: 10, atkSpeed: 1 }), // atkSpeed 1: unset reads as 0 → Math.max(0.1,0) inflates cooldowns 10× (real units get it at spawn)
    combatant: { stam: 100, maxStam: 100, combo: 0, comboT: 0, stunT: 0, posture: 0, maxPosture: 100, blocking: false, parryT: 0 },
  });
}

/** A shot in flight, owned by `owner`, aimed +x at `speed` px/s with `life` seconds aloft. */
function shot(world: World, owner: Entity, x: number, y: number, speed: number, life = 2): Entity {
  return world.create({
    transform: { x, y, angle: 0, r: 2 },
    projectile: { owner: owner.id, ability: 'ability.musketShot', vx: speed, vy: 0, life, hit: [] },
  });
}

describe('projectile travel + expiry', () => {
  it('a shot advances along its velocity each tick', () => {
    const world = new World();
    const g = grassGrid();
    const owner = body(world, 5 * T, 5 * T, 'straw_hat');
    const b = shot(world, owner, 8 * T, 5 * T, 600);
    sysFor(world, g).update(1 / 60);
    expect(b.transform!.x).toBeCloseTo(8 * T + 600 / 60, 3); // moved forward exactly speed·dt
    expect(world.byId(b.id)).toBeDefined(); // still alive (nothing hit, range not spent)
  });

  it('a shot despawns when its life runs out (spent its range, hit nothing)', () => {
    const world = new World();
    const g = grassGrid();
    const owner = body(world, 5 * T, 5 * T, 'straw_hat');
    const b = shot(world, owner, 8 * T, 5 * T, 600, 0.005); // ~0.3 ticks of life
    sysFor(world, g).update(1 / 60);
    expect(world.byId(b.id)).toBeUndefined(); // fizzled at range
  });
});

describe('contact resolution (swept, through StrikeResolver)', () => {
  it('hits a hostile in its path and damages it, then despawns', () => {
    const world = new World();
    const g = grassGrid();
    const owner = body(world, 5 * T, 5 * T, 'straw_hat');
    const foe = body(world, 5 * T + 40, 5 * T, 'bandits'); // 40px east, in the lane
    const b = shot(world, owner, 5 * T, 5 * T, 600);
    sysFor(world, g).update(1 / 60); // 600/60 = 10px/tick — sweep still catches the foe 40px out over enough ticks
    for (let i = 0; i < 6 && world.byId(b.id); i++) sysFor(world, g).update(1 / 60);
    expect(foe.health!.hp).toBeLessThan(50); // took the hit (atk 10 + flat 14 = 24)
    expect(world.byId(b.id)).toBeUndefined(); // the ball is spent on contact
  });

  it('does NOT hit an ALLY in its path (the harm predicate — the Moat)', () => {
    const world = new World();
    const g = grassGrid();
    const owner = body(world, 5 * T, 5 * T, 'straw_hat');
    const ally = body(world, 5 * T + 40, 5 * T, 'straw_hat'); // same faction
    const b = shot(world, owner, 5 * T, 5 * T, 600);
    for (let i = 0; i < 8 && world.byId(b.id); i++) sysFor(world, g).update(1 / 60);
    expect(ally.health!.hp).toBe(50); // untouched — the ball flew through a friend
  });

  it('does not tunnel: a FAST ball still hits a body it crosses within one tick', () => {
    const world = new World();
    const g = grassGrid();
    const owner = body(world, 5 * T, 5 * T, 'straw_hat');
    const foe = body(world, 5 * T + 30, 5 * T, 'bandits'); // 30px out
    // speed 3000 px/s → 50px in one tick, LEAPING PAST the 30px-out foe if the test were point-sampled
    const b = shot(world, owner, 5 * T, 5 * T, 3000);
    sysFor(world, g).update(1 / 60);
    expect(foe.health!.hp).toBeLessThan(50); // the SWEEP caught it mid-flight
    expect(world.byId(b.id)).toBeUndefined();
  });
});

describe('walls + physical cover', () => {
  it('a TALL structure stops the ball (a wall between shooter and target eats the round)', () => {
    const world = new World();
    const g = grassGrid();
    placeStructure(new World(), g.structures, 'structure.wall', 8, 5); // wall cell at tile (8,5) = x∈[256,288]
    const owner = body(world, 5 * T, 5 * T, 'straw_hat');
    const foe = body(world, 12 * T, 5 * T, 'bandits'); // BEHIND the wall (east of it)
    const b = shot(world, owner, 5 * T, 5 * T, 600);
    for (let i = 0; i < 40 && world.byId(b.id); i++) sysFor(world, g).update(1 / 60);
    expect(foe.health!.hp).toBe(50); // never hit — the wall shielded it (cover)
    expect(world.byId(b.id)).toBeUndefined(); // the ball died at the wall
  });

  it('a LOW obstacle does NOT stop the ball (you can shoot over a stone wall / the sea)', () => {
    const world = new World();
    const g = grassGrid();
    placeStructure(new World(), g.structures, 'structure.stoneWall', 8, 5); // LOW — blocksAir false
    const owner = body(world, 5 * T, 5 * T, 'straw_hat');
    const foe = body(world, 12 * T, 5 * T, 'bandits');
    const b = shot(world, owner, 5 * T, 5 * T, 600);
    for (let i = 0; i < 40 && world.byId(b.id); i++) sysFor(world, g).update(1 / 60);
    expect(foe.health!.hp).toBeLessThan(50); // the ball flew OVER the low wall and struck the foe
  });

  it('a wall IN FRONT of a foe shields it; a foe in front of a wall gets hit (first blocker wins)', () => {
    const world = new World();
    const g = grassGrid();
    placeStructure(new World(), g.structures, 'structure.wall', 10, 5); // wall further out
    const owner = body(world, 5 * T, 5 * T, 'straw_hat');
    const near = body(world, 8 * T, 5 * T, 'bandits'); // foe BEFORE the wall — should be hit
    const b = shot(world, owner, 5 * T, 5 * T, 600);
    for (let i = 0; i < 40 && world.byId(b.id); i++) sysFor(world, g).update(1 / 60);
    expect(near.health!.hp).toBeLessThan(50); // the nearer foe eats it before the ball reaches the wall
  });
});

describe('whiff', () => {
  it('a shot down an empty lane hits nobody and expires', () => {
    const world = new World();
    const g = grassGrid();
    const owner = body(world, 5 * T, 5 * T, 'straw_hat');
    const foe = body(world, 5 * T, 12 * T, 'bandits'); // OFF the lane (south, not east)
    const b = shot(world, owner, 5 * T, 5 * T, 600, 0.3);
    while (world.byId(b.id)) sysFor(world, g).update(1 / 60);
    expect(foe.health!.hp).toBe(50); // never in the path
  });
});

describe('firing through AbilitySystem (the reload gate = the counterplay)', () => {
  function shooterWith(world: World, ability: string): Entity {
    const e = body(world, 5 * T, 5 * T, 'straw_hat');
    e.loadout = { granted: new Set([ability]), cd: new Map(), cdMax: new Map(), primary: ability, heavy: ability, dash: ability, slots: [] };
    return e;
  }

  it('activating the musket spawns a travelling projectile (not an instant hit)', () => {
    const world = new World();
    const abilities = new AbilitySystem(world, new EffectSystem(world), new StrikeResolver(new Damage(), new Rng(1)), new Rng(1));
    const shooter = shooterWith(world, 'ability.musketShot');
    expect(abilities.activate(shooter, 'ability.musketShot')).toBe(true);
    const balls = [...world.with('projectile')];
    expect(balls.length).toBe(1); // ONE ball, born from the muzzle
    expect(balls[0].projectile.owner).toBe(shooter.id);
    expect(Math.hypot(balls[0].projectile.vx, balls[0].projectile.vy)).toBeCloseTo(620, 0); // at shotSpeed
  });

  it('a SECOND shot is refused until the reload cooldown elapses (one shot, then vulnerable)', () => {
    const world = new World();
    const abilities = new AbilitySystem(world, new EffectSystem(world), new StrikeResolver(new Damage(), new Rng(1)), new Rng(1));
    const shooter = shooterWith(world, 'ability.musketShot');
    expect(abilities.activate(shooter, 'ability.musketShot')).toBe(true); // fires
    expect(abilities.activate(shooter, 'ability.musketShot')).toBe(false); // still reloading → refused
    expect([...world.with('projectile')].length).toBe(1); // only the first ball exists
    // tick the cooldown past the 2.2s reload window (abilities.update ticks only cooldowns, not stamina —
    // top that back up so THIS test isolates the reload gate, not the stamina gate)
    for (let i = 0; i < 140; i++) abilities.update(1 / 60);
    shooter.combatant!.stam = 100;
    expect(abilities.activate(shooter, 'ability.musketShot')).toBe(true); // reloaded → fires again
  });
});
