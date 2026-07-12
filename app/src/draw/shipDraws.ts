import { deckOf, isJamb, tileAt, type DeckTile } from '../defs/decks';
import { clamp } from '../core/math';
import { ShipHulls } from '../defs/ships';
import type { DrawFn } from './actorDraws';

const DECK_PLANK = 0xcaa06a; // the walkable deck surface (plank)
const RAIL_WOOD = 0x6b4522; // the gunwale wood — a rail tile's INNER half is wood, its sea-facing half is undrawn
const RAIL_EDGE = 0x3a2410; // the gunwale's outline
const HELM_TINT = 0x8a6a3a; // the helm station tile, a touch darker than plank so it reads
const CANNON_TILE = 0x4a4a52; // an iron gun tile
const GANGPLANK_WOOD = 0x9a7038; // the gangplank board — a distinct darker plank, the board/leave door in the rail

/** How far (fraction of a tile) a rail tile's wood is pulled BACK from each sea-facing side — the "half rail":
 *  the outer half of a rail tile is left undrawn so the sea shows through; the inner half is the wood gunwale. */
const RAIL_INSET = 0.5;

/** Per-tile deck-surface fill for the WALKABLE tiles only (rail is drawn separately as a half-tile gunwale, so it
 *  is NOT in here — a rail tile gets no deck floor). Stations tint over the plank; the gangplank is its own board. */
const SURFACE_FILL: Partial<Record<DeckTile, number>> = { deck: DECK_PLANK, helm: HELM_TINT, cannon: CANNON_TILE, hole: 0x241a10, gangplank: GANGPLANK_WOOD };

/**
 * Oriented ship (bow at +x in LOCAL space; RenderSystem rotates the Graphics to the heading). The hull IS the
 * deck grid: walkable tiles are the plank floor; each RAIL tile is HALF wood, HALF open sea — the renderer reads
 * each rail cell's NEIGHBORS and pulls the wood back from every SEA-FACING side by half a tile, so straight edges
 * show sea on their outer half and corners (two sea sides trimmed) taper into a boat bevel. All auto from the grid.
 */
