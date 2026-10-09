import { describe, expect, it } from 'vitest';
import { ARENA } from '../src/config/constants';
import { Rng } from '../src/core/Rng';
import { TERRAIN } from '../src/defs/terrains';
import { generateLevel } from '../src/world/WorldGen';

describe('the desert arena — a SQUARE walled sand isle far south, one gap, a dock', () => {
  it('a square isle (sand to the corners), a square ring, grass to the ring\'s inner corners, exactly one opening (north)', () => {
    const level = generateLevel(new Rng(0));
    const g = level.grid;
    const cheb = (tx: number, ty: number): number => Math.max(Math.abs(tx - ARENA.cx), Math.abs(ty - ARENA.cy));
    expect(g.tiles[ARENA.cy][ARENA.cx]).toBe(TERRAIN.grass); // the arena FLOOR is grass (sand would slow the fight)
    expect(g.tiles[ARENA.cy + 4][ARENA.cx + 4]).toBe(TERRAIN.grass); // the floor's CORNER: a round ring would have walled it (hypot 5.7 > 4.8)
    expect(g.tiles[ARENA.cy][ARENA.cx + 8]).toBe(TERRAIN.sand); // the desert outside the wall band stays sand
    expect(g.tiles[ARENA.cy + 8][ARENA.cx + 8]).toBe(TERRAIN.sand); // the isle's CORNER is land: a round isle would be sea here (hypot 11.3 > 9)
    expect(g.tiles[ARENA.cy + 12][ARENA.cx + 12]).toBe(TERRAIN.water); // and the box ends
    const ring = level.structures.filter((s) => s.def === 'structure.stoneWall' && cheb(s.tx, s.ty) < ARENA.r);
    expect(ring.length).toBeGreaterThan(30);
    for (const s of ring) expect(cheb(s.tx, s.ty)).toBe(6); // ONE tile of wall: every stone sits on the square's single loop…
    expect(g.tiles[ARENA.cy + 5][ARENA.cx + 5]).toBe(TERRAIN.grass); // the floor runs to ±5 (11×11), right up to the wall
    expect(ring.some((s) => s.tx === ARENA.cx + 6 && s.ty === ARENA.cy + 6)).toBe(true); // …including the ring's corner (a round ring has none)
    expect(ring.some((s) => s.ty < ARENA.cy - 4 && Math.abs(s.tx - ARENA.cx) <= 1)).toBe(false); // the north cell line is open (the gap)
    expect(ring.some((s) => s.ty > ARENA.cy + 4 && Math.abs(s.tx - ARENA.cx) <= 1)).toBe(true); // the south is walled
    expect(g.tiles[ARENA.cy - ARENA.r - 3][ARENA.cx]).toBe(TERRAIN.dock); // the north dock reaches the sea
  });
});
