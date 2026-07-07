import { describe, expect, it } from 'vitest';
import { TILE } from '../src/config/constants';
import { TERRAIN } from '../src/defs/terrains';
import { Pathfinder } from '../src/world/Pathfinder';
import { TileGrid } from '../src/world/TileGrid';

const center = (t: number) => t * TILE + TILE / 2;

function grass(w: number, h: number): TileGrid {
  const g = new TileGrid(w, h);
  g.tiles = Array.from({ length: h }, () => Array.from({ length: w }, () => TERRAIN.grass));
  return g;
}

describe('Pathfinder', () => {
  it('routes around a wall (down to the gap) instead of through it', () => {
    const g = grass(10, 10);
    for (let y = 0; y < 8; y++) g.tiles[y][5] = TERRAIN.wall; // vertical wall, gap at y=8,9
    const pf = new Pathfinder(g);
    const path = pf.findPath(center(2), center(2), center(8), center(2), 'foot');
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(0);
    // must detour down toward the gap (some waypoint at tile-row >= 8)
    expect(path!.some((p) => Math.floor(p.y / TILE) >= 8)).toBe(true);
    // never steps onto the wall column
    expect(path!.every((p) => Math.floor(p.x / TILE) !== 5 || Math.floor(p.y / TILE) >= 8)).toBe(true);
  });

  it('line-of-sight is blocked through a wall, clear otherwise', () => {
    const g = grass(10, 10);
    for (let y = 0; y < 8; y++) g.tiles[y][5] = TERRAIN.wall;
    const pf = new Pathfinder(g);
    expect(pf.lineOfSight(center(2), center(2), center(8), center(2), 'foot')).toBe(false); // crosses x=5
    expect(pf.lineOfSight(center(2), center(2), center(2), center(7), 'foot')).toBe(true); // clear column
  });

  it('returns null when the goal is unreachable', () => {
    const g = grass(5, 5);
    for (let y = 0; y < 5; y++) g.tiles[y][2] = TERRAIN.wall; // full divider, no gap
    const pf = new Pathfinder(g);
    expect(pf.findPath(center(0), center(0), center(4), center(0), 'foot')).toBeNull();
  });
});
