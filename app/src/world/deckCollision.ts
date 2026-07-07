import { deckWalkable, tileAt, worldToDeck, type DeckCell, type DeckGrid, type ShipPose } from '../defs/decks';
import { GridCollider, Q_CLEAR, Q_E, Q_N, Q_S, Q_SOLID, Q_W, type MoveCtx, type QuarterMask } from './GridCollider';

/**
 * DECK-FRAME collision — the ship's deck grid plugged into the ONE GridCollider engine (which replaced this
 * module's ancestors: the hand-copied deck sweep that used to live in defs/decks.ts). A hull gets TWO colliders
 * over the same grid, because a ship has two collision truths depending on which SIDE of the rail you're on:
 *
 *  - WALK (on deck): walkable cells are floor; a rail cell blocks a grounded walker FULL-cell (its inner half is
 *    the drawn gunwale wood, its outer half is open water — neither is standable), but clears entirely when
 *    AIRBORNE or PERCHED (the rail is the deck's LOW WALL — jump over it, or balance along it on a ledge). A
 *    'hole' and anything past the hull block even airborne (no floor to land on — you can't hover onto open sea).
 *
 *  - HULL (from outside): the solid boat a world walker/swimmer bumps into. Solid EXACTLY as drawn (shipDraws):
 *    interior cells block full; a RAIL blocks only its WOOD — the cell minus its sea-facing halves, so a straight
 *    edge is a half slab and a beveled corner is one quarter (quantized-quarters decision) — and the GANGPLANK is
 *    the open door. So a swimmer floats right up to the drawn gunwale instead of an invisible full-tile box.
 *
 * Colliders are derived ONCE per parsed grid (defs are immutable; deckOf caches one grid per hull) and cached by
 * grid identity — masks are precomputed dense arrays, so the hot-path oracle is an index, not a cell search.
 */

interface DeckColliders {
  walk: GridCollider;
  hull: GridCollider;
}

/** ONE scratch ctx reused across queries (hot loop — no per-call allocation; single-threaded sim, never retained).
 *  `mode` is fixed 'foot': only foot actors walk decks (a boat can't board a boat), and no deck rule reads it. */
const CTX: MoveCtx = { mode: 'foot', airborne: false, onLedge: false };
/** The hull-from-outside oracle reads NO ctx today — but it gets its OWN never-mutated ctx (not the walk scratch,
 *  which holds the LAST walker's flags) so a future ctx-reading hull rule can't silently inherit stale state. */
const HULL_CTX: MoveCtx = { mode: 'foot', airborne: false, onLedge: false };
/** Scratch point adapting deck-local {lx,ly} storage to the collider's {x,y} — same reuse rule as CTX. */
const P = { x: 0, y: 0 };

const cache = new WeakMap<DeckGrid, DeckColliders>();

function collidersOf(grid: DeckGrid): DeckColliders {
  let c = cache.get(grid);
  if (!c) {
    c = buildColliders(grid);
    cache.set(grid, c);
  }
  return c;
}

/** A rail's SOLID shape = the WOOD the renderer draws (shipDraws pass 2): the cell MINUS its sea-facing halves.
 *  Straight edge → the deck-facing half slab; an outer corner (two adjacent sea sides) → the deck-facing quarter
 *  (the drawn bevel triangle, quantized to its quarter box). Same neighbor rule as the visuals, so collision
 *  follows any authored hull shape. A rail with sea on OPPOSITE sides draws no wood at all → mask 0, and collision
 *  stays truthful to the picture (nothing there to bump). */
function railWoodMask(grid: DeckGrid, c: DeckCell): QuarterMask {
  let m = Q_SOLID;
  if (tileAt(grid, c.cx, c.cy - 1) === undefined) m &= ~Q_N;
  if (tileAt(grid, c.cx, c.cy + 1) === undefined) m &= ~Q_S;
  if (tileAt(grid, c.cx - 1, c.cy) === undefined) m &= ~Q_W;
  if (tileAt(grid, c.cx + 1, c.cy) === undefined) m &= ~Q_E;
  return m;
}

