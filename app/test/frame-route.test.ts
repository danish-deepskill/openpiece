import { describe, expect, it } from 'vitest';
import { frameLeg } from '../src/ai/brains';
import { deckOf, deckToWorld, gangplankCell, gangplankOutward, helmSpot } from '../src/defs/decks';
import { ShipHulls } from '../src/defs/ships';
import type { Entity } from '../src/ecs/components';
import { World } from '../src/ecs/World';
import { Collision } from '../src/world/Collision';
import { TileGrid } from '../src/world/TileGrid';
import { HullCollisionSystem } from '../src/systems/HullCollisionSystem';
import { MovementSystem } from '../src/systems/MovementSystem';
import { ShipSystem } from '../src/systems/ShipSystem';

/**
 * PATHFINDING Layer 2 slice 1 — frame-aware steering through the gangplank DOOR (ai/brains.frameLeg).
 * The seam under test: a steering goal in ANOTHER movement frame is redirected leg-by-leg to the door,
 * with LIVE anchors (re-derived from the ship's current pose every call — ships move, nothing is baked),
 * and the transitions themselves stay physics (inward-in-the-lane boards; outward-on-the-plank exits).
 */

const SIM = 1 / 60;

function seaWorld(): { world: World; ships: ShipSystem; move: MovementSystem; hulls: HullCollisionSystem } {
  const g = new TileGrid(40, 40);
  g.tiles = Array.from({ length: 40 }, () => Array.from({ length: 40 }, () => 0 /* TERRAIN.water */));
  const world = new World();
  const collision = new Collision(g);
  return { world, ships: new ShipSystem(world, collision), move: new MovementSystem(world, collision), hulls: new HullCollisionSystem(world) };
}

function makeShip(world: World, x: number, y: number, angle = 0): Entity {
  return world.create({
    transform: { x, y, angle, r: 56 },
    ship: { hull: 'ship.sloop', mode: 'exploration', anchored: true, speed: 0, throttle: 0 },
  });
}

function makeActor(world: World, x: number, y: number): Entity {
  return world.create({
    transform: { x, y, angle: 0, r: 8 },
    mover: { vx: 0, vy: 0, speed: 100, mass: 1, mode: 'foot', dodgeT: 0, dvx: 0, dvy: 0 },
  });
}

/** The sloop's door geometry for a ship at `pose` — the plank cell center + the lane MOUTH one tile out. */
function doorOf(ship: Entity): { door: { x: number; y: number }; mouth: { x: number; y: number }; tilePx: number } {
  const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
  const gp = gangplankCell(grid)!;
  const [ox, oy] = gangplankOutward(grid, gp);
  return {
    door: deckToWorld(ship.transform!, gp.lx, gp.ly),
    mouth: deckToWorld(ship.transform!, gp.lx + ox * grid.tilePx, gp.ly + oy * grid.tilePx),
    tilePx: grid.tilePx,
  };
}

