import { describe, expect, it } from 'vitest';
import { SWIM_MOVE_MULT } from '../src/config/constants';
import { TERRAIN } from '../src/defs/terrains';
import type { Entity } from '../src/ecs/components';
import { World } from '../src/ecs/World';
import { MovementSystem } from '../src/systems/MovementSystem';
import { Collision } from '../src/world/Collision';
import { TileGrid } from '../src/world/TileGrid';

/**
 * SWIM — a distinct MoveMode ('swim'), like 'boat'. A foot actor that steps off the shore into deep Water
 * TRANSITIONS to swimming (enterable but slow); a swimmer that reaches land climbs out to 'foot'. The mode is
 * a STORED fact (set by the one transition in MovementSystem) — collision/render read the mode, not the tile.
 */

const TILE = 32;
/** A grid: land (Grass) on the west half, deep Water on the east half; the shoreline is at column `shoreCol`. */
function shoreGrid(shoreCol = 10) {
  const g = new TileGrid(20, 20);
  g.tiles = Array.from({ length: 20 }, () => Array.from({ length: 20 }, (_, tx) => (tx >= shoreCol ? TERRAIN.water : TERRAIN.grass)));
  return g;
}
/** The REAL coastline: Grass | a ShallowWater ring (one column) | deep Water — so we test the shallow→deep seam. */
function coastGrid(): TileGrid {
  const g = new TileGrid(20, 20);
  g.tiles = Array.from({ length: 20 }, () =>
    Array.from({ length: 20 }, (_, tx) => (tx < 10 ? TERRAIN.grass : tx === 10 ? TERRAIN.shallowWater : TERRAIN.water)),
  );
  return g;
}
function swimmer(world: World, x: number, y: number): Entity {
  return world.create({
    transform: { x, y, angle: 0, r: 8 },
    mover: { vx: 0, vy: 0, speed: 100, mass: 1, mode: 'foot', dodgeT: 0, dvx: 0, dvy: 0 },
  });
}

describe('swim mode transitions (MovementSystem)', () => {
  it('an ON-DECK actor over deep water does NOT become a swimmer — the deck keeps its mode', () => {
    const world = new World();
    const g = new TileGrid(20, 20);
    g.tiles = Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => TERRAIN.water)); // all sea
    const e = swimmer(world, 5 * TILE, 5 * TILE); // sitting on open water
    e.onDeck = { shipId: 999, lx: 0, ly: 0 }; // aboard a sloop (parented to the deck by ShipSystem)
    new MovementSystem(world, new Collision(g)).update(0.2);
    expect(e.mover!.mode).toBe('foot'); // still 'foot' — NOT relabeled swim by the sea under the boat
  });

  it('a FOOT actor stepping off the shore into deep Water becomes a SWIMMER', () => {
    const world = new World();
    const grid = shoreGrid(10); // water starts at x ≈ 320
    const e = swimmer(world, 10 * TILE - 6, 5 * TILE); // just WEST of the shoreline, on grass
    e.mover!.vx = 100; // heading east, into the sea
    expect(e.mover!.mode).toBe('foot');
    new MovementSystem(world, new Collision(grid)).update(0.2);
    expect(e.mover!.mode).toBe('swim'); // crossed into the water → now swimming
    expect(e.transform!.x).toBeGreaterThan(10 * TILE - 6); // and actually entered (not walled out)
  });

  it('crosses the SHALLOW ring into DEEP water (the shallow→deep seam bug)', () => {
    const world = new World();
    const grid = coastGrid(); // grass <10 | shallow @10 | deep >10 (water starts x≈352)
    const e = swimmer(world, 9 * TILE, 5 * TILE); // wading out from the grass, through the shallows
    e.mover!.vx = 100; // heading east into the sea
    const mv = new MovementSystem(world, new Collision(grid));
    for (let i = 0; i < 30; i++) mv.update(0.1); // wade the shallows, then into the deep
    expect(e.mover!.mode).toBe('swim'); // made it past the shallow ring into deep water (not walled out)
    expect(e.transform!.x).toBeGreaterThan(11 * TILE); // actually reached the deep water
  });

  it('a SWIMMER reaching LAND climbs out to FOOT', () => {
    const world = new World();
    const grid = shoreGrid(10);
    const e = swimmer(world, 11 * TILE, 5 * TILE); // out in the water
    e.mover!.mode = 'swim';
    e.mover!.vx = -100; // heading west, back toward shore
    const mv = new MovementSystem(world, new Collision(grid));
    for (let i = 0; i < 20; i++) mv.update(0.1); // swim back to the beach
    expect(e.mover!.mode).toBe('foot'); // reached the shoreline → climbed out of the water
    expect(e.transform!.x).toBeLessThan(11 * TILE); // moved shoreward from the open water toward land
  });

  it('a SWIMMER entering the SHALLOWS goes back to FOOT (shallows are WADED, not swum)', () => {
    const world = new World();
    const grid = coastGrid(); // grass <10 | shallow @10 | deep >10
    const e = swimmer(world, 12 * TILE, 5 * TILE); // out in the deep
    e.mover!.mode = 'swim';
    e.mover!.vx = -100; // heading west, back toward the shallow ring
    const mv = new MovementSystem(world, new Collision(grid));
    for (let i = 0; i < 25; i++) mv.update(0.1);
    expect(e.mover!.mode).toBe('foot'); // reached the shallows → wading on foot, not still swimming
    expect(e.transform!.x).toBeLessThanOrEqual(11 * TILE); // made it back to the shallow ring / shore
  });

  it('exiting deep water into a shallow CORNER does not get stuck (diagonal deep-adjacent)', () => {
    // L-shaped coast: deep Water fills the NE quadrant (tx≥10 OR ty≥10); the rest is Grass with a shallow seam.
    // A swimmer in the deep heading SW toward the inner corner must climb out cleanly — the corner leaves deep
    // water diagonally adjacent, which the old ahead/behind/center exit check missed → it stranded there.
    const world = new World();
    const g = new TileGrid(20, 20);
    g.tiles = Array.from({ length: 20 }, (_, ty) =>
      Array.from({ length: 20 }, (_, tx) => (tx >= 11 || ty >= 11 ? TERRAIN.water : tx === 10 || ty === 10 ? TERRAIN.shallowWater : TERRAIN.grass)),
    );
    const e = swimmer(world, 13 * TILE, 13 * TILE); // deep, out past the corner
    e.mover!.mode = 'swim';
    e.mover!.vx = -100; // heading toward the inner (SW) corner
    e.mover!.vy = -100;
    const mv = new MovementSystem(world, new Collision(g));
    const startD = e.transform!.x + e.transform!.y;
    for (let i = 0; i < 40; i++) mv.update(0.1);
    expect(e.transform!.x + e.transform!.y).toBeLessThan(startD - TILE); // actually moved toward shore (not stuck at the corner)
  });

  it('swimming is SLOWER than walking (the swim speed multiplier)', () => {
    const world = new World();
    const grid = shoreGrid(10);
    const e = swimmer(world, 11 * TILE, 5 * TILE);
    e.mover!.mode = 'swim';
    e.mover!.vx = 100; // steady eastward (deeper into open water, no shore to hit)
    const x0 = e.transform!.x;
    new MovementSystem(world, new Collision(grid)).update(0.1);
    const swamDist = e.transform!.x - x0;
    expect(swamDist).toBeCloseTo(100 * 0.1 * SWIM_MOVE_MULT, 2); // moved at the reduced swim speed
  });
});
