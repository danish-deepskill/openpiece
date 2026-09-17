import { TILE } from '../config/constants';

/**
 * DECK GRIDS — a ship's walkable deck as a small ship-LOCAL tile level (docs/design/features/big-walkable-ship.md).
 * A hull authors its deck as compact string rows (one char per tile); this module parses them into a typed
 * `DeckGrid` whose tiles carry a LOCAL position centered on the ship (deck center = ship center at (0,0)), so
 * step 2's `world = ship.pos + rotate(local, ship.angle)` composition is a straight add+rotate. Content-is-data:
 * a new deck layout is a new `deck` string array on the hull def, no code (only a NEW glyph needs a row here).
 *
 * This module is the deck's PARSE + GEOMETRY: grid, local↔world transforms, cell/station lookups, hull validators.
 * Deck COLLISION lives in world/deckCollision.ts (the shared GridCollider engine, one sweep for every frame) — it
 * consumes this grid; render (draw/shipDraws) and station lookups consume it too. One parse, three consumers.
 */

/** A deck cell kind. `deck`/`helm`/`cannon` are walkable (stations are walkable deck you stand ON); `rail` walls
 *  the edge; `hole` is a gap (falls through to a lower deck later — blocks for now); `mast` is where a sail
 *  hangs (drawShipRig draws one rig PER mast cell — multi-masted ships are pure deck data, and the future
 *  ship-building palette places 'M' parts). Walkable for now; becoming a solid post + a per-mast damage
 *  target is the SAILING.md step-5 remainder. `hatch` is the HOLD's access point: stand on it to reach the
 *  ship's cargo (Items.reachableHold) — the wheel-is-the-helm-tile rule applied to storage. Extend by adding a GLYPH. */
export type DeckTile = 'deck' | 'rail' | 'helm' | 'cannon' | 'hole' | 'gangplank' | 'mast' | 'hatch';

/** Char → tile. '.' = plain deck (the common case). 'G' = GANGPLANK: a walkable seam in the rail where a
 *  world-space walker steps ON/OFF the ship (boarding = walking across it) — a hull may carry several
 *  (port + starboard doors). Everywhere else the hull is solid from outside. Unknown glyph → boot error. */
const GLYPH: Record<string, DeckTile> = {
  '.': 'deck',
  '#': 'rail',
  H: 'helm',
  C: 'cannon',
  O: 'hole',
  G: 'gangplank',
  M: 'mast',
  T: 'hatch', // the cargo TRAPDOOR — 'O' was already the hole
};

/** SPACE (and any ragged-row padding past a row's end) = OFF-HULL: no cell at all — open sea. This is how a deck
 *  authors a BOAT SHAPE: taper the bow/round the stern by leaving those cells blank, so the hull outline (the
 *  union of the cells that DO exist) is the boat, fully data-driven. Distinct from 'hole' (an on-hull deck gap). */
const EMPTY = ' ';

/** One parsed deck cell: its kind + its column/row in the grid + its LOCAL position (px, ship-centered). */
export interface DeckCell {
  tile: DeckTile;
  cx: number; // column (0 = west/stern side in local space before rotation)
  cy: number; // row
  lx: number; // LOCAL x (px), 0 = ship center — bow is +x (matches drawShip's local frame)
  ly: number; // LOCAL y (px), 0 = ship center
}

/** A parsed, ship-local deck: the cell grid + its dimensions. `tilePx` is the deck's own tile size (independent
 *  of the world TILE — a deck tile can be finer), so the whole deck spans cols·tilePx × rows·tilePx, centered. */
export interface DeckGrid {
  cells: DeckCell[];
  cols: number;
  rows: number;
  tilePx: number;
  /** Dense (cy·cols + cx) → cell index — the HOT-PATH oracle (2026-07 foundation audit): tileAt/
   *  deckCellAtLocal run per on-deck walker per tick, and a `cells.find()` there was a linear search with a
   *  per-call closure (deckCollision's masks solved this shape for collision; the general lookup never got
   *  the same index). `undefined` = off-hull (open sea). Built once in parseDeck; grids are immutable defs. */
  byCell: (DeckCell | undefined)[];
}