describe('frameLeg — the cross-frame leg resolver (slice 1)', () => {
  it('same frame passes through: world→world plans, deck→same-deck steers direct (no world A* over the sea)', () => {
    const { world } = seaWorld();
    const ship = makeShip(world, 500, 500, 0);
    const a = makeActor(world, 100, 100);
    expect(frameLeg(a, world, 300, 300)).toEqual({ x: 300, y: 300, plan: true });
    const b = makeActor(world, 0, 0);
    b.onDeck = { shipId: ship.id, lx: 0, ly: 0 };
    const leg = frameLeg(b, world, 520, 510, ship.id); // goal on the SAME deck (a foe aboard with us)
    expect(leg).toEqual({ x: 520, y: 510, plan: false }); // direct steer — the world grid only knows sea here
  });

  it('WORLD → DECK: far away the goal becomes the lane MOUTH (planned); at the mouth it becomes the DOOR push', () => {
    const { world } = seaWorld();
    const ship = makeShip(world, 500, 500, 0.7); // rotated on purpose — anchors must ride the pose, not axis-aligned math
    const { door, mouth } = doorOf(ship);
    const far = makeActor(world, 100, 100);
    const legFar = frameLeg(far, world, 500, 500, ship.id); // chasing a foe somewhere aboard
    expect(legFar.plan).toBe(true); // world planning applies on the approach leg
    expect(legFar.x).toBeCloseTo(mouth.x, 6); // …and the goal is the LIVE lane mouth, not the foe
    expect(legFar.y).toBeCloseTo(mouth.y, 6);
    const near = makeActor(world, mouth.x, mouth.y); // standing at the mouth
    const legNear = frameLeg(near, world, 500, 500, ship.id);
    expect(legNear.plan).toBe(false); // the door push is direct steering (inward intent boards — physics)
    expect(legNear.x).toBeCloseTo(door.x, 6);
    expect(legNear.y).toBeCloseTo(door.y, 6);
  });

  it('the anchor is a LIVE query: the ship turns, the mouth moves with it (portal invalidation for free)', () => {
    const { world } = seaWorld();
    const ship = makeShip(world, 500, 500, 0);
    const a = makeActor(world, 100, 100);
    const m0 = frameLeg(a, world, 500, 500, ship.id);
    ship.transform!.angle = Math.PI / 2; // the ship swings around at anchor
    const m1 = frameLeg(a, world, 500, 500, ship.id);
    const { mouth } = doorOf(ship);
    expect(Math.hypot(m1.x - m0.x, m1.y - m0.y)).toBeGreaterThan(10); // the goal moved…
    expect(m1.x).toBeCloseTo(mouth.x, 6); // …exactly to the door's new pose
    expect(m1.y).toBeCloseTo(mouth.y, 6);
  });

  it('a sunk/despawned goal ship falls back to honest world steering (no crash, no stale door)', () => {
    const { world } = seaWorld();
    const a = makeActor(world, 100, 100);
    expect(frameLeg(a, world, 300, 300, 99999)).toEqual({ x: 300, y: 300, plan: true });
  });

  it('DECK → WORLD: aboard, a world goal redirects to our own door; ON the plank it pushes OUTWARD', () => {
    const { world } = seaWorld();
    const ship = makeShip(world, 500, 500, 0);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const gp = gangplankCell(grid)!;
    const { door, mouth } = doorOf(ship);
    const helm = helmSpot(grid);
    const aboard = makeActor(world, 0, 0);
    aboard.onDeck = { shipId: ship.id, lx: helm.lx, ly: helm.ly };
    const leg = frameLeg(aboard, world, 100, 100); // goal ashore
    expect(leg.plan).toBe(false);
    expect(leg.x).toBeCloseTo(door.x, 6); // walk to our own door first
    expect(leg.y).toBeCloseTo(door.y, 6);
    aboard.onDeck = { shipId: ship.id, lx: gp.lx, ly: gp.ly }; // now standing ON the plank
    const out = frameLeg(aboard, world, 100, 100);
    expect(out.x).toBeCloseTo(mouth.x, 6); // push out through the door (the walk-off exits in place)
    expect(out.y).toBeCloseTo(mouth.y, 6);
  });
});

