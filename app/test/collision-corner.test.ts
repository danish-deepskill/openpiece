import { describe, expect, it } from 'vitest';
import { Tile } from '../src/config/constants';
import { Collision } from '../src/world/Collision';
import { TileGrid } from '../src/world/TileGrid';

/**
 * canOccupy is EXACT circle-vs-AABB (not point sampling): the closest point on each blocking tile's box to the
 * circle center must be ≥ r away. So a wall touching the circle at ANY angle — including a diagonal CORNER —
 * blocks it, with no sample-point gaps (the "half my body clips the wall corner" bug). These tests prove it holds
 * across many offsets/radii, not just the one angle an 8-point sampler happened to catch.
 */

const T = 32; // TILE
/** A grid that's all Grass except a single Wall tile at (wallTx, wallTy). */
function wallAt(wallTx: number, wallTy: number): TileGrid {
  const g = new TileGrid(20, 20);
  g.tiles = Array.from({ length: 20 }, (_, ty) => Array.from({ length: 20 }, (_, tx) => (tx === wallTx && ty === wallTy ? Tile.Wall : Tile.Grass)));
  return g;
}

describe('collision samples corners (no diagonal wall clip)', () => {
  it('a body cannot occupy a spot where its DIAGONAL edge overlaps a wall tile', () => {
    const col = new Collision(wallAt(10, 10)); // wall spans x,y ∈ [320,352]
    const r = 12;
    // place the body just SW of the wall's SW corner, so its NE diagonal edge pokes INTO the wall tile but no
    // cardinal edge does. Center at (320-d+1, 320-d+1) with d≈8.5 → NE diagonal point ≈ (320+1, 320+1) = inside.
    const d = r * 0.7071;
    const cx = 320 - d + 2;
    const cy = 320 - d + 2;
    expect(col.canOccupy(cx, cy, r, 'foot')).toBe(false); // the diagonal (NE) edge is in the wall → blocked
  });

  it('a body clear of the wall on all 8 points CAN occupy', () => {
    const col = new Collision(wallAt(10, 10));
    const r = 12;
    // well SW of the wall — no edge reaches it
    expect(col.canOccupy(320 - r - 8, 320 - r - 8, r, 'foot')).toBe(true);
  });

  it('tryMove does not let the body slide its corner INTO the wall', () => {
    const col = new Collision(wallAt(10, 10));
    const r = 12;
    const p = { x: 320 - r - 4, y: 320 - r - 4 }; // just SW, clear
    for (let i = 0; i < 20; i++) col.tryMove(p, 6, 6, r, 'foot'); // keep pushing toward the wall's NE corner
    // EXACT: the circle center must stay ≥ r from the wall tile's nearest (SW) corner — never overlapping it
    const nx = Math.max(320, Math.min(p.x, 352));
    const ny = Math.max(320, Math.min(p.y, 352));
    expect(Math.hypot(p.x - nx, p.y - ny)).toBeGreaterThanOrEqual(r - 0.01); // no overlap, at any push
  });

  it('EXACT: no clip at ANY diagonal offset (the whole point of circle-vs-AABB over sampling)', () => {
    const col = new Collision(wallAt(10, 10)); // wall box [320,352]
    const r = 12;
    // sweep the center along the SW diagonal approaching the wall's SW corner (320,320). For every offset, the
    // occupancy verdict must EXACTLY match the true geometry (center-to-corner distance ≥ r), with no gaps.
    for (let off = 2; off <= 30; off += 1) {
      const cx = 320 - off * 0.7071;
      const cy = 320 - off * 0.7071;
      const trueClear = Math.hypot(cx - 320, cy - 320) >= r; // exact distance to the corner
      expect(col.canOccupy(cx, cy, r, 'foot')).toBe(trueClear);
    }
  });
});

describe('depenetration (unstick a body stuck in solid)', () => {
  it('a body inside a wall SNAPS to the nearest clear spot', () => {
    const col = new Collision(wallAt(10, 10)); // wall box [320,352]
    const r = 12;
    const p = { x: 336, y: 336 }; // dead-center INSIDE the wall tile
    expect(col.canOccupy(p.x, p.y, r, 'foot')).toBe(false); // confirmed stuck
    col.unstick(p, r, 'foot');
    expect(col.canOccupy(p.x, p.y, r, 'foot')).toBe(true); // …now sitting somewhere clear
  });

  it('a body already clear is left exactly where it is (no-op)', () => {
    const col = new Collision(wallAt(10, 10));
    const r = 12;
    const p = { x: 100, y: 100 }; // open grass, nowhere near the wall
    col.unstick(p, r, 'foot');
    expect(p).toEqual({ x: 100, y: 100 }); // untouched
  });
});