/** Deck tile size in px = the WORLD tile (config/constants TILE). ONE tile scale across the whole game: standing
 *  on a deck tile spans the same distance as standing on a land tile, so walking on deck (step 3) matches walking
 *  ashore and the deep-sim world stays one consistent grid. Hulls are sized so their deck grid fits the hull. */
export const DECK_TILE_PX = TILE;

/**
 * Parse a hull's `deck` string rows into a ship-LOCAL `DeckGrid`. Rows are laid out with row 0 at the top
 * (−y, port) and column 0 at the left (−x, stern) BEFORE the ship's heading rotation; the grid is centered so
 * the deck's middle sits at the ship's origin (0,0), matching drawShip's local frame (bow = +x). Ragged rows are
 * right-padded with plain deck to the widest row (so a layout can taper visually without manual space padding).
 * Throws on an unknown glyph — a deck typo fails at BOOT (BootScene sweep), never as an invisible hole mid-sail.
 */
export function parseDeck(rows: readonly string[], tilePx = DECK_TILE_PX): DeckGrid {
  if (rows.length === 0) throw new Error('parseDeck: empty deck (a hull deck needs at least one row)');
  const cols = Math.max(...rows.map((r) => r.length));
  const gridRows = rows.length;
  const cells: DeckCell[] = [];
  // center offset: shift so the grid's midpoint lands on (0,0). A cell's local center = (index + 0.5)·tilePx
  // measured from the grid's top-left, minus half the total span.
  const halfW = (cols * tilePx) / 2;
  const halfH = (gridRows * tilePx) / 2;
  for (let cy = 0; cy < gridRows; cy++) {
    const row = rows[cy];
    for (let cx = 0; cx < cols; cx++) {
      const ch = cx < row.length ? row[cx] : EMPTY; // ragged-row padding past a row's end = OFF-HULL (open sea)
      if (ch === EMPTY) continue; // no cell here — the boat shape is the union of the cells that DO exist
      const tile = GLYPH[ch];
      if (!tile) throw new Error(`parseDeck: unknown deck glyph '${ch}' at row ${cy}, col ${cx} — add it to GLYPH`);
      cells.push({
        tile,
        cx,
        cy,
        lx: (cx + 0.5) * tilePx - halfW, // +x = bow side (row's right end); centered
        ly: (cy + 0.5) * tilePx - halfH, // +y = starboard; centered
      });
    }
  }
  const byCell: (DeckCell | undefined)[] = new Array(cols * gridRows).fill(undefined);
  for (const c of cells) byCell[c.cy * cols + c.cx] = c;
  return { cells, cols, rows: gridRows, tilePx, byCell };
}

/** True if a tile kind is walkable (you can stand on it). Stations (helm/cannon) + the gangplank ARE walkable
 *  deck; rail/hole block. The one authority for "can an on-deck actor occupy this cell" — deck collision reads it. */
export function deckWalkable(tile: DeckTile): boolean {
  return tile === 'deck' || tile === 'helm' || tile === 'cannon' || tile === 'gangplank' || tile === 'mast' || tile === 'hatch';
}

/** The tile kind at a grid coord, or `undefined` if off-grid OR an off-hull (empty) cell — either way "open sea".
 *  Used by the renderer + deck collision + the enclosure check to ask "is there ship here?". */
export function tileAt(grid: DeckGrid, cx: number, cy: number): DeckTile | undefined {
  if (cx < 0 || cy < 0 || cx >= grid.cols || cy >= grid.rows) return undefined;
  return grid.byCell[cy * grid.cols + cx]?.tile; // O(1) index, no closure — hot path (audit M2)
}

/** The hull's drawn size in px, DERIVED from the grid (its tight bounding box × tilePx). The drawn boat and the
 *  walkable grid are the same shape, so length/width follow the deck data and can't drift. Returns {length,width}
 *  = {x-span, y-span} in the ship's LOCAL frame (bow = +x). */
