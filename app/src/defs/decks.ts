import { TILE } from '../config/constants';

/**
 * DECK GRIDS — a ship's walkable deck as a small ship-LOCAL tile level (docs/design/features/big-walkable-ship.md).
 * A hull authors its deck as compact string rows (one char per tile); this module parses them into a typed
 * `DeckGrid` whose tiles carry a LOCAL position centered on the ship (deck center = ship center at (0,0)), so
 * step 2's `world = ship.pos + rotate(local, ship.angle)` composition is a straight add+rotate. Content-is-data:
 * a new deck layout is a new `deck` string array on the hull def, no code (only a NEW glyph needs a row here).
 *
 * Step 1 (now) uses this ONLY to RENDER the deck as tiles. The same grid feeds step 2's deck collision + step 4's
 * helm/cannon station lookup — one parse, three consumers — which is why the tiles already carry local coords.
 */

/** A deck cell kind. `deck`/`helm`/`cannon` are walkable (stations are walkable deck you stand ON); `rail` walls
 *  the edge; `hole` is a gap (falls through to a lower deck later — blocks for now). Extend by adding a GLYPH. */
export type DeckTile = 'deck' | 'rail' | 'helm' | 'cannon' | 'hole' | 'gangplank';

/** Char → tile. '.' = plain deck (the common case). 'G' = GANGPLANK: the ONE walkable seam in the rail where a
 *  world-space walker steps ON/OFF the ship (boarding = walking across it). Everywhere else the hull is solid from
 *  outside; the gangplank is the door. Unknown glyph → boot error. */
const GLYPH: Record<string, DeckTile> = {
  '.': 'deck',
  '#': 'rail',
  H: 'helm',
  C: 'cannon',
  O: 'hole',
  G: 'gangplank',
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
  return { cells, cols, rows: gridRows, tilePx };
}

/** True if a tile kind is walkable (you can stand on it). Stations (helm/cannon) + the gangplank ARE walkable
 *  deck; rail/hole block. The one authority for "can an on-deck actor occupy this cell" — deck collision reads it. */
export function deckWalkable(tile: DeckTile): boolean {
  return tile === 'deck' || tile === 'helm' || tile === 'cannon' || tile === 'gangplank';
}

/** The tile kind at a grid coord, or `undefined` if off-grid OR an off-hull (empty) cell — either way "open sea".
 *  Used by the renderer + deck collision + the enclosure check to ask "is there ship here?". */
export function tileAt(grid: DeckGrid, cx: number, cy: number): DeckTile | undefined {
  if (cx < 0 || cy < 0 || cx >= grid.cols || cy >= grid.rows) return undefined;
  return grid.cells.find((c) => c.cx === cx && c.cy === cy)?.tile;
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

/** The gangplank cell (the one board/leave seam), or undefined if the hull has none. */
export function gangplankCell(grid: DeckGrid): DeckCell | undefined {
  return grid.cells.find((c) => c.tile === 'gangplank');
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
  return grid.cells.find((c) => c.cx === cx && c.cy === cy);
}

/** DECK COLLISION — can a circle of radius r sit at deck-LOCAL (lx,ly)? The deck's own circle-vs-AABB, mirroring
 *  world `Collision.canOccupy` but over the deck grid in LOCAL coords: a WALKABLE cell (deck/helm/cannon) is
 *  passable; a RAIL cell or OFF-GRID (open sea past the hull) blocks — UNLESS `airborne`, which clears the rail
 *  (the rail is a LOW WALL: jump/Geppo hops over it to leap off, per MOVEMENT_AIR.md). Off-grid still blocks even
 *  airborne (you can't hover onto empty sea — you'd fall). Grid cells are ship-centered, so a cell spans
 *  [c.lx−t/2, c.lx+t/2] × [c.ly−t/2, c.ly+t/2]; we test every cell the circle's bbox overlaps. */
export function deckCanOccupy(grid: DeckGrid, lx: number, ly: number, r: number, airborne = false): boolean {
  const t = grid.tilePx;
  const passable = (cell: DeckCell | undefined): boolean => {
    if (!cell) return false; // off-grid (open sea) blocks in BOTH foot and air — no floor to stand/land on
    if (deckWalkable(cell.tile)) return true; // deck/helm/cannon
    return airborne && cell.tile === 'rail'; // a low-wall rail is clearable only while airborne
  };
  const halfW = (grid.cols * t) / 2;
  const halfH = (grid.rows * t) / 2;
  // grid-cell window the circle's bbox could touch (convert local px → cell index: +half-span, /tile)
  const cx0 = Math.floor((lx - r + halfW) / t);
  const cx1 = Math.floor((lx + r + halfW) / t);
  const cy0 = Math.floor((ly - r + halfH) / t);
  const cy1 = Math.floor((ly + r + halfH) / t);
  const r2 = r * r;
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      if (passable(grid.cells.find((c) => c.cx === cx && c.cy === cy))) continue; // only blocking cells matter
      // the blocking cell's box in LOCAL px, then closest-point distance to the circle center
      const bx0 = cx * t - halfW;
      const by0 = cy * t - halfH;
      const nx = Math.max(bx0, Math.min(lx, bx0 + t));
      const ny = Math.max(by0, Math.min(ly, by0 + t));
      const dx = lx - nx;
      const dy = ly - ny;
      if (dx * dx + dy * dy < r2) return false; // circle overlaps this wall/sea → can't sit here
    }
  }
  return true;
}

/** Axis-separated deck move (slide along the rail feels right), mutating an {lx,ly} local position. Mirrors world
 *  `Collision.tryMove` but on the deck grid. `airborne` lets a jumper cross the rail (to leap off the ship). */
export function deckTryMove(pos: { lx: number; ly: number }, dlx: number, dly: number, grid: DeckGrid, r: number, airborne = false): void {
  if (dlx !== 0 && deckCanOccupy(grid, pos.lx + dlx, pos.ly, r, airborne)) pos.lx += dlx;
  if (dly !== 0 && deckCanOccupy(grid, pos.lx, pos.ly + dly, r, airborne)) pos.ly += dly;
}

/** A default deck-local spot to place a boarding actor: the HELM cell's local center (there's exactly one — the
 *  hull validator guarantees it). Step 3 lets the actor walk from here; for now it's where you stand after boarding. */
export function helmSpot(grid: DeckGrid): { lx: number; ly: number } {
  const helm = grid.cells.find((c) => c.tile === 'helm');
  if (!helm) throw new Error('helmSpot: deck has no helm (hull validation should have caught this)');
  return { lx: helm.lx, ly: helm.ly };
}

/** Walkable deck cells other than a given one — used to spread boarding crew across the deck so they don't stack
 *  on the helm. Returns their local centers, nearest-to-helm first isn't needed yet (order is grid order). */
export function walkableSpots(grid: DeckGrid): Array<{ lx: number; ly: number }> {
  return grid.cells.filter((c) => deckWalkable(c.tile)).map((c) => ({ lx: c.lx, ly: c.ly }));
}
