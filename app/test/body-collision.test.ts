import { describe, expect, it } from 'vitest';
import { deckCellAtLocal, deckOf, deckToWorld, gangplankCell } from '../src/defs/decks';
import { ShipHulls } from '../src/defs/ships';
import { TERRAIN } from '../src/defs/terrains';
import type { Entity } from '../src/ecs/components';
import { World } from '../src/ecs/World';
import { BodyCollisionSystem } from '../src/systems/BodyCollisionSystem';
import { deckCanOccupy } from '../src/world/deckCollision';
import { Collision } from '../src/world/Collision';
import { SpatialQuery } from '../src/world/SpatialQuery';
import { TileGrid } from '../src/world/TileGrid';

/** An all-walkable grid so collision never clamps the push in these open-field cases. */
function openGrid(): TileGrid {
  const g = new TileGrid();
  for (let y = 0; y < g.h; y++) {
    g.tiles[y] = [];
    for (let x = 0; x < g.w; x++) g.tiles[y][x] = TERRAIN.grass;
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

describe('BodyCollisionSystem is FRAME-AWARE (deck bodies are solid to each other, not ghosts)', () => {
  /** A rider: a body whose position is OWNED by its onDeck local spot (transform = the world projection). */
  function rider(world: World, ship: Entity, lx: number, ly: number, mass: number): Entity {
    const w = deckToWorld(ship.transform!, lx, ly);
    const e = body(world, w.x, w.y, mass);
    e.onDeck = { shipId: ship.id, lx, ly };
    return e;
  }
  function makeShip(world: World, angle = 0): Entity {
    return world.create({
      transform: { x: 500, y: 500, angle, r: 56 },
      ship: { hull: 'ship.sloop', mode: 'exploration', anchored: true, speed: 0, throttle: 0 },
    });
  }

  it('two riders on the SAME deck separate — in DECK coords, weight intact, on a ROTATED hull', () => {
    const world = new World();
    const ship = makeShip(world, 0.7); // rotated: the push must un-rotate into deck axes, not apply world-axis math
    const light = rider(world, ship, 0, 0, 1);
    const heavy = rider(world, ship, 10, 0, 3); // radii sum 22, 10 apart → overlapping by 12
    sysFor(world).update();
    const d = Math.hypot(light.onDeck!.lx - heavy.onDeck!.lx, light.onDeck!.ly - heavy.onDeck!.ly);
    expect(d).toBeGreaterThan(21.9); // separated to ~r+r, measured IN THE FRAME THAT OWNS THEM
    expect(Math.abs(light.onDeck!.lx - 0)).toBeGreaterThan(Math.abs(heavy.onDeck!.lx - 10)); // lighter yields more
    const lw = deckToWorld(ship.transform!, light.onDeck!.lx, light.onDeck!.ly);
    expect(light.transform!.x).toBeCloseTo(lw.x, 6); // the world projection was refreshed in place
    expect(light.transform!.y).toBeCloseTo(lw.y, 6);
  });

  it('a deck push PRESSES against the rail, never clips a rider into it (the deck grid resolves the shove)', () => {
    const world = new World();
    const ship = makeShip(world);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const rail = grid.cells.find((c) => c.cx === 2 && c.cy === 3)!; // south rail amidships
    // pinned flush against the rail's wall line, with a heavy body overlapping from the north: the shove
    // wants him INTO the rail — the deck grid must clamp it exactly like a world wall would ashore
    const pinned = rider(world, ship, rail.lx, rail.ly - grid.tilePx / 2 - 11, 1);
    rider(world, ship, pinned.onDeck!.lx, pinned.onDeck!.ly - 18, 4); // deep overlap, mass 4 → big southward shove
    sysFor(world).update();
    expect(deckCellAtLocal(grid, pinned.onDeck!.lx, pinned.onDeck!.ly)?.tile).not.toBe('rail'); // pressed, not clipped
    expect(deckCanOccupy(grid, pinned.onDeck!.lx, pinned.onDeck!.ly, 11, false, false)).toBe(true); // still standing legally
  });

  it('riders are measured in the OWNING frame — a one-tick-stale world projection cannot hide an overlap', () => {
    // the "I can still step a px into his circle" report: this system runs BETWEEN movement and
    // ships-parenting, so a rider's transform is one movement step OLD here. Measuring the touch on it let
    // closing bodies sink a walk-step into each other on deck while ashore stayed pixel-tight. The touch
    // test must read onDeck coords — the truth — not the stale shadow.
    const world = new World();
    const ship = makeShip(world);
    const a = rider(world, ship, 0, 0, 1);
    const b = rider(world, ship, 10, 0, 1); // truly overlapping by 12 in DECK coords
    const wa = deckToWorld(ship.transform!, -6, 0); // stale projections 22 apart — "not touching"
    a.transform!.x = wa.x;
    a.transform!.y = wa.y;
    const wb = deckToWorld(ship.transform!, 16, 0);
    b.transform!.x = wb.x;
    b.transform!.y = wb.y;
    sysFor(world).update();
    const d = Math.hypot(a.onDeck!.lx - b.onDeck!.lx, a.onDeck!.ly - b.onDeck!.ly);
    expect(d).toBeGreaterThan(21.9); // separated on the truth, not the shadow
  });

  it('a CROSS-frame pair is skipped: a world walker at the door does not shove a rider (and vice versa)', () => {
    const world = new World();
    const ship = makeShip(world);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const gp = gangplankCell(grid)!;
    const aboard = rider(world, ship, gp.lx, gp.ly, 1); // standing on the plank, deck-framed
    const w = deckToWorld(ship.transform!, gp.lx - 8, gp.ly);
    const outside = body(world, w.x, w.y, 1); // world-framed at the straddle, deeply overlapping the rider
    sysFor(world).update();
    expect(aboard.onDeck!.lx).toBe(gp.lx); // neither body moved — the handoff zone tolerates transient overlap
    expect(outside.transform!.x).toBe(w.x);
  });
});
