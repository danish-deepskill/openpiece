import type { MoveMode } from '../ecs/components';

/**
 * ONE circle-vs-grid collision engine for EVERY frame (movement-frames.md). The world terrain grid, a ship's deck
 * grid, and any future grid (lower decks, building interiors — the pocket-map pattern) all resolve movement here;
 * what differs per frame is injected as a passability ORACLE, never re-implemented. This replaced the world/deck
 * TWIN sweeps (world/Collision + defs/decks), which were the same math maintained twice — one bug, two fixes.
 *
 * The oracle answers at QUARTER-TILE resolution: a `QuarterMask` of which quarters of the cell are SOLID (0 = all
 * clear, Q_SOLID = the full cell). Quantizing shapes to quarters keeps ONE collision primitive — circle-vs-AABB
 * closest-point — for every shape (a half-tile rail = two quarter boxes, a beveled corner = one), where free-form
 * shapes would each need their own math. Collision may be COARSER than the drawn shape (a 45° corner collides as
 * its quarter box) — imperceptible at tile scale, by design (the quantized-quarters decision).
 */

/** Bitmask of a cell's SOLID quarters: NW=1, NE=2, SW=4, SE=8. Compose halves from the corner bits. */
export type QuarterMask = number;
export const Q_CLEAR: QuarterMask = 0;
export const Q_NW: QuarterMask = 1;
export const Q_NE: QuarterMask = 2;
export const Q_SW: QuarterMask = 4;
export const Q_SE: QuarterMask = 8;
export const Q_N: QuarterMask = Q_NW | Q_NE; // top half
export const Q_S: QuarterMask = Q_SW | Q_SE; // bottom half
export const Q_W: QuarterMask = Q_NW | Q_SW; // left half
export const Q_E: QuarterMask = Q_NE | Q_SE; // right half
export const Q_SOLID: QuarterMask = Q_N | Q_S; // the whole cell

/** The per-move context an oracle may condition on: nav mode + transient movement state. Callers keep ONE scratch
 *  instance and mutate its fields per query (allocation-free hot loop); the collider never retains it past a call. */
export interface MoveCtx {
  mode: MoveMode;
  /** Mid-jump/Geppo — clears LOW blockers (a frame's oracle decides which; the map edge still applies). */
  airborne: boolean;
  /** Perched atop a low wall (mover.onLedge) — that low wall is walkable while balancing across it. */
  onLedge: boolean;
}

/** The passability oracle: which quarters of cell (cx,cy) BLOCK this mover? Cell coords may be OUT OF RANGE — the
 *  oracle owns its own out-of-bounds rule (the world reads endless sea there; a deck blocks past the hull). */
export type BlocksAt = (cx: number, cy: number, ctx: MoveCtx) => QuarterMask;

/** The grid's geometry — where its cells sit in the frame's own coordinates. */
export interface GridSpec {
  /** Cell size in px (world TILE, or a deck's tilePx). */
  cellPx: number;
  /** Frame coords of cell (0,0)'s TOP-LEFT corner: 0,0 for the world; a deck grid is ship-CENTERED, so its origin
   *  is (−cols·cellPx/2, −rows·cellPx/2). */
  originX: number;
  originY: number;
  /** Optional hard rect [0..w]×[0..h] the body's CENTER must stay `r` inside — the world's map edge (applies even
   *  AIRBORNE: no jumping off the map). Frames whose oracle already blocks past the grid (decks) omit it. */
  bounds?: { w: number; h: number };
}

export class GridCollider {
  constructor(
    private readonly spec: GridSpec,
    private readonly blocksAt: BlocksAt,
  ) {}

