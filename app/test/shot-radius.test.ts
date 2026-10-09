import { describe, expect, it } from 'vitest';
import { Abilities, SHOT_POINT_R } from '../src/combat/Ability';
import { StatBlock } from '../src/combat/StatBlock';
import { Rng } from '../src/core/Rng';
import { TERRAIN } from '../src/defs/terrains';
import type { Entity, FactionId } from '../src/ecs/components';
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
function body(world: World, x: number, y: number, faction: FactionId): Entity {
  return world.create({
    transform: { x, y, angle: 0, r: 11 },
    health: { hp: 500, maxHp: 500, dead: false, hitFlash: 0, iframes: 0 },
    faction: { id: faction },
    attributes: new StatBlock({ atk: 10, atkSpeed: 1 }),
    combatant: { stam: 100, maxStam: 100, combo: 0, comboT: 0, stunT: 0, posture: 0, maxPosture: 100, blocking: false, parryT: 0 },
  });
}
/** Fly a ball of hit radius `r` past a target whose center sits `offset` px off the ball's line; report whether it connected. */
function passesAt(offset: number, r: number, ability = 'ability.shippuSlash'): boolean {
  const world = new World();
  const shooter = body(world, 2 * T, 5 * T, 'straw_hat');
  const target = body(world, 10 * T, 5 * T + offset, 'bandits');
  world.create({ transform: { x: 8 * T, y: 5 * T, angle: 0, r }, projectile: { owner: shooter.id, ability, vx: 600, vy: 0, life: 2, hit: [], passChance: 0, kind: 'ball', scale: 1 } });
  const sys = new ProjectileSystem(world, new StrikeResolver(new Damage(), new Rng(1)), new Collision(grassGrid()), new Rng(1));
  for (let i = 0; i < 20; i++) sys.update(1 / 60); // 200px of flight — well past the target
  return target.health!.hp < 500;
}

describe('shotRadius — what a ball HITS is its own disc, not just its centerline', () => {
  it('the crescent (r 22) connects when its edge brushes a shoulder; a point ball at the same offset flies by', () => {
    const graze = 11 + 22 - 3; // body radius + the crescent's radius − a hair: the edges overlap by 3px
    expect(passesAt(graze, 22)).toBe(true);
    expect(passesAt(graze, SHOT_POINT_R)).toBe(false); // the musket ball's rule, unchanged
    expect(passesAt(11 + 22 + 3, 22)).toBe(false); // a clean miss stays a miss
  });

  it('the rows: the gale and the wind slashes author a hit radius inside their drawn size; a musket ball stays a point', () => {
    const gale = Abilities.get('ability.shippuSlash').shape!;
    expect(gale.shotRadius! * 2).toBeLessThanOrEqual(gale.shotSize!);
    expect(Abilities.get('ability.kamaitachiSlash').shape!.shotRadius).toBe(10);
    expect(Abilities.get('ability.musketShot').shape!.shotRadius).toBeUndefined();
  });
});
