import { deckWalkable, worldToDeck, type DeckGrid, type ShipPose } from '../defs/decks';
import { GridCollider, Q_CLEAR, Q_NE, Q_NW, Q_SE, Q_SOLID, Q_SW, type MoveCtx } from './GridCollider';

/**
 * DECK-FRAME collision — the ship's deck grid plugged into the ONE GridCollider engine (which replaced this
 * module's ancestors: the hand-copied deck sweep that used to live in defs/decks.ts). A hull gets TWO colliders
 * over the same grid, because a ship has two collision truths depending on which SIDE of the rail you're on:
 *
 *  - WALK (on deck): walkable cells are floor; a rail cell blocks a grounded walker FULL-cell, but clears
 *    entirely when AIRBORNE or PERCHED (the rail is the deck's LOW WALL — jump over it, or balance along it on
 *    a ledge). A 'hole' and anything past the hull block even airborne (no floor to land on).
 *
 *  - HULL (from outside): the solid boat a world walker/swimmer bumps into. FULL-TILE simple (the developer's
 *    overhaul call, ending the half/quarter-wood era and its whole rule stack): every on-hull cell is a solid
 *    block, the GANGPLANK is the one open door, and shipDraws paints rails full-cell to match — solid exactly
 *    as drawn, no sub-tile seams for bodies to slip into.
 *
 * Colliders are derived ONCE per parsed grid (defs are immutable; deckOf caches one grid per hull) and cached by
 * grid identity — masks are precomputed dense arrays, so the hot-path oracle is an index, not a cell search.
 */

