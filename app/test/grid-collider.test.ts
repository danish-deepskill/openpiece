import { describe, expect, it } from 'vitest';
import { parseDeck } from '../src/defs/decks';
import { deckCanOccupy, hullBlocksOutside } from '../src/world/deckCollision';
import { GridCollider, Q_CLEAR, Q_N, Q_NW, Q_SOLID, type MoveCtx, type QuarterMask } from '../src/world/GridCollider';

/**
 * THE ONE COLLISION ENGINE (world/GridCollider.ts) — every frame (world terrain, ship decks, future interiors)
 * resolves circles against its grid through this engine + a passability ORACLE returning QUARTER MASKS. This file
 * pins the engine's geometry (exact circle-vs-quarter, slide, bounds, moving-obstacle veto, unstick) with a toy
 * oracle, then the DECK mask derivation (world/deckCollision.ts): the hull-from-outside collides AS DRAWN — a
 * straight rail is its half-slab of wood, a beveled corner its quarter — not the old invisible full-tile box.
 * World-terrain behavior parity is pinned by the existing movement suites (swim/ledge/jump/collision).
 */

const CTX: MoveCtx = { mode: 'foot', airborne: false, onLedge: false };
/** 10px cells at origin 0,0; solid only at cell (2,2) (the box [20,30]×[20,30]) with a per-test mask. */
function oneCellCollider(mask: QuarterMask, bounds?: { w: number; h: number }): GridCollider {
  return new GridCollider({ cellPx: 10, originX: 0, originY: 0, bounds }, (cx, cy) => (cx === 2 && cy === 2 ? mask : Q_CLEAR));
}

describe('GridCollider geometry (toy oracle)', () => {
  it('a FULL cell blocks exactly (closest-point, no sampling gaps): faces, and the DIAGONAL corner', () => {
    const c = oneCellCollider(Q_SOLID);
    expect(c.canOccupy(5, 5, 3, CTX)).toBe(true); // far away — clear
    expect(c.canOccupy(25, 25, 3, CTX)).toBe(false); // centered inside the box
    expect(c.canOccupy(25, 32, 3, CTX)).toBe(false); // 2px below the face → overlaps
    expect(c.canOccupy(25, 33.5, 3, CTX)).toBe(true); // 3.5px below the face → clear (exact, not tuned)
    expect(c.canOccupy(32, 32, 3, CTX)).toBe(false); // diagonal corner: dist √8≈2.83 < 3 → blocks
    expect(c.canOccupy(34, 34, 3, CTX)).toBe(true); // diagonal corner: dist √32≈5.66 > 3 → clear
  });

  it('a HALF mask (Q_N) blocks only its half — the other half is walkable space', () => {
    const c = oneCellCollider(Q_N); // top half solid: [20,30]×[20,25]
    expect(c.canOccupy(25, 22, 2, CTX)).toBe(false); // inside the solid top half
    expect(c.canOccupy(25, 28, 2, CTX)).toBe(true); // bottom half of the SAME cell — open (dist 3 > 2)
    expect(c.canOccupy(25, 26, 2, CTX)).toBe(false); // 1px below the wood line → overlaps
  });

  it('a QUARTER mask (Q_NW) blocks only its quarter — a body slips past on the open diagonal', () => {
    const c = oneCellCollider(Q_NW); // NW quarter solid: [20,25]×[20,25]
    expect(c.canOccupy(22, 22, 2, CTX)).toBe(false); // inside the quarter
    expect(c.canOccupy(28, 28, 3, CTX)).toBe(true); // in-cell but past the quarter (dist √18≈4.24 > 3)
    expect(c.canOccupy(26, 26, 3, CTX)).toBe(false); // hugging the quarter's corner (dist √2≈1.41 < 3)
  });

  it('the oracle reads MoveCtx — an airborne-clearing cell blocks grounded, opens mid-jump', () => {
    const c = new GridCollider({ cellPx: 10, originX: 0, originY: 0 }, (cx, cy, ctx) => (cx === 2 && cy === 2 && !ctx.airborne ? Q_SOLID : Q_CLEAR));
    CTX.airborne = false;
    expect(c.canOccupy(25, 25, 3, CTX)).toBe(false);
    CTX.airborne = true;
    expect(c.canOccupy(25, 25, 3, CTX)).toBe(true);
    CTX.airborne = false;
  });

  it('hard bounds keep the CENTER r inside the rect — even where the oracle is clear', () => {
    const c = new GridCollider({ cellPx: 10, originX: 0, originY: 0, bounds: { w: 100, h: 100 } }, () => Q_CLEAR);
    expect(c.canOccupy(50, 50, 5, CTX)).toBe(true);
    expect(c.canOccupy(3, 50, 5, CTX)).toBe(false); // center closer than r to the x=0 edge
    expect(c.canOccupy(50, 98, 5, CTX)).toBe(false); // …or to the far edge
  });

  it('tryMove is axis-separated: a wall in x still lets the y component through (the slide)', () => {
    // a solid wall COLUMN at cx=3 ([30,40] in x, all y)
    const c = new GridCollider({ cellPx: 10, originX: 0, originY: 0 }, (cx) => (cx === 3 ? Q_SOLID : Q_CLEAR));
    const pos = { x: 24, y: 25 };
    c.tryMove(pos, 10, 5, 2, CTX); // push into the wall diagonally
    expect(pos.x).toBe(24); // x-step rejected (would overlap the wall)
    expect(pos.y).toBe(30); // y-step taken → slides along the wall
  });

  it('the moving-obstacle `blocked` predicate vetoes a step the grid would allow', () => {
    const c = new GridCollider({ cellPx: 10, originX: 0, originY: 0 }, () => Q_CLEAR);
    const pos = { x: 25, y: 25 };
    c.tryMove(pos, 10, 10, 2, CTX, (x) => x > 30); // a "ship" occupying x>30
    expect(pos.x).toBe(25); // x-step vetoed by the obstacle
    expect(pos.y).toBe(35); // y-step clear (the veto is per-target-point, not per-move)
  });

  it('unstick snaps a stuck body to a nearby clear spot (and no-ops when already clear)', () => {
    const c = oneCellCollider(Q_SOLID);
    const stuck = { x: 25, y: 25 }; // inside the solid cell
    c.unstick(stuck, 3, CTX);
    expect(c.canOccupy(stuck.x, stuck.y, 3, CTX)).toBe(true); // ejected to a valid spot
    expect(Math.hypot(stuck.x - 25, stuck.y - 25)).toBeGreaterThan(0); // actually moved
    const clear = { x: 5, y: 5 };
    c.unstick(clear, 3, CTX);
    expect(clear).toEqual({ x: 5, y: 5 }); // already clear → untouched
  });
});