export function deckHullSize(grid: DeckGrid): { length: number; width: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of grid.cells) {
    minX = Math.min(minX, c.cx);
    maxX = Math.max(maxX, c.cx);
    minY = Math.min(minY, c.cy);
    maxY = Math.max(maxY, c.cy);
  }
  return { length: (maxX - minX + 1) * grid.tilePx, width: (maxY - minY + 1) * grid.tilePx };
}

/** Validate a deck's HULL is watertight: every INTERIOR walkable cell (deck/helm/cannon) must be enclosed by ship
 *  on all 4 sides (rail/deck), never open to the sea. A gap = a walkable cell touching open sea (you'd stand at
 *  the edge with nothing between you and the water, and the drawn boat would have a hole). Rail cells ARE the edge
 *  and MAY face the sea. The GANGPLANK is the intentional door — it's ALLOWED (indeed meant) to face the sea, so
 *  it's exempt. Catches hand-authoring slips at BOOT. Returns an error string (with the cell) or null. */
export function deckHullError(grid: DeckGrid): string | null {
  for (const c of grid.cells) {
    if (!deckWalkable(c.tile) || c.tile === 'gangplank') continue; // rail = edge; gangplank = the intentional door
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      if (tileAt(grid, c.cx + dx, c.cy + dy) === undefined) {
        return `walkable '${c.tile}' cell at (col ${c.cx}, row ${c.cy}) is open to the sea — enclose it with rail`;
      }
    }
  }
  return null;
}

/** The FIRST gangplank — a convenience for single-door hulls (the rowboat; most tests). Multi-door callers
 *  must use gangplankCells/nearestGangplank — "the" door is ambiguous on a two-door hull. */
export function gangplankCell(grid: DeckGrid): DeckCell | undefined {
  return grid.cells.find((c) => c.tile === 'gangplank');
}

/** Every gangplank cell — a hull may carry SEVERAL doors (the sloop boards from either broadside; the
 *  developer's authoring). Each is a full door: its own lane, its own outward. */
export function gangplankCells(grid: DeckGrid): DeckCell[] {
  return grid.cells.filter((c) => c.tile === 'gangplank');
}

/** The door NEAREST a deck-local point — the one a walker at (lx,ly) would naturally use. Replaces the old
 *  single-gangplank lookup: with plural doors, "the" gangplank is always relative to who's asking. */