interface DeckColliders {
  walk: GridCollider;
  hull: GridCollider;
  /** The as-drawn wood mask table (cy·cols+cx) — kept for hullWoodClearance (the blocked-body escape rule). */
  wood: Uint8Array;
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

function buildColliders(grid: DeckGrid): DeckColliders {
  const { cols, rows, tilePx } = grid;
  // dense mask tables, indexed cy·cols+cx. Cells that don't exist (off-hull ' ') keep the fill value.
  const grounded = new Uint8Array(cols * rows).fill(Q_SOLID); // walk, on the ground: rail/hole/off-hull all block
  const cleared = new Uint8Array(cols * rows).fill(Q_SOLID); // walk, AIRBORNE: only the rail opens up (no floor past the hull)
  // walk, PERCHED: like cleared, but OFF-HULL is open too — a body balancing on the full-tile rail block may
  // OVERHANG the sea (landing half-over the gunwale must perch, not bounce: the old fit veto left it a world
  // body inside the solid block, and pushOut teleported it to the nearest sea). Leaving seaward is owned by
  // the deliberate step-down drop-off, so the open off-hull is never walked onto — only overhung.
  const perched = new Uint8Array(cols * rows).fill(Q_CLEAR);
  const wood = new Uint8Array(cols * rows); // hull-from-outside: FULL solid blocks; off-hull = open water (0)
  for (const c of grid.cells) {
    const i = c.cy * cols + c.cx;
    if (deckWalkable(c.tile)) {
      grounded[i] = Q_CLEAR;
      cleared[i] = Q_CLEAR;
    } else if (c.tile === 'rail') {
      cleared[i] = Q_CLEAR; // the LOW WALL: airborne hops it, a perched walker balances along it
    } else {
      perched[i] = Q_SOLID; // a HOLE is a pit even to a percher (off-hull stays clear via the fill)
    }
    // ONE simple hull truth (the developer's overhaul call, replacing the half/quarter-wood era and its whole
    // rule stack — walker walls, center rules, penetration budgets): EVERY on-hull cell is a FULL solid block
    // to any outside body, and the gangplank is the one open door. The renderer draws rails full-cell to
    // match — solid exactly as drawn, no sub-tile seams for bodies to slip into.
    if (c.tile !== 'gangplank') wood[i] = Q_SOLID;
  }
  const spec = { cellPx: tilePx, originX: -(cols * tilePx) / 2, originY: -(rows * tilePx) / 2 }; // ship-centered grid
  const inGrid = (cx: number, cy: number): boolean => cx >= 0 && cy >= 0 && cx < cols && cy < rows;
  return {
    // past the hull = open sea: blocks even AIRBORNE (no floor — leaving by air is a frame TRANSITION, not a step;
    // MovementSystem's airborne-leave handles it), so `bounds` is unnecessary — the oracle already seals the edge.
    walk: new GridCollider(spec, (cx, cy, ctx) => {
      if (!inGrid(cx, cy)) return ctx.onLedge && !ctx.airborne ? Q_CLEAR : Q_SOLID; // a percher may overhang the sea
      const i = cy * cols + cx;
      if (ctx.onLedge && !ctx.airborne) return perched[i];
      return ctx.airborne ? cleared[i] : grounded[i];
    }),
    hull: new GridCollider(spec, (cx, cy) => (inGrid(cx, cy) ? wood[cy * cols + cx] : Q_CLEAR)), // past the hull = open water, free
    wood,
  };
}

/** Total circle penetration (px, summed) into RAIL cells specifically. The ONE rail-special rule that
 *  survived the full-tile overhaul: the escape rule's sum measure is blind to WHICH box holds the depth, so
 *  a body legally overlapping the INTERIOR (a walk-off exits you 60/40 across the plank edge) could TRADE
 *  that invisible overlap for GUNWALE overlap one-for-one ("parallel" by the sum) and push a third of itself
 *  into the rail. The visible rail line is a hard budget that never grows (MovementSystem's escape rule). */
export function hullRailPen(grid: DeckGrid, lx: number, ly: number, r: number): number {
  const h = grid.tilePx / 2;
  let pen = 0;
  for (const c of grid.cells) {
    if (c.tile !== 'rail') continue;
    const d = distToBox(lx, ly, c.lx - h, c.ly - h, h * 2); // the full rail cell
    if (d < r) pen += r - d;
  }
  return pen;
}

/** DEBUG read-only view of a hull's as-drawn wood mask table (cy·cols+cx) — the ground truth the collision
 *  overlay draws, so the debug can never drift from what actually blocks. Never mutate. */
export function hullDebugMasks(grid: DeckGrid): { wood: Uint8Array } {
  return { wood: collidersOf(grid).wood };
}

/** Distance (px) from a deck-LOCAL point to the NEAREST drawn hull wood — the CLEARANCE a blocked body has.
 *  Powers the escape rule: a wood-blocked body may only take steps that strictly INCREASE this — it always
 *  walks itself out (any escape direction gains clearance) but can never creep ALONG the hull at constant
 *  depth (the gunwale-traversal glitch) nor freeze (the post-drop-off dockside pin: blocking every step
 *  trapped a body already overlapping the wood). Cold path (blocked bodies only) — a full cell scan is fine. */
export function hullWoodClearance(grid: DeckGrid, lx: number, ly: number, r = 0): number {
  const c0 = collidersOf(grid);
  const table = c0.wood;
  const h = grid.tilePx / 2;
  let best = Infinity; // nearest-solid distance (the no-overlap case)
  let pen = 0; // TOTAL circle penetration, SUMMED over boxes — a min-distance measure was blind to picking up
  //              a SECOND overlap (riding one box's edge at distance 0 masked sinking into the next row: the
  //              "slid along the cell seam straight through the hull" bug), so depth must accumulate.
  const tally = (bx: number, by: number): void => {
    const d = distToBox(lx, ly, bx, by, h);
    if (d < best) best = d;
    if (d < r) pen += r - d;
  };
  for (const c of grid.cells) {
    const m = table[c.cy * grid.cols + c.cx];
    if (m === Q_CLEAR) continue;
    if (m & Q_NW) tally(c.lx - h, c.ly - h);
    if (m & Q_NE) tally(c.lx, c.ly - h);
    if (m & Q_SW) tally(c.lx - h, c.ly);
    if (m & Q_SE) tally(c.lx, c.ly);
  }
  return pen > 0 ? -pen : best; // overlapping: −(total depth) — an escape gradient that sees EVERY solid
}

/** Point → square-box SIGNED distance: positive outside (closest-point), NEGATIVE inside (−nearest-face) — so a
 *  body whose center ends up inside a box still has an escape GRADIENT to climb (a plain 0-inside distance made
 *  deep pins directionless). */
function distToBox(x: number, y: number, bx: number, by: number, size: number): number {
  if (x >= bx && x <= bx + size && y >= by && y <= by + size) {
    return -Math.min(x - bx, bx + size - x, y - by, by + size - y);
  }
  const nx = Math.max(bx, Math.min(x, bx + size));
  const ny = Math.max(by, Math.min(y, by + size));
  return Math.hypot(x - nx, y - ny);
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

/** From OUTSIDE the ship, does a world-space circle at deck-LOCAL (lx,ly) overlap the SOLID hull AS DRAWN
 *  (rail = its wood only; gangplank = open door)? ONE truth for every mode — any body's edge reaches the
 *  drawn gunwale, walker and swimmer alike (the old full-cell "walker wall" over-blocked open dock floor). */
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