describe('the steering contract DELIVERS bodies through the door (end-to-end physics)', () => {
  /** Drive an actor by the frameLeg contract each tick — exactly what routeTo's redirect does — and step the
   *  full movement stack. This is the integration the brains build on: steer at the leg, physics does the rest. */
  function driveByLeg(sys: ReturnType<typeof seaWorld>, a: Entity, goal: () => { x: number; y: number; shipId?: number }, ticks: number, until: () => boolean): void {
    for (let i = 0; i < ticks && !until(); i++) {
      const g = goal();
      const leg = frameLeg(a, sys.world, g.x, g.y, g.shipId);
      const d = Math.hypot(leg.x - a.transform!.x, leg.y - a.transform!.y) || 1;
      a.mover!.vx = ((leg.x - a.transform!.x) / d) * a.mover!.speed;
      a.mover!.vy = ((leg.y - a.transform!.y) / d) * a.mover!.speed;
      sys.move.update(SIM);
      sys.ships.update(SIM);
      sys.hulls.update();
    }
  }

  it('a world chaser hunting a foe ABOARD walks the lane and BOARDS (enemies no longer stop at the plank)', () => {
    const sys = seaWorld();
    const ship = makeShip(sys.world, 500, 500, 0);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const helm = helmSpot(grid);
    const foe = makeActor(sys.world, 0, 0);
    foe.onDeck = { shipId: ship.id, lx: helm.lx, ly: helm.ly }; // the quarry stands at the helm
    sys.ships.update(SIM); // settle parenting so the foe has a world transform
    const { mouth } = doorOf(ship);
    const chaser = makeActor(sys.world, mouth.x - 60, mouth.y); // ashore-side of the lane, 2 tiles out
    driveByLeg(sys, chaser, () => ({ x: foe.transform!.x, y: foe.transform!.y, shipId: foe.onDeck?.shipId }), 600, () => !!chaser.onDeck);
    expect(chaser.onDeck?.shipId).toBe(ship.id); // walked the plank and boarded — the slice's headline
  });

  it('a chaser on the FAR side of a DIAGONAL hull walks AROUND it to the door QUARTER (the corner-pin regression)', () => {
    // the report: a diagonally-docked ship pinned the approach on a hull corner — the world planner doesn't
    // know hulls, and a rotated hull blocks BOTH slide axes at once. frameLeg's tangent stopgap must walk
    // the long way around the hull to the door's quarter instead of grinding the far corner forever.
    // HONEST LIMIT (recorded in PATHFINDING.md): threading the final rotated lane past the now-solid door
    // JAMBS from this worst-case approach needs planner-visible hulls — that is Layer 0's recorded trigger,
    // not this slice's contract. Axis-aligned and near-side approaches board fully (the tests above/below).
    const sys = seaWorld();
    const ship = makeShip(sys.world, 500, 500, 0.6); // rotated — the diagonal-docking geometry
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const helm = helmSpot(grid);
    const foe = makeActor(sys.world, 0, 0);
    foe.onDeck = { shipId: ship.id, lx: helm.lx, ly: helm.ly };
    sys.ships.update(SIM);
    const { mouth } = doorOf(ship);
    const chaser = makeActor(sys.world, 2 * 500 - mouth.x, 2 * 500 - mouth.y); // diametrically OPPOSITE the door
    driveByLeg(sys, chaser, () => ({ x: foe.transform!.x, y: foe.transform!.y, shipId: foe.onDeck?.shipId }), 1500, () => !!chaser.onDeck);
    const d = Math.hypot(chaser.transform!.x - mouth.x, chaser.transform!.y - mouth.y);
    expect(chaser.onDeck ?? d < grid.tilePx * 2.5).toBeTruthy(); // boarded, or at least ROUNDED the hull to the door quarter (pre-fix: pinned a full hull-length away)
  });

  it('an aboard follower heeling to a leader ASHORE walks off through the door (deck → world)', () => {
    const sys = seaWorld();
    const ship = makeShip(sys.world, 500, 500, 0);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const helm = helmSpot(grid);
    const follower = makeActor(sys.world, 0, 0);
    follower.onDeck = { shipId: ship.id, lx: helm.lx, ly: helm.ly };
    follower.mover!.frameCd = 0;
    sys.ships.update(SIM);
    const { mouth } = doorOf(ship);
    const leaderSpot = { x: mouth.x - 80, y: mouth.y }; // the leader stands off the lane, in the water/shore line
    driveByLeg(sys, follower, () => ({ x: leaderSpot.x, y: leaderSpot.y }), 600, () => !follower.onDeck);
    expect(follower.onDeck).toBeUndefined(); // stepped off through the door — followers aren't marooned
  });
});
