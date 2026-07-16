import { describe, expect, it } from 'vitest';
import { deckCellAtLocal, deckOf, deckToWorld, gangplankCell, gangplankOutward, worldToDeck } from '../src/defs/decks';
import { TERRAIN } from '../src/defs/terrains';
import { ShipHulls } from '../src/defs/ships';
import { hullBlocksOutside } from '../src/world/deckCollision';
import { enterDeck } from '../src/world/frames';
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

  it('ONE hull truth: a rail is a FULL-TILE block to every mode (the simple-collision overhaul)', () => {
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const rail = grid.cells.find((c) => c.cx === 2 && c.cy === 3)!; // south rail amidships
    expect(hullBlocksOutside(grid, rail.lx, rail.ly + 12, 11)).toBe(true); // anywhere in the cell blocks anyone
    expect(hullBlocksOutside(grid, rail.lx, rail.ly + 16 + 12, 11)).toBe(false); // a radius past the cell line — open sea
  });

  it('the plank STRADDLE takes every direction — 8 compass pushes all make real progress (no diagonal stick)', () => {
    // the report sequence: at the outer straddle (half on the board, half off) vertical input was fixed by
    // the lateral side-exit, but DIAGONALS still stuck — inward diagonals crab-walked with the lateral
    // component dead against the walker's own overhang, and shallow-tilted laterals ping-ponged exit/board
    // (an exit with any inward component immediately re-boarded). Every push must move you ALONG ITS OWN
    // direction, whether that resolves deck-framed (the corridor) or via a handoff to world.
    const DIRS: Array<[number, number]> = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [Math.SQRT1_2, Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2],
      [-Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2],
    ];
    for (const [ux, uy] of DIRS) {
      const { world, move, hulls, ships } = sea(TERRAIN.shallowWater);
      const ship = makeShip(world);
      const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
      const gp = gangplankCell(grid)!;
      const [ox, oy] = gangplankOutward(grid, gp);
      // the straddle: center 1px inside the board's outer end line, nudged 5px off the lane centerline
      // (a perfectly centered start would hide lateral-axis bugs behind symmetry)
      const slx = gp.lx + ox * (grid.tilePx / 2 - 1) - oy * 5;
      const sly = gp.ly + oy * (grid.tilePx / 2 - 1) + ox * 5;
      const w = deckToWorld(ship.transform!, slx, sly);
      const a = actor(world, w.x, w.y);
      enterDeck(a, ship.id, slx, sly);
      a.mover!.frameCd = 0;
      for (let i = 0; i < 90; i++) {
        a.mover!.vx = ux * 95;
        a.mover!.vy = uy * 95;
        move.update(SIM);
        ships.update(SIM);
        hulls.update();
      }
      const wx = a.onDeck ? deckToWorld(ship.transform!, a.onDeck.lx, a.onDeck.ly) : a.transform!;
      const progress = (wx.x - w.x) * ux + (wx.y - w.y) * uy;
      expect(progress, `push (${ux.toFixed(2)}, ${uy.toFixed(2)}) from the straddle`).toBeGreaterThan(10);
    }
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
      // the invariant guards the SETTLED world frame: a world body's center may never sit on a rail cell —
      // except mid-TRANSITION (frameCd running): the straddle walk-off exits with the center still on the
      // rail by design, walking its overlap out during the beat. Deck-frame perch on the gunwale is legal.
      if (!a.onDeck && (a.mover!.frameCd ?? 0) <= 0) {
        const l = worldToDeck(ship.transform!, a.transform!.x, a.transform!.y);
        expect(deckCellAtLocal(grid, l.lx, l.ly)?.tile).not.toBe('rail');
      }
    }
  });
});