describe('deck masks: the hull collides AS DRAWN (world/deckCollision.ts)', () => {
  // 4×3 ring @ 32px, ship-centered → grid spans x [−64,64], y [−48,48]. Row 0's straight rail wood is its
  // deck-facing HALF (y [−32,−16]); the NW corner's wood is its deck-facing QUARTER (x [−48,−32] × y [−32,−16]).
  const grid = parseDeck(['####', '#..#', '####']);

  it('a straight rail blocks from outside ONLY as its half-slab of wood — the drawn-sea half is open water', () => {
    expect(hullBlocksOutside(grid, -16, -40, 2)).toBe(false); // the rail cell's OUTER half — sea, swimmable now
    expect(hullBlocksOutside(grid, -16, -24, 2)).toBe(true); // the INNER half — the gunwale wood
  });

  it('a beveled corner blocks as its quarter — a swimmer rounds the drawn bevel, not a full-tile box', () => {
    expect(hullBlocksOutside(grid, -56, -40, 2)).toBe(false); // the corner cell's outer quarter — open sea
    expect(hullBlocksOutside(grid, -40, -24, 2)).toBe(true); // the deck-facing quarter — the drawn wood
  });

  it('interior deck cells are SOLID boat from outside (no standing on deck without boarding)', () => {
    expect(hullBlocksOutside(grid, -16, 0, 2)).toBe(true); // cell (1,1), a '.' interior
  });

  it('the gangplank is the open DOOR through the hull', () => {
    const g = parseDeck(['####', 'G..#', '####']);
    expect(hullBlocksOutside(g, -48, 0, 2)).toBe(false); // standing in the doorway — not pushed
  });

  it('a rail with sea on OPPOSITE sides draws no wood → collides as nothing (truthful to the picture)', () => {
    const strip = parseDeck(['#']); // a lone rail cell: sea on all four sides
    expect(hullBlocksOutside(strip, 0, 0, 2)).toBe(false);
  });

  it('ON DECK the rail cell blocks a grounded walker FULL-cell (wood + the water gap both unstandable)', () => {
    expect(deckCanOccupy(grid, -16, -40, 2, false)).toBe(false); // even the outer (water) half — no standing there
    expect(deckCanOccupy(grid, -16, -40, 2, true)).toBe(true); // airborne clears the low wall entirely
    expect(deckCanOccupy(grid, -16, 0, 6, false)).toBe(true); // the interior is floor
  });
});
