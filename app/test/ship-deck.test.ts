import { describe, expect, it } from 'vitest';
import { deckOf, deckToWorld, gangplankCell, helmSpot } from '../src/defs/decks';
import { ShipHulls } from '../src/defs/ships';
import { deckCanOccupy, hullBlocksWorldPoint } from '../src/world/deckCollision';
import type { Entity } from '../src/ecs/components';
import { World } from '../src/ecs/World';
import { ShipSystem } from '../src/systems/ShipSystem';
import { HullCollisionSystem } from '../src/systems/HullCollisionSystem';
import { MovementSystem } from '../src/systems/MovementSystem';
import { enterDeck } from '../src/world/frames';
import { Collision } from '../src/world/Collision';
import { TileGrid } from '../src/world/TileGrid';

/**
 * LOCAL-SPACE PARENTING (walkable-ship step 2) — an on-deck actor carries a LOCAL deck spot (onDeck.lx/ly); each
 * tick ShipSystem re-derives its WORLD position as `ship.pos + rotate(local, ship.angle)`, so it rides the deck
 * as the hull moves + turns. This is the transform the whole pillar (walking, click-a-tile, cannons) stands on.
 */

/** All-water grid so a ship can sail anywhere (no running aground in the test). Returns the ship + movement systems
 *  — deck locomotion now lives in MovementSystem (reads mover.vx/vy as the frame-neutral intent, movement-frames.md). */
function seaSystem(): { world: World; ships: ShipSystem; move: MovementSystem } {
  const g = new TileGrid(40, 40);
  g.tiles = Array.from({ length: 40 }, () => Array.from({ length: 40 }, () => 0 /* TERRAIN.water */));
  const world = new World();
  const collision = new Collision(g);
  return { world, ships: new ShipSystem(world, collision), move: new MovementSystem(world, collision) };
}

/** Drive an on-deck actor with a world-space velocity intent for N ticks (the new path: set mover.vx/vy → MovementSystem
 *  resolves it in the deck frame). Replaces the old ships.walkDeck(). Stops early if the actor leaves the deck. */
