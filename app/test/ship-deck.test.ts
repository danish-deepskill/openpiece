import { describe, expect, it } from 'vitest';
import { deckCanOccupy, deckOf, deckToWorld, helmSpot } from '../src/defs/decks';
import { ShipHulls } from '../src/defs/ships';
import type { Entity } from '../src/ecs/components';
import { World } from '../src/ecs/World';
import { ShipSystem } from '../src/systems/ShipSystem';
import { Collision } from '../src/world/Collision';
import { TileGrid } from '../src/world/TileGrid';

/**
 * LOCAL-SPACE PARENTING (walkable-ship step 2) — an on-deck actor carries a LOCAL deck spot (onDeck.lx/ly); each
 * tick ShipSystem re-derives its WORLD position as `ship.pos + rotate(local, ship.angle)`, so it rides the deck
 * as the hull moves + turns. This is the transform the whole pillar (walking, click-a-tile, cannons) stands on.
 */

/** All-water grid so a ship can sail anywhere (no running aground in the test). */
function seaSystem(): { world: World; ships: ShipSystem } {
  const g = new TileGrid(40, 40);
  g.tiles = Array.from({ length: 40 }, () => Array.from({ length: 40 }, () => 0 /* Tile.Water */));
  const world = new World();
  return { world, ships: new ShipSystem(world, new Collision(g)) };
}

function makeShip(world: World, x: number, y: number, angle = 0): Entity {
  return world.create({
    transform: { x, y, angle, r: 56 },
    ship: { hull: 'ship.sloop', mode: 'exploration', anchored: false, speed: 0, throttle: 0 },
  });
}
function makeActor(world: World, x: number, y: number): Entity {
  return world.create({
    transform: { x, y, angle: 0, r: 8 },
    mover: { vx: 0, vy: 0, speed: 100, mass: 1, mode: 'foot', dodgeT: 0, dvx: 0, dvy: 0 },
  });
}

describe('on-deck parenting (ShipSystem)', () => {
  it('an on-deck actor is placed at its LOCAL spot in world space each tick', () => {
    const { world, ships } = seaSystem();
    const ship = makeShip(world, 1000, 1000, 0); // heading 0 (+x)
    const a = makeActor(world, 0, 0);
    a.onDeck = { shipId: ship.id, lx: 30, ly: -10 }; // a spot forward-and-left on the deck
    ships.update(0.1);
    // heading 0 → world = ship.pos + (lx, ly) directly
    expect(a.transform!.x).toBeCloseTo(1030, 6);
    expect(a.transform!.y).toBeCloseTo(990, 6);
  });

  it('the actor RIDES the deck through a heading change (its world pos rotates with the ship)', () => {
    const { world, ships } = seaSystem();
    const ship = makeShip(world, 500, 500, 0);
    const a = makeActor(world, 0, 0);
    a.onDeck = { shipId: ship.id, lx: 40, ly: 0 }; // stood at the bow (forward)
    ships.update(0.05);
    const before = { x: a.transform!.x, y: a.transform!.y };
    expect(before.x).toBeCloseTo(540, 6); // bow is +x while heading 0
    ship.transform!.angle = Math.PI / 2; // the ship turns to face +y
    ships.update(0.05);
    // same LOCAL spot, new heading → the bow spot now projects along +y
    expect(a.transform!.x).toBeCloseTo(500, 6);
    expect(a.transform!.y).toBeCloseTo(540, 6);
    expect(a.transform!.angle).toBeCloseTo(Math.PI / 2, 6); // faces the hull heading
  });

  it('the world position always equals deckToWorld(ship, local) — the ONE transform', () => {
    const { world, ships } = seaSystem();
    const ship = makeShip(world, 320, 240, 1.1);
    const a = makeActor(world, 0, 0);
    a.onDeck = { shipId: ship.id, lx: -24, ly: 16 };
    ships.update(0.1);
    const expected = deckToWorld(ship.transform!, -24, 16);
    expect(a.transform!.x).toBeCloseTo(expected.x, 6);
    expect(a.transform!.y).toBeCloseTo(expected.y, 6);
  });

  it('board() puts the actor on a valid deck spot and unanchors the ship', () => {
    const { world, ships } = seaSystem();
    const ship = makeShip(world, 700, 700, 0);
    ship.ship!.anchored = true;
    const a = makeActor(world, 660, 700); // near the ship, on foot
    ships.board(a, ship);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    expect(a.onDeck?.shipId).toBe(ship.id);
    expect(deckCanOccupy(grid, a.onDeck!.lx, a.onDeck!.ly, a.transform!.r, false)).toBe(true); // stands on a real deck cell
    expect(ship.ship!.anchored).toBe(false);
  });

  it('an actor whose ship despawned drops its onDeck (no stale ref)', () => {
    const { world, ships } = seaSystem();
    const a = makeActor(world, 0, 0);
    a.onDeck = { shipId: 99999, lx: 0, ly: 0 }; // a ship id that does not exist
    ships.update(0.1);
    expect(a.onDeck).toBeUndefined();
  });
});

describe('walking the deck + positional piloting (ShipSystem, step 3)', () => {
  it('board() drops the actor NEXT TO the helm, not on it (walk to the wheel to steer)', () => {
    const { world, ships } = seaSystem();
    const ship = makeShip(world, 700, 700, 0);
    ship.ship!.anchored = true;
    const a = makeActor(world, 660, 700);
    ships.board(a, ship);
    expect(ships.atHelm(a)).toBe(false); // starts beside the wheel, not steering yet
  });

  it('walkDeck moves the local spot; stepping ONTO the helm tile grants piloting', () => {
    const { world, ships } = seaSystem();
    const ship = makeShip(world, 500, 500, 0); // heading 0
    const a = makeActor(world, 0, 0);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const helm = helmSpot(grid);
    // start one tile east of the helm, then walk WEST (−x world) onto the helm
    a.onDeck = { shipId: ship.id, lx: helm.lx + grid.tilePx, ly: helm.ly };
    expect(ships.atHelm(a)).toBe(false);
    for (let i = 0; i < 40; i++) ships.walkDeck(a, -1, 0, 0.05); // push west toward the helm
    expect(ships.atHelm(a)).toBe(true); // reached the wheel → can steer now
  });

  it('walkDeck cannot walk a foot actor off the deck into the sea (rail walls it)', () => {
    const { world, ships } = seaSystem();
    const ship = makeShip(world, 500, 500, 0);
    const a = makeActor(world, 0, 0);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const helm = helmSpot(grid);
    a.onDeck = { shipId: ship.id, lx: helm.lx, ly: helm.ly };
    for (let i = 0; i < 80; i++) ships.walkDeck(a, 0, -1, 0.05); // shove NORTH toward the port rail, hard
    expect(deckCanOccupy(grid, a.onDeck.lx, a.onDeck.ly, a.transform!.r, false)).toBe(true); // still on a valid deck cell
  });

  it('a pilot ON the helm steers the ship (heading changes)', () => {
    const { world, ships } = seaSystem();
    const ship = makeShip(world, 500, 500, 0);
    ship.ship!.speed = 100; // moving, so the rudder has authority
    const a = makeActor(world, 0, 0);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const helm = helmSpot(grid);
    a.onDeck = { shipId: ship.id, lx: helm.lx, ly: helm.ly };
    expect(ships.atHelm(a)).toBe(true);
    const a0 = ship.transform!.angle;
    for (let i = 0; i < 10; i++) ships.pilot(a, 0, 1, 0.05); // steer right
    expect(ship.transform!.angle).toBeGreaterThan(a0); // the ship turned
  });
});