function buildColliders(grid: DeckGrid): DeckColliders {
  const { cols, rows, tilePx } = grid;
  // dense mask tables, indexed cy·cols+cx. Cells that don't exist (off-hull ' ') keep the fill value.
  const grounded = new Uint8Array(cols * rows).fill(Q_SOLID); // walk, on the ground: rail/hole/off-hull all block
  const cleared = new Uint8Array(cols * rows).fill(Q_SOLID); // walk, airborne OR perched: only the rail opens up
  const wood = new Uint8Array(cols * rows); // hull-from-outside: solid boat as drawn; off-hull = open water (0)
  for (const c of grid.cells) {
    const i = c.cy * cols + c.cx;
    if (deckWalkable(c.tile)) {
      grounded[i] = Q_CLEAR;
      cleared[i] = Q_CLEAR;
    } else if (c.tile === 'rail') {
      cleared[i] = Q_CLEAR; // the LOW WALL: airborne hops it, a perched walker balances along it
    }
    if (c.tile === 'rail') wood[i] = railWoodMask(grid, c);
    else if (c.tile !== 'gangplank') wood[i] = Q_SOLID; // interior (deck/helm/cannon/hole) is solid boat; the gangplank is the door
  }
  const spec = { cellPx: tilePx, originX: -(cols * tilePx) / 2, originY: -(rows * tilePx) / 2 }; // ship-centered grid
  const inGrid = (cx: number, cy: number): boolean => cx >= 0 && cy >= 0 && cx < cols && cy < rows;
  return {
    // past the hull = open sea: blocks even AIRBORNE (no floor — leaving by air is a frame TRANSITION, not a step;
    // MovementSystem's airborne-leave handles it), so `bounds` is unnecessary — the oracle already seals the edge.
    walk: new GridCollider(spec, (cx, cy, ctx) => {
      if (!inGrid(cx, cy)) return Q_SOLID;
      return ctx.airborne || ctx.onLedge ? cleared[cy * cols + cx] : grounded[cy * cols + cx];
    }),
    hull: new GridCollider(spec, (cx, cy) => (inGrid(cx, cy) ? wood[cy * cols + cx] : Q_CLEAR)), // past the hull = open water, free
  };
}

/** Can a circle of radius r sit at deck-LOCAL (lx,ly)? The on-deck walk rule (see the WALK collider above). */
export function deckCanOccupy(grid: DeckGrid, lx: number, ly: number, r: number, airborne = false, onLedge = false): boolean {
  CTX.airborne = airborne;
  CTX.onLedge = onLedge;
  return collidersOf(grid).walk.canOccupy(lx, ly, r, CTX);
}

/** Axis-separated deck move (slide along the rail feels right), mutating an {lx,ly} local position. */
export function deckTryMove(pos: { lx: number; ly: number }, dlx: number, dly: number, grid: DeckGrid, r: number, airborne = false, onLedge = false): void {
  CTX.airborne = airborne;
  CTX.onLedge = onLedge;
  P.x = pos.lx;
  P.y = pos.ly;
  collidersOf(grid).walk.tryMove(P, dlx, dly, r, CTX);
  pos.lx = P.x;
  pos.ly = P.y;
}

/** From OUTSIDE the ship, does a world-space circle at deck-LOCAL (lx,ly) overlap the SOLID hull-as-drawn?
 *  (Rail = its wood only; gangplank = open door.) HullCollisionSystem uses it to keep world walkers out. */
export function hullBlocksOutside(grid: DeckGrid, lx: number, ly: number, r: number): boolean {
  return !collidersOf(grid).hull.canOccupy(lx, ly, r, HULL_CTX);
}

/** Does a ship (at world `pose`, hull `grid`) BLOCK a world-space circle at (wx,wy)? The hull is a MOVING wall to
 *  off-ship walkers: transform the point into the deck frame and test the solid footprint. MovementSystem uses it
 *  to REJECT a step into a hull (a true wall-stop — you bump the gunwale and slide, no teleport). */
export function hullBlocksWorldPoint(pose: ShipPose, grid: DeckGrid, wx: number, wy: number, r: number): boolean {
  const local = worldToDeck(pose, wx, wy);
  return hullBlocksOutside(grid, local.lx, local.ly, r);
}
