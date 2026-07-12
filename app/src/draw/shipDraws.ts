import { deckOf, tileAt, type DeckTile } from '../defs/decks';
import { clamp } from '../core/math';
import { ShipHulls } from '../defs/ships';
import type { DrawFn } from './actorDraws';

const DECK_PLANK = 0xcaa06a; // the walkable deck surface (plank)
const RAIL_WOOD = 0x6b4522; // the gunwale wood — a rail tile is a FULL block of it (collision matches exactly)
const RAIL_EDGE = 0x3a2410; // the gunwale's outline
const HELM_TINT = 0x8a6a3a; // the helm station tile, a touch darker than plank so it reads
const CANNON_TILE = 0x4a4a52; // an iron gun tile
const GANGPLANK_WOOD = 0x9a7038; // the gangplank board — a distinct darker plank, the board/leave door in the rail

/** Per-tile deck-surface fill for the WALKABLE tiles only (rail is drawn separately as the full-tile gunwale, so
 *  it is NOT in here — a rail tile gets no deck floor). Stations tint over the plank; the gangplank is its own board. */
const SURFACE_FILL: Partial<Record<DeckTile, number>> = { deck: DECK_PLANK, helm: HELM_TINT, cannon: CANNON_TILE, hole: 0x241a10, gangplank: GANGPLANK_WOOD };

/**
 * Oriented ship (bow at +x in LOCAL space; RenderSystem rotates the Graphics to the heading). The hull IS the
 * deck grid: walkable tiles are the plank floor; each RAIL tile is a FULL block of gunwale wood (its collision,
 * exactly), with outer corners cosmetically beveled at 45° so the hull tapers like a boat. All auto from the grid.
 */
export const drawShip: DrawFn = (g, e) => {
  const sh = e.ship!;
  const d = ShipHulls.get(sh.hull);
  const L = d.length / 2;
  const W = d.width / 2;
  const grid = deckOf(sh.hull, d.deck);
  const s = grid.tilePx;
  const h = s / 2;
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

  // PASS 2 — the FULL-TILE GUNWALE (the developer's overhaul: simple collision, shaped looks). Every rail is a
  // FULL cell of wood — exactly its full-tile hitbox, no sub-tile seams. An OUTER CORNER rail (exactly two
  // ADJACENT sea sides) keeps the full-tile HITBOX but draws its sea corner CUT at 45° between the two sea
  // edges' midpoints — a purely COSMETIC bevel so the hull reads as a boat, not a brick. Neighbor-driven, so
  // any authored hull shape works.
  g.fillStyle(RAIL_WOOD, 1);
  g.lineStyle(1, RAIL_EDGE, 0.6);
  for (const c of grid.cells) {
    if (c.tile !== 'rail') continue;
    const seaN = !ship(c.cx, c.cy - 1);
    const seaS = !ship(c.cx, c.cy + 1);
    const seaW = !ship(c.cx - 1, c.cy);
    const seaE = !ship(c.cx + 1, c.cy);
    const x0 = c.lx - h;
    const x1 = c.lx + h;
    const y0 = c.ly - h;
    const y1 = c.ly + h;
    const cornerNW = seaN && seaW && !seaS && !seaE; // sea to the N and W → bevel the NW corner
    const cornerNE = seaN && seaE && !seaS && !seaW;
    const cornerSW = seaS && seaW && !seaN && !seaE;
    const cornerSE = seaS && seaE && !seaN && !seaW;
    if (cornerNW || cornerNE || cornerSW || cornerSE) {
      // a RIGHT TRIANGLE: the two deck-facing edges are the legs, the hypotenuse cuts the full cell diagonal
      // across the sea corner — the classic boat taper (cosmetic; the hitbox stays the full tile)
      let poly;
      if (cornerNW) poly = [{ x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]; // SE half kept
      else if (cornerNE) poly = [{ x: x0, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]; // SW half kept
      else if (cornerSW) poly = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }]; // NE half kept
      else poly = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x0, y: y1 }]; // NW half kept
      g.fillPoints(poly, true);
      g.strokePoints(poly, true);
      continue;
    }
    g.fillRect(x0, y0, s, s);
    g.strokeRect(x0, y0, s, s);
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
