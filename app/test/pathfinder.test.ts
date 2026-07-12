import { describe, expect, it } from 'vitest';
import { TILE } from '../src/config/constants';
import { TERRAIN } from '../src/defs/terrains';
import { World } from '../src/ecs/World';
import { Pathfinder } from '../src/world/Pathfinder';
import { placeStructure } from '../src/world/StructureIndex';
import { TileGrid } from '../src/world/TileGrid';

const center = (t: number) => t * TILE + TILE / 2;

function grass(w: number, h: number): TileGrid {
  const g = new TileGrid(w, h);
  g.tiles = Array.from({ length: h }, () => Array.from({ length: w }, () => TERRAIN.grass));
  return g;
}

/** A vertical wall-STRUCTURE column at x=`col`, rows [y0, y1) — planning must read the structure layer. */
function wallColumn(g: TileGrid, col: number, y0: number, y1: number): void {
  const world = new World();
  for (let y = y0; y < y1; y++) placeStructure(world, g.structures, 'structure.wall', col, y);
}

describe('Pathfinder', () => {
  it('routes around a wall (down to the gap) instead of through it', () => {
    const g = grass(10, 10);
    wallColumn(g, 5, 0, 8); // vertical wall, gap at y=8,9
    const pf = new Pathfinder(g);
    const path = pf.findPath(center(2), center(2), center(8), center(2), 'foot');
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(0);
    // must detour down toward the gap (some waypoint at tile-row >= 8)
    expect(path!.some((p) => Math.floor(p.y / TILE) >= 8)).toBe(true);
    // never steps onto the wall column
    expect(path!.every((p) => Math.floor(p.x / TILE) !== 5 || Math.floor(p.y / TILE) >= 8)).toBe(true);
  });

  it('sight is blocked through a wall, clear otherwise', () => {
    const g = grass(10, 10);
    wallColumn(g, 5, 0, 8);
    const pf = new Pathfinder(g);
    expect(pf.sightLine(center(2), center(2), center(8), center(2))).toBe(false); // crosses x=5
    expect(pf.sightLine(center(2), center(2), center(2), center(7))).toBe(true); // clear column
  });

  it('DEEP WATER never blinds: sight crosses the sea even though foot PLANNING avoids it (the plank-chase bug)', () => {
    // the regression: vision once reused the foot-walkability rule, so a chaser lost a target standing on a
    // ship's deck (over water tiles) and walked home — sight is not walkability; eyes have no move mode.
    const g = grass(10, 10);
    for (let x = 3; x <= 6; x++) for (let y = 0; y < 10; y++) g.tiles[y][x] = TERRAIN.water; // a channel
    const pf = new Pathfinder(g);
    expect(pf.sightLine(center(1), center(5), center(8), center(5))).toBe(true); // sees clean across the water…
    expect(pf.findPath(center(1), center(5), center(8), center(5), 'foot')).toBeNull(); // …which foot planning still avoids
  });

  it('plans THROUGH a closed door (DoorSystem opens it on arrival) that collision still blocks', () => {
    const g = grass(10, 10);
    wallColumn(g, 5, 0, 4);
    wallColumn(g, 5, 5, 10);
    placeStructure(new World(), g.structures, 'structure.door', 5, 4); // the only way east: a shut door
    const pf = new Pathfinder(g);
    const path = pf.findPath(center(2), center(4), center(8), center(4), 'foot');
    expect(path).not.toBeNull(); // routable — the door counts as passable for PLANNING
    expect(path!.some((p) => Math.floor(p.x / TILE) === 5 && Math.floor(p.y / TILE) === 4)).toBe(true); // …via the doorway
  });

  it('returns null when the goal is unreachable', () => {
    const g = grass(5, 5);
    wallColumn(g, 2, 0, 5); // full divider, no gap
    const pf = new Pathfinder(g);
    expect(pf.findPath(center(0), center(0), center(4), center(0), 'foot')).toBeNull();
  });
});
