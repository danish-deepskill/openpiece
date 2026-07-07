import { describe, expect, it } from 'vitest';
import { LEDGE_MOVE_MULT, Tile } from '../src/config/constants';
import type { Entity } from '../src/ecs/components';
import { World } from '../src/ecs/World';
import { MovementSystem } from '../src/systems/MovementSystem';
import { Collision } from '../src/world/Collision';
import { TileGrid } from '../src/world/TileGrid';

/**
 * LOW-WALL LEDGE (docs/design/MOVEMENT_AIR.md) — a StoneWall/Tree is jumpable-OVER and standable-ON-TOP: land a
 * jump atop one and you PERCH (onLedge) — the low wall becomes walkable-but-slow for you until you step off onto
 * normal ground. Walking INTO it from the side (no perch) is still blocked. Distinguishes on-top vs beside without
 * a z-axis, via the onLedge state set only by LANDING there.
 */

const T = 32;
/** Grass everywhere, with a single StoneWall column at tile x=`wallCol` (a low wall to land on / walk into). */
function wallGrid(wallCol = 5): TileGrid {
  const g = new TileGrid(12, 12);
  g.tiles = Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => Tile.Grass));
  for (let y = 0; y < 12; y++) g.tiles[y][wallCol] = Tile.StoneWall;
  return g;
}
function actor(world: World, x: number, y: number): Entity {
  return world.create({
    transform: { x, y, angle: 0, r: 8 },
    mover: { vx: 0, vy: 0, speed: 100, mass: 1, mode: 'foot', dodgeT: 0, dvx: 0, dvy: 0 },
  });
}

describe('TileGrid low-wall walkability', () => {
  it('a stone wall blocks a normal foot actor, but is walkable while onLedge (perched)', () => {
    expect(TileGrid.walkable(Tile.StoneWall, 'foot', false)).toBe(false); // beside it → blocked
    expect(TileGrid.walkable(Tile.StoneWall, 'foot', true)).toBe(true); // perched on top → walkable
  });
  it('isLowWall marks stone walls and trees, not solid buildings or ground', () => {
    expect(TileGrid.isLowWall(Tile.StoneWall)).toBe(true);
    expect(TileGrid.isLowWall(Tile.Tree)).toBe(true);
    expect(TileGrid.isLowWall(Tile.Wall)).toBe(false); // a building wall is tall — not a ledge
    expect(TileGrid.isLowWall(Tile.Grass)).toBe(false);
  });
});

describe('landing on a low wall (MovementSystem)', () => {
  it('a jump that lands with its CENTER over a stone wall sets the perch (onLedge)', () => {
    const world = new World();
    const g = wallGrid(5);
    const e = actor(world, 5 * T + T / 2, 5 * T); // centered on the wall column
    e.mover!.layer = 'air'; // mid-jump
    e.mover!.airT = 0.001; // about to land THIS tick
    e.mover!.airDur = 0.5;
    new MovementSystem(world, new Collision(g)).update(0.05);
    expect(e.mover!.layer).toBe('ground'); // landed
    expect(e.mover!.onLedge).toBe(true); // perched atop the low wall (not stuck)
  });

  it('a jump landing on normal GROUND does not set a perch', () => {
    const world = new World();
    const g = wallGrid(5);
    const e = actor(world, 2 * T + T / 2, 5 * T); // over grass, far from the wall
    e.mover!.layer = 'air';
    e.mover!.airT = 0.001;
    e.mover!.airDur = 0.5;
    new MovementSystem(world, new Collision(g)).update(0.05);
    expect(e.mover!.layer).toBe('ground');
    expect(e.mover!.onLedge).toBeFalsy();
  });

  it('a perched actor can MOVE along the wall (walkable) but at the slow ledge speed', () => {
    const world = new World();
    const g = wallGrid(5);
    const e = actor(world, 5 * T + T / 2, 5 * T); // on the wall
    e.mover!.onLedge = true;
    e.mover!.vy = 100; // walk along the wall (north-south, staying on the column)
    const y0 = e.transform!.y;
    new MovementSystem(world, new Collision(g)).update(0.1);
    const moved = e.transform!.y - y0;
    expect(moved).toBeGreaterThan(0); // it MOVED (not stuck)
    expect(moved).toBeCloseTo(100 * 0.1 * LEDGE_MOVE_MULT, 1); // at the slow perch speed
    expect(e.mover!.onLedge).toBe(true); // still on the wall → still perched
  });

  it('stepping OFF the wall onto grass clears the perch (full speed resumes, wall re-blocks)', () => {
    const world = new World();
    const g = wallGrid(5);
    const e = actor(world, 5 * T + T / 2, 5 * T); // on the wall
    e.mover!.onLedge = true;
    e.mover!.vx = 100; // walk east, off the wall onto grass
    const mv = new MovementSystem(world, new Collision(g));
    for (let i = 0; i < 20; i++) mv.update(0.1);
    expect(e.mover!.onLedge).toBeFalsy(); // stepped onto normal ground → perch cleared
    expect(e.transform!.x).toBeGreaterThan(6 * T); // made it past the wall column onto the far grass
  });

  it('the step-off is SMOOTH — no backward teleport when the perch clears (the unstick-fling bug)', () => {
    const world = new World();
    const g = wallGrid(5);
    const e = actor(world, 5 * T + T / 2, 5 * T); // on the wall
    e.mover!.onLedge = true;
    e.mover!.vx = 100; // walk east off the wall
    const mv = new MovementSystem(world, new Collision(g));
    let prevX = e.transform!.x;
    for (let i = 0; i < 20; i++) {
      mv.update(0.1);
      expect(e.transform!.x).toBeGreaterThanOrEqual(prevX - 0.001); // MONOTONIC — never snapped backward
      prevX = e.transform!.x;
    }
  });

  it('a NORMAL actor (no perch) cannot walk INTO the wall from the side', () => {
    const world = new World();
    const g = wallGrid(5);
    const e = actor(world, 3 * T, 5 * T); // on grass, west of the wall
    e.mover!.vx = 100; // walk east toward the wall
    const mv = new MovementSystem(world, new Collision(g));
    for (let i = 0; i < 20; i++) mv.update(0.1);
    expect(e.mover!.onLedge).toBeFalsy(); // never perched (didn't jump onto it)
    expect(e.transform!.x).toBeLessThan(5 * T - e.transform!.r); // walled out — stopped before the wall column
  });
});
