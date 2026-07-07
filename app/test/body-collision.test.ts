import { describe, expect, it } from 'vitest';
import { Tile } from '../src/config/constants';
import type { Entity } from '../src/ecs/components';
import { World } from '../src/ecs/World';
import { BodyCollisionSystem } from '../src/systems/BodyCollisionSystem';
import { Collision } from '../src/world/Collision';
import { SpatialQuery } from '../src/world/SpatialQuery';
import { TileGrid } from '../src/world/TileGrid';

/** An all-walkable grid so collision never clamps the push in these open-field cases. */
function openGrid(): TileGrid {
  const g = new TileGrid();
  for (let y = 0; y < g.h; y++) {
    g.tiles[y] = [];
    for (let x = 0; x < g.w; x++) g.tiles[y][x] = Tile.Grass;
  }
  return g;
}

function body(world: World, x: number, y: number, mass: number, r = 11): Entity {
  return world.create({
    transform: { x, y, angle: 0, r },
    mover: { vx: 0, vy: 0, speed: 0, mass, mode: 'foot', dodgeT: 0, dvx: 0, dvy: 0 },
  });
}

function sysFor(world: World): BodyCollisionSystem {
  return new BodyCollisionSystem(world, new SpatialQuery(world), new Collision(openGrid()));
}

describe('BodyCollisionSystem', () => {
  it('pushes overlapping bodies apart, the lighter one yielding more', () => {
    const world = new World();
    const light = body(world, 300, 300, 1);
    const heavy = body(world, 310, 300, 3); // 10px apart, radii sum 22 → overlapping by 12
    sysFor(world).update();

    const d = Math.hypot(light.transform!.x - heavy.transform!.x, light.transform!.y - heavy.transform!.y);
    expect(d).toBeGreaterThan(21.9); // separated to ~ r + r

    const lightMoved = Math.abs(light.transform!.x - 300);
    const heavyMoved = Math.abs(heavy.transform!.x - 310);
    expect(lightMoved).toBeGreaterThan(heavyMoved); // weight: the lighter body is shoved more
  });

  it('leaves non-overlapping bodies untouched', () => {
    const world = new World();
    const a = body(world, 300, 300, 1);
    const b = body(world, 400, 300, 1); // far beyond r + r
    sysFor(world).update();
    expect(a.transform!.x).toBe(300);
    expect(b.transform!.x).toBe(400);
  });

  it('skips dead bodies — you can walk over a corpse', () => {
    const world = new World();
    const alive = body(world, 300, 300, 1);
    const corpse = body(world, 305, 300, 1);
    corpse.health = { hp: 0, maxHp: 10, dead: true, hitFlash: 0, iframes: 0 };
    sysFor(world).update();
    expect(alive.transform!.x).toBe(300); // no push against a dead body
  });

  it('an AIRBORNE actor jumps OVER units — neither pushes nor is pushed (docs/design/MOVEMENT_AIR.md)', () => {
    const world = new World();
    const jumper = body(world, 300, 300, 1);
    jumper.mover!.layer = 'air'; // mid-jump, overlapping a grounded unit
    const grounded = body(world, 305, 300, 1); // 5px apart → deep overlap
    sysFor(world).update();
    expect(jumper.transform!.x).toBe(300); // the jumper is NOT shoved (it's above the crowd)…
    expect(grounded.transform!.x).toBe(305); // …and it does NOT shove the grounded unit either
  });
});
