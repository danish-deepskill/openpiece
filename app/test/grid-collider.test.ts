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

  it('CORNER ASSIST: a pure south push clipping a wall corner ROLLS AROUND it (no manual sidestep)', () => {
    // the report: standing just east of a wall corner, pushing straight south pinned the body on the corner —
    // the circle clipped the solid by a few px and the whole step was rejected, every tick, forever.
    const c = oneCellCollider(Q_SOLID); // solid box [20,30]×[20,30]
    const pos = { x: 32, y: 14 }; // body r=3 → x-span [29,35] clips the box's east edge by 1px on the way south
    for (let i = 0; i < 40; i++) c.tryMove(pos, 0, 1.5, 3, CTX); // hold SOUTH only
    expect(pos.y).toBeGreaterThan(33); // passed the corner — assist shifted him east and south resumed
    expect(pos.x).toBeGreaterThan(32.9); // …by nudging PAST the box's edge (30 + r), not through it
  });

  it('CORNER ASSIST helps the mirrored side too, and picks the side that is actually open', () => {
    const c = oneCellCollider(Q_SOLID);
    const pos = { x: 18, y: 14 }; // clipping the WEST edge on the way south → must nudge WEST (negative side)
    for (let i = 0; i < 40; i++) c.tryMove(pos, 0, 1.5, 3, CTX);
    expect(pos.y).toBeGreaterThan(33);
    expect(pos.x).toBeLessThan(17.1);
  });

  it('a real wall FACE gets NO assist — head-on into the middle of the box still stops dead', () => {
    const c = oneCellCollider(Q_SOLID);
    const pos = { x: 25, y: 14 }; // dead-center on the box's north face; ±r probes are still blocked
    for (let i = 0; i < 40; i++) c.tryMove(pos, 0, 1.5, 3, CTX);
    expect(pos.y).toBeLessThan(18); // walled (never entered the box), no sideways drift
    expect(pos.x).toBe(25);
  });

  it('CORNER ASSIST on a DIAGONAL push pinned on a convex corner tip — curls the way you are pressing', () => {
    // the residual stick: holding S+E straight into a corner point rejects BOTH axis steps (each clips the
    // same corner), so the axis-split slide never engages and the old assist (pure-axis only) never fired.
    const c = oneCellCollider(Q_SOLID); // solid box [20,30]×[20,30]
    const pos = { x: 17.5, y: 17.5 }; // body r=3 kissing the box's NW corner tip (dist √12.5 ≈ 3.54)
    for (let i = 0; i < 60; i++) c.tryMove(pos, 1.2, 1.2, 3, CTX); // hold SE, straight into the tip
    // it curled around one face (either is legal) instead of freezing on the tip forever
    expect(Math.hypot(pos.x - 17.5, pos.y - 17.5)).toBeGreaterThan(10);
  });

  it('a 45° push THREADS a near-body-width gap (the doorway stick): the probe ladder finds the sweet spot', () => {
    // gap between two boxes: x∈[30,36] open (6px), body r=2.5 (5px wide) → the thread window is ±0.5px.
    // A single ±r probe overshoots onto the far jamb; the ladder's near rung finds the line through.
    const c = new GridCollider({ cellPx: 10, originX: 0, originY: 0 }, (cx, cy) => (cy === 3 && cx !== 3 ? Q_SOLID : Q_CLEAR));
    // wall row y∈[30,40] with the open cell x∈[30,40]; approach ABOVE it, slightly off the gap line, pushing SE
    const pos = { x: 33, y: 26 };
    for (let i = 0; i < 120; i++) c.tryMove(pos, 1.0, 1.0, 2.5, CTX); // hold SE into the gap mouth
    expect(pos.y).toBeGreaterThan(42); // threaded the doorway instead of freezing at its mouth
  });

  it('a CONCAVE (inside) corner still stops a diagonal dead — assist never digs into pockets', () => {
    // walls east AND south of the body (an L-pocket): pushing SE has no way around — both probes stay blocked
    const c = new GridCollider({ cellPx: 10, originX: 0, originY: 0 }, (cx, cy) => ((cx === 3 && cy <= 3) || (cy === 3 && cx <= 3) ? Q_SOLID : Q_CLEAR));
    const pos = { x: 25, y: 25 }; // inside the pocket, walls at x∈[30,40] and y∈[30,40]
    for (let i = 0; i < 40; i++) c.tryMove(pos, 1.2, 1.2, 3, CTX);
    expect(pos.x).toBeLessThan(27.1); // walled at the pocket faces, no digging, no drift
    expect(pos.y).toBeLessThan(27.1);
  });

  it('CORNER ASSIST respects the moving-obstacle veto (a hull corner assists only where the hull allows)', () => {
    const c = oneCellCollider(Q_SOLID);
    const wallEast = (x: number): boolean => x > 30; // a "hull" occupying everything east of the box
    const pos = { x: 32, y: 14 }; // the east-side assist would clear the grid — but the hull vetoes it
    for (let i = 0; i < 20; i++) c.tryMove(pos, 0, 1.5, 3, CTX, (x) => wallEast(x));
    expect(pos.y).toBeLessThan(18); // no way around: grid blocks ahead + west, hull vetoes east → walled
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