  /** Can a circle of radius r sit at (x,y)? EXACT circle-vs-AABB (not point sampling): for every solid quarter of
   *  every cell the circle's bounding box overlaps, the closest point on that quarter's box must be ≥ r away — so
   *  a wall touching the circle at ANY angle (including a diagonal corner) blocks, with no sample gaps to tune. */
  canOccupy(x: number, y: number, r: number, ctx: MoveCtx): boolean {
    const { cellPx, originX, originY, bounds } = this.spec;
    if (bounds && (x < r || y < r || x > bounds.w - r || y > bounds.h - r)) return false;
    // only the cells the circle's bounding box could touch — a small window, not the whole grid
    const cx0 = Math.floor((x - r - originX) / cellPx);
    const cx1 = Math.floor((x + r - originX) / cellPx);
    const cy0 = Math.floor((y - r - originY) / cellPx);
    const cy1 = Math.floor((y + r - originY) / cellPx);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const mask = this.blocksAt(cx, cy, ctx);
        if (mask === Q_CLEAR) continue; // only solid cells cost geometry
        if (circleHitsMask(x, y, r, originX + cx * cellPx, originY + cy * cellPx, cellPx, mask)) return false;
      }
    }
    return true;
  }

  /** Axis-separated move so sliding along walls feels right. Mutates {x,y}. `blocked` = an OPTIONAL extra obstacle
   *  predicate for a MOVING obstacle the static grid can't know (a ship hull): a step is taken only if the grid AND
   *  `blocked` both allow the target. Takes (x, y, r) so callers can share ONE persistent closure across every body
   *  size (no per-entity allocation). Keeps the collider pure geometry — the caller supplies the ship check. */
  tryMove(
    pos: { x: number; y: number },
    dx: number,
    dy: number,
    r: number,
    ctx: MoveCtx,
    blocked?: (x: number, y: number, r: number) => boolean,
  ): void {
    if (dx !== 0 && this.canOccupy(pos.x + dx, pos.y, r, ctx) && !blocked?.(pos.x + dx, pos.y, r)) pos.x += dx;
    if (dy !== 0 && this.canOccupy(pos.x, pos.y + dy, r, ctx) && !blocked?.(pos.x, pos.y + dy, r)) pos.y += dy;
  }

  /** DEPENETRATION — if a body is STUCK inside solid (spawned in a wall, landed on a tree, shoved into stone),
   *  SNAP it to the nearest clear spot: a ring search outward from the current center, nearest ring first. Mutates
   *  {x,y}; no-op when already clear (the common case — one cheap canOccupy). */
  unstick(pos: { x: number; y: number }, r: number, ctx: MoveCtx): void {
    if (this.canOccupy(pos.x, pos.y, r, ctx)) return; // already clear (or validly perched) — nothing to do
    const step = this.spec.cellPx * 0.5; // search granularity (half a cell — fine enough vs. body/cell sizes)
    for (let ring = 1; ring <= 12; ring++) {
      const rad = ring * step;
      // sample 8 directions at this radius, nearest ring first → the closest clear spot wins
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const cx = pos.x + Math.cos(a) * rad;
        const cy = pos.y + Math.sin(a) * rad;
        if (this.canOccupy(cx, cy, r, ctx)) {
          pos.x = cx;
          pos.y = cy;
          return;
        }
      }
    }
    // no clear spot within the search radius (should never happen in an open world) — leave it put
  }
}

/** Does the circle overlap any SOLID quarter of the cell at (left,top)? Full cells take one box test (the common
 *  case — don't pay 4× for plain walls); partial masks test each set quarter as its own half-size box. */
function circleHitsMask(x: number, y: number, r: number, left: number, top: number, cellPx: number, mask: QuarterMask): boolean {
  if (mask === Q_SOLID) return circleHitsBox(x, y, r, left, top, cellPx, cellPx);
  const h = cellPx / 2;
  if (mask & Q_NW && circleHitsBox(x, y, r, left, top, h, h)) return true;
  if (mask & Q_NE && circleHitsBox(x, y, r, left + h, top, h, h)) return true;
  if (mask & Q_SW && circleHitsBox(x, y, r, left, top + h, h, h)) return true;
  if (mask & Q_SE && circleHitsBox(x, y, r, left + h, top + h, h, h)) return true;
  return false;
}

/** Circle-vs-AABB: the closest point on the box to the circle center must be < r away to overlap. */
function circleHitsBox(x: number, y: number, r: number, bx: number, by: number, bw: number, bh: number): boolean {
  const nx = Math.max(bx, Math.min(x, bx + bw));
  const ny = Math.max(by, Math.min(y, by + bh));
  const dx = x - nx;
  const dy = y - ny;
  return dx * dx + dy * dy < r * r;
}
