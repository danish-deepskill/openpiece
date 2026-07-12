import { describe, expect, it } from 'vitest';
import { deckCellAtLocal, deckOf, deckToWorld, gangplankCell, worldToDeck } from '../src/defs/decks';
import { TERRAIN } from '../src/defs/terrains';
import { ShipHulls } from '../src/defs/ships';
import { hullBlocksOutside } from '../src/world/deckCollision';
import type { Entity } from '../src/ecs/components';
import { World } from '../src/ecs/World';
import { Collision } from '../src/world/Collision';
import { TileGrid } from '../src/world/TileGrid';
import { HullCollisionSystem } from '../src/systems/HullCollisionSystem';
import { MovementSystem } from '../src/systems/MovementSystem';
import { ShipSystem } from '../src/systems/ShipSystem';

/**
 * THE RAIL IS A WALL TO FEET (the "walked onto the rail without jumping" report): a rail cell's open
 * sea-facing half is a SWIMMER's affordance — float right up to the drawn wood — never a footpath. A
 * GROUNDED walker tests the hull with full-cell rails (deckCollision hullWall), so the half-tile strip
 * inside rail cells (worst around the gangplank, where the lane connects to it) can't be walked into;
 * only true wood-overlap lifts the veto (walk yourself free), and only until you're clear of the wood.
 */

const SIM = 1 / 60;

function sea(tile = 0 /* deep water */) {
  const g = new TileGrid(40, 40);
  g.tiles = Array.from({ length: 40 }, () => Array.from({ length: 40 }, () => tile));
  const world = new World();
  const collision = new Collision(g);
  return { world, move: new MovementSystem(world, collision), hulls: new HullCollisionSystem(world), ships: new ShipSystem(world, collision) };
}

function makeShip(world: World): Entity {
  return world.create({
    transform: { x: 500, y: 500, angle: 0, r: 56 },
    ship: { hull: 'ship.sloop', mode: 'exploration', anchored: true, speed: 0, throttle: 0 },
  });
}

function actor(world: World, x: number, y: number): Entity {
  return world.create({
    transform: { x, y, angle: 0, r: 11 },
    mover: { vx: 0, vy: 0, speed: 95, mass: 1, mode: 'foot', dodgeT: 0, dvx: 0, dvy: 0 },
  });
}

