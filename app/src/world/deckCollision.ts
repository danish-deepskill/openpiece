import { deckCellAtLocal, deckWalkable, isJamb, tileAt, worldToDeck, type DeckCell, type DeckGrid, type ShipPose } from '../defs/decks';
import { GridCollider, Q_CLEAR, Q_E, Q_N, Q_NE, Q_NW, Q_S, Q_SE, Q_SOLID, Q_SW, Q_W, type MoveCtx, type QuarterMask } from './GridCollider';

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
  /** The hull as a WALL to a GROUNDED walker: rails block FULL-cell. The rail's open sea-half is a SWIMMER's
   *  affordance (float up to the drawn wood) — never a footpath: a wader standing in that half-tile strip read
   *  as "on the rail without jumping" (the gangplank-side report). Zero-wood rails (sea on opposite sides) stay
   *  open — collision never blocks where nothing is drawn. */
  hullWall: GridCollider;
  /** The mask tables (cy·cols+cx) — kept for hullWoodClearance (the blocked-body escape rule). */
  wood: Uint8Array;
  wall: Uint8Array;
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
  const wall = new Uint8Array(cols * rows); // hull-to-a-WALKER: rails full-cell (see DeckColliders.hullWall)
  for (const c of grid.cells) {
    const i = c.cy * cols + c.cx;
    if (deckWalkable(c.tile)) {
      grounded[i] = Q_CLEAR;
      cleared[i] = Q_CLEAR;
    } else if (c.tile === 'rail') {
      cleared[i] = Q_CLEAR; // the LOW WALL: airborne hops it, a perched walker balances along it
    }
    // DOOR JAMBS are solid POSTS in EVERY truth: a rail flanking the gangplank blocks full-cell even for a
    // swimmer. The sea-half hug is an OPEN-HULL affordance — at the door it let a body that briefly counted
    // as swimming (two deep-water steps across the lane mouth) slide half its hitbox into the rail beside
    // the plank, then freeze there as a walker (the world-frame door report). isJamb is the ONE predicate
    // shared with the renderer (shipDraws draws jambs as full posts), so solid-as-drawn can't drift here.
    if (c.tile === 'rail') wood[i] = isJamb(grid, c) ? Q_SOLID : railWoodMask(grid, c);
    else if (c.tile !== 'gangplank') wood[i] = Q_SOLID; // interior (deck/helm/cannon/hole) is solid boat; the gangplank is the door
    if (c.tile === 'rail') wall[i] = wood[i] === 0 ? Q_CLEAR : Q_SOLID; // zero-wood rail = nothing drawn = no invisible wall
    else wall[i] = wood[i]; // interior solid / gangplank open — identical to the as-drawn truth
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
    hullWall: new GridCollider(spec, (cx, cy) => (inGrid(cx, cy) ? wall[cy * cols + cx] : Q_CLEAR)),
    wood,
    wall,
  };
}

/** Total circle penetration (px, summed) into RAIL cells specifically — full-cell boxes, the walker truth.
 *  The escape rule caps THIS separately from total clearance: its sum measure is blind to WHICH box holds the
 *  depth, so a body overlapping the interior column could TRADE that overlap for GUNWALE overlap one-for-one
 *  ("parallel", allowed) and walk visibly into the rail. Interior overlap is invisible; the rail is not. */
export function hullRailPen(grid: DeckGrid, lx: number, ly: number, r: number): number {
  const h = grid.tilePx / 2;
  let pen = 0;
  for (const c of grid.cells) {
    if (c.tile !== 'rail') continue;
    const d = distToBox(lx, ly, c.lx - h, c.ly - h, h * 2); // the full cell (the walker-truth rail box)
    if (d < r) pen += r - d;
  }
  return pen;
}

/** DEBUG read-only view of a hull's mask tables (cy·cols+cx) — the ground truth the collision overlay draws,
 *  so the debug can never drift from what actually blocks. Never mutate. */
export function hullDebugMasks(grid: DeckGrid): { wood: Uint8Array; wall: Uint8Array } {
  const c = collidersOf(grid);
  return { wood: c.wood, wall: c.wall };
}

/** Distance (px) from a deck-LOCAL point to the NEAREST hull solid under the given truth — as-drawn wood for a
 *  swimmer, full-cell rail WALLS for a grounded `walker`. The CLEARANCE a blocked body has. Powers the escape
 *  rule: a body blocked under its own truth may only take steps that strictly INCREASE this — it always walks
 *  itself out (any escape direction gains clearance) but can never creep ALONG the hull at constant depth (the
 *  gunwale-traversal glitch) nor freeze (the post-drop-off dockside pin: blocking every step trapped a wader
 *  whose body already overlapped the wall band). Cold path (blocked bodies only) — a full cell scan is fine. */
export function hullWoodClearance(grid: DeckGrid, lx: number, ly: number, walker = false, r = 0): number {
  const c0 = collidersOf(grid);
  const table = walker ? c0.wall : c0.wood;
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

/** From OUTSIDE the ship, does a world-space circle at deck-LOCAL (lx,ly) overlap the SOLID hull?
 *  Default = the hull AS DRAWN (rail = its wood only; gangplank = open door) — a swimmer floats right up to
 *  the drawn gunwale. `walker` = the GROUNDED truth: rails wall FULL-cell, so a wader can never stand in the
 *  rail's open sea-half strip and read as "on the rail without jumping". */
export function hullBlocksOutside(grid: DeckGrid, lx: number, ly: number, r: number, walker = false): boolean {
  const c = collidersOf(grid);
  return !(walker ? c.hullWall : c.hull).canOccupy(lx, ly, r, HULL_CTX);
}

/** Does a ship (at world `pose`, hull `grid`) BLOCK a world-space circle at (wx,wy)? The hull is a MOVING wall to
 *  off-ship walkers: transform the point into the deck frame and test the solid footprint. MovementSystem uses it
 *  to REJECT a step into a hull (a true wall-stop — you bump the gunwale and slide, no teleport). `walker` picks
 *  the grounded full-cell rail truth (see hullBlocksOutside) — and for EVERYONE, the CENTER may never stand
 *  inside a rail cell: the swimmer wood-hug admits the body edge into a rail's open half (that's the drawn-
 *  gunwale honesty), but a center ON the rail tile reads as standing on the ship without boarding — the
 *  door-corner slide the quarter-wood cells kept re-opening case by case. One rule ends the family. */
export function hullBlocksWorldPoint(pose: ShipPose, grid: DeckGrid, wx: number, wy: number, r: number, walker = false): boolean {
  const local = worldToDeck(pose, wx, wy);
  if (deckCellAtLocal(grid, local.lx, local.ly)?.tile === 'rail') return true;
  return hullBlocksOutside(grid, local.lx, local.ly, r, walker);
}