export const drawShip: DrawFn = (g, e) => {
  const sh = e.ship!;
  const d = ShipHulls.get(sh.hull);
  const L = d.length / 2;
  const W = d.width / 2;
  const grid = deckOf(sh.hull, d.deck);
  const s = grid.tilePx;
  const h = s / 2;
  const inset = s * RAIL_INSET; // how far the rail wood retreats from a sea-facing side
  const ship = (cx: number, cy: number): boolean => tileAt(grid, cx, cy) !== undefined; // is there hull here?

  // water shadow — an ellipse under the whole hull (sized to the derived grid span)
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(0, 6, d.length * 0.98, d.width * 0.98);

  // PASS 1 — the DECK SURFACE: fill only WALKABLE/station tiles with plank (NO fill on rail tiles — a rail is the
  // half-wood-half-sea edge, not floor). One flat color, no per-tile stroke → no box grid.
  for (const c of grid.cells) {
    const f = SURFACE_FILL[c.tile];
    if (f === undefined) continue; // rail → skip (drawn as the gunwale below)
    g.fillStyle(f, 1);
    g.fillRect(c.lx - h, c.ly - h, s, s);
  }

  // PASS 2 — the HALF-TILE GUNWALE. Each rail tile draws its wood as the cell rectangle pulled BACK by `inset` on
  // every SEA-FACING side (deck-facing sides stay flush) → a straight edge shows sea on its outer half. An OUTER
  // CORNER (two ADJACENT sea sides) instead draws a TRIANGLE: the outer corner is cut on the 45° diagonal so the
  // hull tapers (a beveled boat corner), not a stepped quarter-square. Neighbor-driven, so any hull shape works.
  g.fillStyle(RAIL_WOOD, 1);
  g.lineStyle(1, RAIL_EDGE, 0.6);
  for (const c of grid.cells) {
    if (c.tile !== 'rail') continue;
    const seaN = !ship(c.cx, c.cy - 1);
    const seaS = !ship(c.cx, c.cy + 1);
    const seaW = !ship(c.cx - 1, c.cy);
    const seaE = !ship(c.cx + 1, c.cy);
    const wx = c.lx;
    const wy = c.ly;
    // DOOR JAMB: a rail flanking the gangplank draws as a FULL wooden post — flush to the whole cell — because
    // its collision IS the whole cell (deckCollision's jamb rule: solid to swimmers too, after bodies kept
    // slipping past the door's open halves). isJamb is the ONE shared predicate, so art and collision can
    // never disagree here — and the doorframe telegraphs the boarding spot.
    if (isJamb(grid, c)) {
      g.fillRect(wx - h, wy - h, s, s);
      g.strokeRect(wx - h, wy - h, s, s);
      continue;
    }
    // outer-corner tile: exactly two ADJACENT sea sides. Draw a triangle whose hypotenuse (the 45° cut) faces the
    // sea corner and whose two legs run along the deck-facing edges — so the corner reads as a diagonal bevel.
    const cornerNW = seaN && seaW && !seaS && !seaE; // sea to the N and W → cut the NW corner
    const cornerNE = seaN && seaE && !seaS && !seaW;
    const cornerSW = seaS && seaW && !seaN && !seaE;
    const cornerSE = seaS && seaE && !seaN && !seaW;
    if (cornerNW || cornerNE || cornerSW || cornerSE) {
      // Same thin gunwale as a straight edge (the inner square, sea-facing sides pulled in by `inset`), but the
      // OUTER corner of that square is cut on a 45° diagonal → a TRIANGLE, so the corner tapers into a boat bevel
      // instead of reading as a stepped quarter-square. The two deck-facing corners stay square (they meet the
      // neighbouring straight rails); only the single sea-facing corner is chamfered to a point.
      const ix0 = wx - h + (seaW ? inset : 0); // the inner square (matches the straight-rail thickness)
      const ix1 = wx + h - (seaE ? inset : 0);
      const iy0 = wy - h + (seaN ? inset : 0);
      const iy1 = wy + h - (seaS ? inset : 0);
      // vertices: the deck-facing corner (apex, full) + the two edge ends, with the sea corner dropped to a point.
      let poly;
      if (cornerNW) poly = [{ x: ix1, y: iy0 }, { x: ix1, y: iy1 }, { x: ix0, y: iy1 }]; // apex SE; cut toward NW
      else if (cornerNE) poly = [{ x: ix0, y: iy0 }, { x: ix1, y: iy1 }, { x: ix0, y: iy1 }]; // apex SW
      else if (cornerSW) poly = [{ x: ix1, y: iy0 }, { x: ix1, y: iy1 }, { x: ix0, y: iy0 }]; // apex NE
      else poly = [{ x: ix0, y: iy0 }, { x: ix1, y: iy0 }, { x: ix0, y: iy1 }]; // cornerSE, apex NW
      g.fillPoints(poly, true);
      g.strokePoints(poly, true);
      continue;
    }
    // straight edge / interior: the inset rectangle (sea shows on any sea-facing half).
    const x0 = wx - h + (seaW ? inset : 0);
    const x1 = wx + h - (seaE ? inset : 0);
    const y0 = wy - h + (seaN ? inset : 0);
    const y1 = wy + h - (seaS ? inset : 0);
    if (x1 <= x0 || y1 <= y0) continue;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.strokeRect(x0, y0, x1 - x0, y1 - y0);
  }

  // PASS 3 — station markers (wheel + cannon barrels) on top of everything.
  for (const c of grid.cells) {
    if (c.tile === 'helm') {
      g.lineStyle(2, 0x2a1c0e, 0.9);
      g.strokeCircle(c.lx, c.ly, s * 0.28); // a little ship's wheel
    } else if (c.tile === 'cannon') {
      g.fillStyle(0x1c1c22, 1);
      const dir = c.ly < 0 ? -1 : 1; // port cannon points −y, starboard +y
      g.fillRect(c.lx - s * 0.12, c.ly - (dir < 0 ? s * 0.5 : 0), s * 0.24, s * 0.5); // stubby barrel off the broadside
    }
  }

  // mast + sail near amidships (billows toward the bow with speed)
  const bulge = clamp(sh.speed / d.maxSpeed, -1, 1) * W * 0.4;
  g.fillStyle(0xf3e7c9, 1);
  g.fillTriangle(0, -W * 0.5, 0, W * 0.5, 18 + bulge, 0);
  g.lineStyle(2, 0xd8c79a, 1);
  g.strokeTriangle(0, -W * 0.5, 0, W * 0.5, 18 + bulge, 0);
  g.fillStyle(0x5a3a1c, 1);
  g.fillCircle(0, 0, 4); // the mast base

  // bow flag (marks heading) — at the forward tip
  g.fillStyle(0xd4483b, 1);
  g.fillTriangle(L * 0.96, -3, L * 0.96, -16, L * 0.82, -9);

  // anchored: a small chain dot off the stern
  if (sh.anchored) {
    g.fillStyle(0x2b2b33, 0.9);
    g.fillCircle(-L, 0, 4);
  }
};