describe('the rail walls a grounded walker (hullWall)', () => {
  it("a WADER walking sideways from the gangplank lane never gets its center inside a rail cell", () => {
    // the report happens DOCKSIDE: the water at the door is SHALLOW, so the glitcher is a grounded WADER
    // (mode 'foot'), not a swimmer — swimmers are ALLOWED through the strip (hugging the drawn wood).
    const { world, move, hulls, ships } = sea(TERRAIN.shallowWater);
    const ship = makeShip(world);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const gp = gangplankCell(grid)!;
    // in the lane, near the door line — the exact spot the pre-fix wader slid from into the flank rail's strip
    const start = deckToWorld(ship.transform!, gp.lx - 12, gp.ly);
    const a = actor(world, start.x, start.y);
    for (let i = 0; i < 240; i++) {
      a.mover!.vx = 0;
      a.mover!.vy = 95; // shove SOUTH, along the hull face, straight at the flanking rail
      move.update(SIM);
      ships.update(SIM);
      hulls.update();
      const l = worldToDeck(ship.transform!, a.transform!.x, a.transform!.y);
      expect(a.mover!.mode).toBe('foot'); // wading the shallows — the grounded truth applies
      expect(deckCellAtLocal(grid, l.lx, l.ly)?.tile).not.toBe('rail'); // the strip is a WALL now, not a footpath
    }
    expect(a.onDeck).toBeUndefined(); // and sideways pressure never boarded him either
  });

  it('a wood-WEDGED walker can still free itself but cannot TRAVERSE the gunwale', () => {
    const { world, move, hulls, ships } = sea(TERRAIN.shallowWater); // dockside shallows — a WADER (swimmers may ride the strip by design)
    const ship = makeShip(world);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const gp = gangplankCell(grid)!;
    const spot = deckToWorld(ship.transform!, gp.lx - 6, gp.ly - 12); // wedged into the north flank's wood tip
    const a = actor(world, spot.x, spot.y);
    a.mover!.frameCd = 0;
    // push NORTH — pre-fix this rode the gunwale THROUGH two rail cells (center ON the rail, no jump). The
    // corner assist may legitimately route him AROUND the hull through the open water beside it — the
    // invariant is that his center NEVER rides a rail cell on the way.
    for (let i = 0; i < 300; i++) {
      a.mover!.vx = 0;
      a.mover!.vy = -95;
      move.update(SIM);
      ships.update(SIM);
      hulls.update();
      const l = worldToDeck(ship.transform!, a.transform!.x, a.transform!.y);
      expect(deckCellAtLocal(grid, l.lx, l.ly)?.tile).not.toBe('rail'); // never standing/riding the rail band
    }
    // (the escape gradient is DIAGONAL under the summed-penetration measure, so a north push may legitimately
    // route him out northwest AROUND the hull — the per-tick no-rail assertion above is the real invariant)
    // …and pushing ALONG/AWAY always moves him: the wedge repels and releases, it never CAGES (the
    // frozen-solid bug this test was born from).
    const x0 = a.transform!.x;
    for (let i = 0; i < 90; i++) {
      a.mover!.vx = -95; // west: parallel along the flank, then past its corner and clear
      a.mover!.vy = 0;
      move.update(SIM);
      ships.update(SIM);
      hulls.update();
    }
    expect(a.transform!.x).toBeLessThan(x0 - 20);
  });

  it('a wader PINNED inside the wall band (post walk-off spot) can always walk AWAY — never frozen', () => {
    // the follow-up report: the full-cell wall froze a wader whose body already overlapped the band (right
    // after a dockside walk-off, or drifting off-center at the door) — every nearby target was blocked too.
    // The escape rule: blocked-under-your-truth ⇒ steps that strictly gain clearance are always allowed.
    const { world, move, hulls, ships } = sea(TERRAIN.shallowWater);
    const ship = makeShip(world);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    // body center 6px south of the hull's south edge — overlapping the rail WALL band by 5px (blocked for a
    // walker) but clear of the drawn wood: the exact "can't move around the rail" dockside pin
    const pin = deckToWorld(ship.transform!, 0, (grid.rows * grid.tilePx) / 2 + 6);
    const a = actor(world, pin.x, pin.y);
    a.mover!.frameCd = 0;
    const y0 = a.transform!.y;
    for (let i = 0; i < 60; i++) {
      a.mover!.vx = 0;
      a.mover!.vy = 95; // walk SOUTH — away from the hull
      move.update(SIM);
      ships.update(SIM);
      hulls.update();
    }
    expect(a.transform!.y).toBeGreaterThan(y0 + 20); // escaped freely — the wall never freezes, only repels
  });

  it('the gangplank BOARD is a floor: standing on it over DEEP water keeps you a WALKER (no rail slip)', () => {
    // the report: standing on the plank (world frame, never boarded) over deep sea, the mode relabel called
    // you a SWIMMER — and the swimmer wood-hug slid half your hitbox onto the flanking rail with no jump.
    const { world, move, hulls, ships } = sea(); // DEEP water everywhere — the failing context
    const ship = makeShip(world);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const gp = gangplankCell(grid)!;
    const start = deckToWorld(ship.transform!, gp.lx, gp.ly); // standing ON the plank board
    const a = actor(world, start.x, start.y);
    for (let i = 0; i < 120; i++) {
      a.mover!.vx = 0;
      a.mover!.vy = -95; // push NORTH into the flanking rail
      move.update(SIM);
      ships.update(SIM);
      hulls.update();
      if (!a.onDeck) expect(a.mover!.mode).toBe('foot'); // on the board = standing, never "swimming"
      const l = worldToDeck(ship.transform!, a.transform!.x, a.transform!.y);
      expect(deckCellAtLocal(grid, l.lx, l.ly)?.tile).not.toBe('rail'); // walled flush — no half-body rail slip
    }
  });

  it('the two hull truths: the strip blocks a WALKER but stays open to a SWIMMER (hugging the drawn wood)', () => {
    // measured MID-HULL (the south rail amidships): the open-hull side is where the swimmer affordance lives —
    // the DOOR's flanking rails are solid JAMBS in both truths (see the jamb rule + the door test below).
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const rail = grid.cells.find((c) => c.cx === 2 && c.cy === 3)!; // south rail, away from the door
    const stripX = rail.lx;
    const stripY = rail.ly + 12; // in the cell's open sea-half (south of its wood line)
    expect(hullBlocksOutside(grid, stripX, stripY, 11, true)).toBe(true); // a wader is WALLED out of the strip
    expect(hullBlocksOutside(grid, stripX, stripY, 11, false)).toBe(false); // a swimmer still floats in it, up to the wood
  });

  it('the CENTER rule holds at the door: the angled lane approach can never put a center inside the rail', () => {
    // the world-frame door report: crossing the lane MOUTH (deep water) makes you a swimmer for two steps,
    // and the sea-half opening beside the plank let those steps slide the CENTER into the flanking rail —
    // then you flipped back to foot, frozen half-in. The center-never-in-a-rail-cell rule blocks it for
    // every mode (door rails are ordinary half-wood rails, consistent with the rest of the hull — the
    // developer's call; a swimmer's EDGE may hug the open half here like anywhere else).
    const { world, move, hulls, ships } = sea(); // DEEP water — the exact failing context
    const ship = makeShip(world);
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const gp = gangplankCell(grid)!;
    const start = deckToWorld(ship.transform!, gp.lx - grid.tilePx, gp.ly); // the lane mouth
    const a = actor(world, start.x, start.y);
    for (let i = 0; i < 240; i++) {
      a.mover!.vx = 67; // push NORTH-EAST — the diagonal that slipped past the door's north jamb
      a.mover!.vy = -67;
      move.update(SIM);
      ships.update(SIM);
      hulls.update();
      const l = worldToDeck(ship.transform!, a.transform!.x, a.transform!.y);
      expect(deckCellAtLocal(grid, l.lx, l.ly)?.tile).not.toBe('rail'); // never half-inside the jamb, any frame
    }
  });
});