export function nearestGangplank(grid: DeckGrid, lx: number, ly: number): DeckCell | undefined {
  let best: DeckCell | undefined;
  let bestD = Infinity;
  for (const c of grid.cells) {
    if (c.tile !== 'gangplank') continue;
    const d = (c.lx - lx) * (c.lx - lx) + (c.ly - ly) * (c.ly - ly);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Parsed-deck cache keyed by the hull's id — the grid is immutable (defs are), so parse ONCE, not per frame.
 *  Render (step 1) + deck collision (step 2) share this one parse. Not on the entity (serialize-by-id canon). */
const deckCache = new Map<string, DeckGrid>();

/** The cached deck grid for a hull id + its raw rows. `deckOf(id, rows)` parses on first use, then O(1). The
 *  caller passes the rows (from the def) so this module needn't import the ship registry (avoids a cycle). */
export function deckOf(hullId: string, rows: string[]): DeckGrid {
  let g = deckCache.get(hullId);
  if (!g) {
    g = parseDeck(rows);
    deckCache.set(hullId, g);
  }
  return g;
}

/** A minimal ship pose the transforms need — the hull's world position + heading. (Not the Ship component; kept
 *  structural so these helpers stay pure/engine-agnostic and testable without a World.) */
export interface ShipPose {
  x: number;
  y: number;
  angle: number;
}

/**
 * DECK-LOCAL → WORLD: place a deck-local point (lx,ly, bow=+x) into world space for a ship at `pose`. This IS the
 * parenting math — `world = ship.pos + rotate(local, ship.angle)`, a real 2D rotation (cos/sin). Run each tick per
 * on-deck actor (ShipSystem) so it rides the deck as the hull turns. The ONE place this rotation lives; the
 * inverse (`worldToDeck`) and click-picking (`deckCellAtLocal`) share the same convention.
 */
export function deckToWorld(pose: ShipPose, lx: number, ly: number): { x: number; y: number } {
  const cos = Math.cos(pose.angle);
  const sin = Math.sin(pose.angle);
  return { x: pose.x + lx * cos - ly * sin, y: pose.y + lx * sin + ly * cos };
}

/** WORLD → DECK-LOCAL: the inverse of `deckToWorld` — un-rotate + un-translate a world point into the ship's deck
 *  frame. Feeds click-a-deck-tile picking and (later) deck collision of a world-space contact. */
export function worldToDeck(pose: ShipPose, wx: number, wy: number): { lx: number; ly: number } {
  const cos = Math.cos(pose.angle);
  const sin = Math.sin(pose.angle);
  const dx = wx - pose.x;
  const dy = wy - pose.y;
  return { lx: dx * cos + dy * sin, ly: -dx * sin + dy * cos };
}

/** The deck cell containing a ship-LOCAL point, or undefined if it's off the grid (past the hull). Maps a local px
 *  position back to a `DeckCell` — the last hop of click→tile (`worldToDeck` then this). Grid is centered on the
 *  ship origin, so shift by half-span before dividing by tilePx. */
export function deckCellAtLocal(grid: DeckGrid, lx: number, ly: number): DeckCell | undefined {
  const cx = Math.floor((lx + (grid.cols * grid.tilePx) / 2) / grid.tilePx);
  const cy = Math.floor((ly + (grid.rows * grid.tilePx) / 2) / grid.tilePx);
  if (cx < 0 || cy < 0 || cx >= grid.cols || cy >= grid.rows) return undefined;
  return grid.byCell[cy * grid.cols + cx]; // O(1) index, no closure — hot path (audit M2)
}

/** The gangplank's OUTWARD unit direction (toward open sea) — whichever orthogonal neighbor is off-grid. Used by
 *  the walk-off (step off the door) to know which way is "out". */
export function gangplankOutward(grid: DeckGrid, cell: DeckCell): [number, number] {
  if (tileAt(grid, cell.cx - 1, cell.cy) === undefined) return [-1, 0];
  if (tileAt(grid, cell.cx + 1, cell.cy) === undefined) return [1, 0];
  if (tileAt(grid, cell.cx, cell.cy - 1) === undefined) return [0, -1];
  return [0, 1];
}

/** A default deck-local spot to place a boarding actor: the HELM cell's local center (there's exactly one — the
 *  hull validator guarantees it). Step 3 lets the actor walk from here; for now it's where you stand after boarding. */
export function helmSpot(grid: DeckGrid): { lx: number; ly: number } {
  const helm = grid.cells.find((c) => c.tile === 'helm');
  if (!helm) throw new Error('helmSpot: deck has no helm (hull validation should have caught this)');
  return { lx: helm.lx, ly: helm.ly };
}

/** The HATCH cell's local center — where you stand to reach the hold (exactly one per hull with a hold; the hull
 *  validator guarantees it). Tests + a future stow-cargo job path here. */
export function hatchSpot(grid: DeckGrid): { lx: number; ly: number } {
  const hatch = grid.cells.find((c) => c.tile === 'hatch');
  if (!hatch) throw new Error('hatchSpot: deck has no hatch (hull validation should have caught this)');
  return { lx: hatch.lx, ly: hatch.ly };
}

/** Walkable deck cells other than a given one — used to spread boarding crew across the deck so they don't stack
 *  on the helm. Returns their local centers, nearest-to-helm first isn't needed yet (order is grid order). */
export function walkableSpots(grid: DeckGrid): Array<{ lx: number; ly: number }> {
  return grid.cells.filter((c) => deckWalkable(c.tile)).map((c) => ({ lx: c.lx, ly: c.ly }));
}