function walkDeckIntent(move: MovementSystem, e: Entity, vx: number, vy: number, ticks: number, dt = 0.05): void {
  for (let i = 0; i < ticks; i++) {
    if (!e.onDeck) break;
    e.mover!.vx = vx;
    e.mover!.vy = vy;
    move.update(dt);
  }
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
    // same LOCAL spot, new heading → the bow spot now projects along +y (POSITION rides the turn)
    expect(a.transform!.x).toBeCloseTo(500, 6);
    expect(a.transform!.y).toBeCloseTo(540, 6);
    // FACING is NOT touched by parenting — an on-deck actor aims freely (Input owns angle), so it stays at 0 here
    expect(a.transform!.angle).toBeCloseTo(0, 6);
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

  it('enterDeck (the frame primitive) puts the actor on the deck and NORMALIZES state (swim/dive cleared)', () => {
    // the ONE world→deck transition: a SWIMMER boarding must come out labeled 'foot', or SwimSystem would keep
    // draining breath and drown them standing on dry planks (the exact bug a raw onDeck write once caused).
    const { world } = seaSystem();
    const ship = makeShip(world, 700, 700, 0);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const spot = grid.cells.find((c) => c.tile === 'deck')!;
    const a = makeActor(world, 660, 700);
    a.mover!.mode = 'swim'; // boarded straight out of the water
    a.mover!.submerged = true;
    enterDeck(a, ship.id, spot.lx, spot.ly);
    expect(a.onDeck?.shipId).toBe(ship.id);
    expect(a.mover!.mode).toBe('foot'); // on dry planks now
    expect(a.mover!.submerged).toBe(false);
    expect((a.mover!.frameCd ?? 0) > 0).toBe(true); // anti-ping-pong beat started
    expect(deckCanOccupy(grid, a.onDeck!.lx, a.onDeck!.ly, a.transform!.r, false)).toBe(true); // a real deck cell
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
  it('walking the deck moves the local spot; stepping ONTO the helm tile grants piloting', () => {
    const { world, ships, move } = seaSystem();
    const ship = makeShip(world, 500, 500, 0); // heading 0
    const a = makeActor(world, 0, 0);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const helm = helmSpot(grid);
    // start one tile east of the helm, then walk WEST (−x world) onto the helm
    a.onDeck = { shipId: ship.id, lx: helm.lx + grid.tilePx, ly: helm.ly };
    expect(ships.atHelm(a)).toBe(false);
    walkDeckIntent(move, a, -100, 0, 40); // walk west (100 px/s) toward the helm
    expect(ships.atHelm(a)).toBe(true); // reached the wheel → can steer now
  });

  it('a foot actor cannot walk off the deck into the sea (rail walls it)', () => {
    const { world, move } = seaSystem();
    const ship = makeShip(world, 500, 500, 0);
    const a = makeActor(world, 0, 0);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const helm = helmSpot(grid);
    a.onDeck = { shipId: ship.id, lx: helm.lx, ly: helm.ly };
    walkDeckIntent(move, a, 0, -100, 80); // shove NORTH toward the port rail, hard
    expect(a.onDeck).toBeDefined(); // still aboard (walled, not walked into the sea)
    expect(deckCanOccupy(grid, a.onDeck!.lx, a.onDeck!.ly, a.transform!.r, false)).toBe(true); // on a valid deck cell
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

  it('walking the deck is FULL speed (not slowed by the sea under the hull — the deck-slow regression)', () => {
    const { world, move } = seaSystem(); // all-water grid → the tile under the hull is deep Water
    const ship = makeShip(world, 500, 500, 0); // heading 0, so deck-local +x == world +x
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const helm = helmSpot(grid);
    const a = makeActor(world, 0, 0); // speed 100
    a.onDeck = { shipId: ship.id, lx: helm.lx, ly: helm.ly };
    const x0 = a.onDeck.lx;
    a.mover!.vx = 100; // walk east
    a.mover!.vy = 0;
    move.update(0.1);
    // moved ~ speed·dt = 10px (NOT the swim/wade half-pace) — the deck is dry wood, not the ocean under it
    expect(a.onDeck!.lx - x0).toBeCloseTo(10, 1);
  });

  it('PERCHED on the rail (onDeck), you can walk INWARD off it onto the deck (not stuck)', () => {
    const { world, move } = seaSystem();
    const ship = makeShip(world, 500, 500, 0);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const rail = grid.cells.find((c) => c.tile === 'rail')!; // some rail cell
    const a = makeActor(world, 0, 0);
    a.mover!.onLedge = true; // perched (as if just landed on the rail)
    a.onDeck = { shipId: ship.id, lx: rail.lx, ly: rail.ly };
    // walk toward the deck INTERIOR (toward the ship center = toward local origin)
    const startD = Math.hypot(rail.lx, rail.ly);
    walkDeckIntent(move, a, -Math.sign(rail.lx) * 100 || 100, -Math.sign(rail.ly) * 100 || 0, 40);
    expect(a.onDeck).toBeDefined(); // still aboard
    expect(Math.hypot(a.onDeck!.lx, a.onDeck!.ly)).toBeLessThan(startD - 1); // moved off the rail toward the interior
  });

  it('a FOOT walker is walled by the rail (stays aboard); an AIRBORNE walker clears it and LEAVES the ship', () => {
    // The rail is a LOW WALL: a foot walker can't cross it (stays aboard). An airborne walker (mid-Geppo) clears it
    // AND — pushing off the deck edge — exits the deck frame entirely, flying out to world space (the leap-off).
    const { world, move } = seaSystem();
    const ship = makeShip(world, 500, 500, 0);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const helm = helmSpot(grid);

    const foot = makeActor(world, 0, 0);
    foot.onDeck = { shipId: ship.id, lx: helm.lx, ly: helm.ly };
    walkDeckIntent(move, foot, 0, -100, 40); // foot: shove north into the rail
    expect(foot.onDeck).toBeDefined(); // walled by the rail — still aboard
    expect(deckCanOccupy(grid, foot.onDeck!.lx, foot.onDeck!.ly, foot.transform!.r, false)).toBe(true);

    const air = makeActor(world, 0, 0);
    air.mover!.layer = 'air';
    air.mover!.airT = 10; // stay aloft across the ticks (long jump)
    air.mover!.airDur = 10;
    air.onDeck = { shipId: ship.id, lx: helm.lx, ly: helm.ly };
    walkDeckIntent(move, air, 0, -100, 40); // airborne: shove north off the deck
    expect(air.onDeck).toBeUndefined(); // cleared the rail AND flew off the edge → left the ship (world space now)
    expect(air.mover!.layer).toBe('air'); // still airborne (will land in the world)
  });

  it('WALK-OFF: on the gangplank pushing OUTWARD steps off the ship (deck → world), even from the cell center', () => {
    const { world, move } = seaSystem();
    const ship = makeShip(world, 500, 500, 0); // heading 0
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const gp = gangplankCell(grid)!; // sloop gangplank faces WEST (−x is off-grid)
    const a = makeActor(world, 0, 0);
    a.onDeck = { shipId: ship.id, lx: gp.lx, ly: gp.ly }; // stood on the gangplank CELL CENTER (the old bug spot)
    a.mover!.frameCd = 0; // not in the post-board cooldown
    walkDeckIntent(move, a, -100, 0, 1); // push WEST (outward through the door), one tick
    expect(a.onDeck).toBeUndefined(); // stepped off — now a world-space walker
    expect(a.transform!.x).toBeLessThan(500); // landed west of the ship center (out the door)
  });

  it('WALK-OFF does NOT fire while pushing INWARD on the gangplank (you keep walking the deck)', () => {
    const { world, move } = seaSystem();
    const ship = makeShip(world, 500, 500, 0);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const gp = gangplankCell(grid)!;
    const a = makeActor(world, 0, 0);
    a.onDeck = { shipId: ship.id, lx: gp.lx, ly: gp.ly };
    a.mover!.frameCd = 0;
    walkDeckIntent(move, a, 100, 0, 1); // push EAST (inward, away from the door)
    expect(a.onDeck).toBeDefined(); // still aboard — inward move doesn't leave
  });

  it('the door is DIRECTION-AWARE: off right after on works, and an OUTBOUND walker is never re-caught', () => {
    const { world, move } = seaSystem();
    const hulls = new HullCollisionSystem(world);
    const ship = makeShip(world, 500, 500, 0);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const gp = gangplankCell(grid)!;
    const a = makeActor(world, 0, 0);
    enterDeck(a, ship.id, gp.lx, gp.ly); // just boarded → frameCd is running
    walkDeckIntent(move, a, -100, 0, 1); // reverse straight back out (outward = west)
    expect(a.onDeck).toBeUndefined(); // no 0.4s hold at the door — leaving is DIRECTION, not cooldown
    a.mover!.vx = -100; // still heading out through the lane
    a.mover!.vy = 0;
    hulls.update();
    expect(a.onDeck).toBeUndefined(); // and the door does not re-catch a walker moving OUT
  });

  it('GANGPLANK WALK-ON is continuous: an inbound walker boards WHERE ITS FEET ARE (no snap to cell center)', () => {
    const { world, ships, move } = seaSystem();
    const hulls = new HullCollisionSystem(world);
    const ship = makeShip(world, 500, 500, 0);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const gp = gangplankCell(grid)!; // sloop's door faces WEST (outward −x)
    const start = deckToWorld(ship.transform!, gp.lx - grid.tilePx, gp.ly); // in the lane, outside the plank
    const a = makeActor(world, start.x, start.y);
    let prevX = a.transform!.x;
    let stepAtBoard = 0;
    for (let i = 0; i < 120 && !a.onDeck; i++) {
      a.mover!.vx = 100; // walk EAST — inward, through the door
      a.mover!.vy = 0;
      move.update(1 / 60);
      ships.update(1 / 60);
      hulls.update();
      if (a.onDeck) stepAtBoard = Math.abs(a.transform!.x - prevX);
      prevX = a.transform!.x;
    }
    expect(a.onDeck).toBeDefined(); // walked in through the door
    expect(stepAtBoard).toBeLessThan(4); // boarded where it stood — the old code SNAPPED to the cell center
    expect(a.onDeck!.ly).toBeCloseTo(gp.ly, 0); // kept its lane line, not teleported onto (gp.lx, gp.ly)
  });

  it('standing STILL in the doorway does nothing — not boarded, not pushed', () => {
    const { world } = seaSystem();
    const hulls = new HullCollisionSystem(world);
    const ship = makeShip(world, 500, 500, 0);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const gp = gangplankCell(grid)!;
    const w = deckToWorld(ship.transform!, gp.lx, gp.ly);
    const a = makeActor(world, w.x, w.y); // parked on the plank, no intent
    hulls.update();
    expect(a.onDeck).toBeUndefined(); // the door is a passage, not a pressure plate
    expect(a.transform!.x).toBe(w.x); // and the lane never pushes
    expect(a.transform!.y).toBe(w.y);
  });

  it('landing STRADDLING the rail seam (center on the interior, body over the rail) perches instead of freezing', () => {
    // The reported jump-onto-the-rail freeze: the old rule perched only when the CENTER cell was rail, so a body
    // half over the rail landed grounded-ILLEGAL — every step overlapped the solid rail and was rejected, and the
    // deck has no depenetration. Perch-as-needed: grounded rules reject the spot → you grab the rail instead.
    const { world, ships, move } = seaSystem();
    const ship = makeShip(world, 500, 500, 0);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const spot = grid.cells.find((c) => c.cx === 2 && c.cy === 2)!; // '.' interior beside the south rail
    const a = makeActor(world, 0, 0);
    a.onDeck = { shipId: ship.id, lx: spot.lx, ly: spot.ly + 12 }; // ly 28: center on the interior, body over the rail (r=8 spans 20..36, rail row starts at 32)
    a.mover!.layer = 'air';
    a.mover!.airT = 0.01; // about to touch down right here
    a.mover!.airDur = 0.5;
    ships.update(1 / 60);
    move.update(1 / 60); // lands
    expect(a.mover!.onLedge).toBe(true); // hanging onto the rail — a legal, movable state
    const y0 = a.onDeck!.ly;
    walkDeckIntent(move, a, 0, -100, 30); // walk back inboard
    expect(a.onDeck!.ly).toBeLessThan(y0 - 5); // can actually move (was: every step rejected, frozen)
    expect(a.mover!.onLedge).toBe(false); // and the perch cleared itself once the body fit without it
  });

  it('a CORNER-rail landing with the body hanging past the hull is NOT adopted (was: a frozen perch)', () => {
    // The sometimes-stuck corner: center inside the corner rail cell but in its OUTER water corner → the body
    // spans past the hull edge on TWO sides. Adopting that spot is illegal even by the perched rules (off-hull
    // blocks everything), so every step was rejected. Feet over the sea = a water landing beside the hull.
    const { world, move } = seaSystem();
    const ship = makeShip(world, 500, 500, 0);
    // sloop SE corner cell (5,3) spans local x [64,96], y [32,64] — land at (92,60): body (r=8) hangs past both
    const w = deckToWorld(ship.transform!, 92, 60);
    const a = makeActor(world, w.x, w.y);
    a.mover!.layer = 'air';
    a.mover!.airT = 0.01; // about to touch down right here
    a.mover!.airDur = 0.5;
    move.update(1 / 60); // lands
    expect(a.onDeck).toBeUndefined(); // didn't make the gunwale — stayed a world walker in the water
    const x0 = a.transform!.x;
    const y0 = a.transform!.y;
    for (let i = 0; i < 30; i++) {
      a.mover!.vx = 100; // swim away seaward — must not be held
      a.mover!.vy = 100;
      move.update(1 / 60);
    }
    expect(Math.hypot(a.transform!.x - x0, a.transform!.y - y0)).toBeGreaterThan(10);
  });

  it('LEAP-BOARDING with the body over the rail seam perches (a boarded straddle stays movable)', () => {
    const { world, ships, move } = seaSystem();
    const hulls = new HullCollisionSystem(world);
    const ship = makeShip(world, 500, 500, 0);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const spot = grid.cells.find((c) => c.cx === 2 && c.cy === 2)!; // '.' interior beside the south rail
    const w = deckToWorld(ship.transform!, spot.lx, spot.ly + 12); // center on the interior, body over the rail
    const a = makeActor(world, w.x, w.y); // just landed here as a WORLD walker (leap-on path)
    hulls.update(); // boards
    expect(a.onDeck).toBeDefined();
    expect(a.mover!.onLedge).toBe(true); // perch-as-needed at the boarding door too — movable, not frozen
    const y0 = a.onDeck!.ly;
    ships.update(1 / 60);
    walkDeckIntent(move, a, 0, -100, 30); // walk inboard
    expect(a.onDeck!.ly).toBeLessThan(y0 - 5); // moves freely; perch clears itself
  });

  it('a walker WEDGED into the rail wood beside the door can walk itself FREE (was: frozen solid)', () => {
    // landed badly: center inside the door LANE (never pushed — the door must not shove people crossing it),
    // body overlapping the flanking rail's wood tip. Pre-fix, the hull veto rejected EVERY step (each target
    // still overlapped the wood), and with pushOut lane-exempt nothing ever freed it: a permanent freeze.
    const { world, move } = seaSystem();
    const ship = makeShip(world, 500, 500, 0);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const gp = gangplankCell(grid)!;
    const spot = deckToWorld(ship.transform!, gp.lx - 6, gp.ly - 12); // nudged into the north flanking rail
    const a = makeActor(world, spot.x, spot.y);
    const x0 = a.transform!.x;
    for (let i = 0; i < 40; i++) {
      a.mover!.vx = -100; // walk OUT, away from the ship
      a.mover!.vy = 0;
      move.update(1 / 60);
    }
    expect(a.transform!.x).toBeLessThan(x0 - 15); // walked free — embedded bodies are not step-vetoed
  });
});

describe('land-on-deck boarding (HullCollisionSystem — jump/Geppo over the rail)', () => {
  it('a grounded world walker whose center is over a deck interior cell BOARDS (the leap-onto-ship path)', () => {
    const { world, ships } = seaSystem();
    const hulls = new HullCollisionSystem(world);
    const ship = makeShip(world, 500, 500, 0);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const interior = grid.cells.find((c) => c.tile === 'deck')!; // a walkable interior cell
    // place a WORLD walker exactly over that interior cell in world space (as if it just LANDED there from a jump)
    const w = deckToWorld(ship.transform!, interior.lx, interior.ly);
    const a = makeActor(world, w.x, w.y);
    expect(a.onDeck).toBeUndefined(); // still a world walker (mid-scene: it landed inside the hull)
    hulls.update();
    expect(a.onDeck).toBeDefined(); // boarded — landing on the deck IS boarding (not pushed out)
  });

  it('an AIRBORNE walker over the deck is NOT boarded yet (still flying — boards on landing)', () => {
    const { world, ships } = seaSystem();
    const hulls = new HullCollisionSystem(world);
    const ship = makeShip(world, 500, 500, 0);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const interior = grid.cells.find((c) => c.tile === 'deck')!;
    const w = deckToWorld(ship.transform!, interior.lx, interior.ly);
    const a = makeActor(world, w.x, w.y);
    a.mover!.layer = 'air'; // still mid-jump over the deck
    hulls.update();
    expect(a.onDeck).toBeUndefined(); // airborne = skipped; it'll board when it lands (layer → ground)
  });

  it('AIRBORNE LEAVE: a Geppo/jump off the deck edge exits the deck frame (flies out to world space)', () => {
    const { world, move } = seaSystem();
    const ship = makeShip(world, 500, 500, 0); // heading 0
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    // stand on an OUTER deck cell nearest the bow rail, airborne, and push toward the rail/off the edge
    const east = grid.cells.filter((c) => c.tile === 'deck').reduce((a, b) => (b.lx > a.lx ? b : a));
    const a = makeActor(world, 0, 0);
    a.mover!.layer = 'air'; // mid-Geppo
    a.mover!.airT = 10; // stay aloft across the ticks
    a.mover!.airDur = 10;
    a.onDeck = { shipId: ship.id, lx: east.lx, ly: east.ly };
    walkDeckIntent(move, a, 200, 0, 30); // shove east (toward +x bow rail) — airborne crosses the rail, then flies off
    expect(a.onDeck).toBeUndefined(); // left the ship — now a world-space (still airborne) walker
    expect(a.mover!.layer).toBe('air'); // still flying (it'll land in the world)
    expect(a.transform!.x).toBeGreaterThan(500); // flew out past the ship center toward the bow
  });
});

describe('leaving the ship is CONTINUOUS (no teleport, no invisible wall)', () => {
  const SIM = 1 / 60;
  // the sloop's south rail amidships — its outward (sea-facing) side is south. Perch spot for every case below.
  // `r` defaults to the small test body; pass 11 for the REAL body.humanoid radius (wider than the outer band).
  function perchSetup(r = 8): { world: World; ships: ShipSystem; move: MovementSystem; ship: Entity; a: Entity; rail: { lx: number; ly: number } } {
    const { world, ships, move } = seaSystem();
    const ship = makeShip(world, 500, 500, 0);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const rail = grid.cells.find((c) => c.cx === 2 && c.cy === 3)!;
    const a = makeActor(world, 0, 0);
    a.transform!.r = r;
    a.onDeck = { shipId: ship.id, lx: rail.lx, ly: rail.ly };
    a.mover!.onLedge = true; // perched on the gunwale
    ships.update(SIM); // settle parenting so the world transform matches the perch before measuring
    return { world, ships, move, ship, a, rail };
  }

  it('AIRBORNE LEAVE hands off at the CURRENT spot — no tick ever moves farther than one flight step', () => {
    const { ships, move, a } = perchSetup();
    a.mover!.layer = 'air'; // jump seaward from the perch
    a.mover!.airT = 0.55;
    a.mover!.airDur = 0.55;
    a.mover!.frameCd = 0;
    let px = a.transform!.x;
    let py = a.transform!.y;
    let maxStep = 0;
    for (let i = 0; i < 90; i++) {
      a.mover!.vx = 0;
      a.mover!.vy = 100; // hold south (toward open sea)
      move.update(SIM);
      ships.update(SIM);
      maxStep = Math.max(maxStep, Math.hypot(a.transform!.x - px, a.transform!.y - py));
      px = a.transform!.x;
      py = a.transform!.y;
    }
    expect(a.onDeck).toBeUndefined(); // left the ship
    expect(a.mover!.mode).toBe('swim'); // came down in the water
    expect(py).toBeGreaterThan(564); // past the hull's south edge (500 + rows·tile/2)
    expect(maxStep).toBeLessThan(4); // ≈ speed·dt — the old exit SNAPPED a full tile (32px) in one tick
  });

  it('RAIL DROP-OFF: perched + pushing seaward steps down into the water (was an invisible wall)', () => {
    const { move, a, rail } = perchSetup();
    a.mover!.frameCd = 0; // past the post-landing beat
    walkDeckIntent(move, a, 0, 100, 30); // walk south, toward the open sea
    expect(a.onDeck).toBeUndefined(); // stepped down off the gunwale — not walled
    expect(a.mover!.onLedge).toBe(false); // off the wall
    expect(Math.abs(a.transform!.x - (500 + rail.lx))).toBeLessThan(8); // dropped WHERE IT STOOD, not flung
  });

  it('RAIL DROP-OFF with the standard humanoid (r=11, wider than the 16px outer band) NEVER jumps a tick', () => {
    // The console-caught snap: a body wider than the rail's outer water band can never stand clear of the wood
    // while on the hull, so it exits still OVERLAPPING the gunwale — and must be allowed to: the frame beat
    // mutes the hull eject while the embedded-veto lift lets it WALK itself clear. The whole drop must move at
    // WALK-STEP granularity, every tick — both prior attempts (radial eject, forward clearance slide) failed this.
    const { world, ships, move, a } = perchSetup(11);
    const hulls = new HullCollisionSystem(world);
    const ship = world.first('ship')!;
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    a.mover!.frameCd = 0;
    let px = a.transform!.x;
    let py = a.transform!.y;
    let maxStep = 0;
    for (let i = 0; i < 90; i++) {
      a.mover!.vx = 0;
      a.mover!.vy = 100; // hold seaward
      move.update(SIM);
      ships.update(SIM);
      hulls.update();
      maxStep = Math.max(maxStep, Math.hypot(a.transform!.x - px, a.transform!.y - py));
      px = a.transform!.x;
      py = a.transform!.y;
    }
    expect(a.onDeck).toBeUndefined(); // dropped off the gunwale
    expect(a.mover!.mode).toBe('swim');
    expect(maxStep).toBeLessThan(3); // walk-step granularity ONLY — no eject, no slide, no yank, ever
    expect(hullBlocksWorldPoint(ship.transform!, grid, px, py, 11)).toBe(false); // and it walked itself clear
  });

  it('the drop-off waits out the post-landing beat (landing on the rail holding seaward must not dunk you)', () => {
    const { move, a } = perchSetup();
    a.mover!.frameCd = 0.4; // just landed on the rail (enterDeck's anti-ping-pong beat)
    walkDeckIntent(move, a, 0, 100, 6); // ~0.3s of pushing seaward, still inside the beat
    expect(a.onDeck).toBeDefined(); // the beat holds the perch — no accidental instant drop
    walkDeckIntent(move, a, 0, 100, 30); // keep holding past the beat
    expect(a.onDeck).toBeUndefined(); // now the deliberate step-off happens
  });

  it('landing on the deck right after an exit BOARDS you mid-cooldown — no push-out fling', () => {
    const { world } = seaSystem();
    const hulls = new HullCollisionSystem(world);
    const ship = makeShip(world, 500, 500, 0);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const interior = grid.cells.find((c) => c.tile === 'deck')!;
    const w = deckToWorld(ship.transform!, interior.lx, interior.ly);
    const a = makeActor(world, w.x, w.y); // just LANDED here (grounded, center over the deck)
    a.mover!.frameCd = 0.3; // still inside the frame-switch beat from the exit moments ago
    hulls.update();
    expect(a.onDeck).toBeDefined(); // boarded in place — was: skipped (cooldown) then ejected to the hull edge
  });
});

describe('the hull is a true WALL to a world walker (MovementSystem move-block, not a teleport)', () => {
  it('walking INTO the rail from outside STOPS you at the hull — no push/teleport past it', () => {
    // a grounded world walker approaching the ship's side rail should be WALLED (its step rejected), landing just
    // outside the hull — not flung to the nearest sea (the old push bug) and not clipping through onto the deck.
    const g = new TileGrid(40, 40);
    g.tiles = Array.from({ length: 40 }, () => Array.from({ length: 40 }, () => 0 /* Water */));
    const world = new World();
    const move = new MovementSystem(world, new Collision(g));
    const ship = world.create({
      transform: { x: 500, y: 500, angle: 0, r: 56 },
      ship: { hull: 'ship.sloop', mode: 'exploration', anchored: true, speed: 0, throttle: 0 },
    });
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    // start WEST of the ship, out in open water, walking EAST into the port rail
    const a = makeActor(world, 500 - grid.cols * grid.tilePx, 500);
    a.mover!.vx = 200; // drive east toward the hull
    for (let i = 0; i < 60; i++) move.update(0.05);
    // it did NOT clip aboard, and did NOT teleport across — its center stays OUTSIDE the solid hull, walled at the rail
    const local = { lx: a.transform!.x - 500, ly: a.transform!.y - 500 }; // heading 0 → world offset = local
    expect(hullBlocksWorldPoint(ship.transform!, grid, a.transform!.x, a.transform!.y, a.transform!.r)).toBe(false); // sits clear of the hull
    expect(a.onDeck).toBeUndefined(); // still a world walker (didn't clip onto the deck)
    expect(local.lx).toBeLessThan(0); // stopped on the WEST (port) side — did not pass through to the far side
  });
});
