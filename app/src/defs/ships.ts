import { Registry, type Def } from '../core/Registry';
import { deckHullError, deckHullSize, parseDeck, tileAt } from './decks';

/**
 * Ship hull templates (data-driven, like every other content family). A ship is a composite entity: a hull
 * gives base stats + slots; parts/cannons (deferred) will layer on as components/modifiers, and naval combat
 * reuses the shared attribute/ability engine. New classes = new registry entries.
 */
export interface ShipHullDef extends Def {
  name: string;
  shipClass: 'sloop' | 'caravel' | 'galleon';
  hp: number; // hull health
  maxSpeed: number; // px/s forward
  accel: number; // px/s^2 throttle response — LOW on purpose: sails catching wind, not a motorboat
  /** Reverse cap as a fraction of maxSpeed (0..1). Sail ships can't sail backwards — this is slow "backing"
   *  to unstick from docks, not a gear. */
  reverseFrac: number;
  /** Speed bled while turning (exp rate/s at full rudder) — carving a hard turn costs momentum. */
  turnBrake: number;
  turnRate: number; // rad/s at full sail
  /** Fraction of turnRate available at ZERO speed (0..1). A rudder needs waterflow, so 0 = a stopped ship
   *  cannot turn at all (chosen: backing up restores flow, hence steering — no dock-lock). Raise above 0
   *  only if idle turning ever needs to come back as a QoL floor. */
  minTurnFrac: number;
  r: number; // collision radius
  /** Drawn hull size in px. DERIVED from the deck grid (its bounding box × tile size) and boot-validated to match,
   *  so the drawn boat and the walkable grid are the same shape — they can't drift. To resize a hull, edit its
   *  `deck` grid, then set these to the new grid span (the boot error tells you the exact numbers if they mismatch). */
  length: number; // = grid cols × DECK_TILE_PX (bow↔stern, the +x axis)
  width: number; // = grid rows × DECK_TILE_PX (beam)
  cannonSlots: number;
  /** How many can RIDE (pilot + passengers) — the crew capacity. Boarding is refused once full, so a bigger
   *  hull carries more of your crew across. */
  seats: number;
  color: number;
  /** WALKABLE DECK layout — the GRID IS the hull (docs/design/features/big-walkable-ship.md). Compact string rows,
   *  one char per tile, parsed into a ship-LOCAL grid (bow = the row's +x/right end). Glyphs: '.' = deck, '#' =
   *  rail (hull edge/gunwale), 'H' = helm, 'C' = cannon, 'O' = hole; a SPACE = off-hull (open sea), which is how
   *  the boat SHAPE is authored — taper the bow / round the stern by leaving cells blank. Step 1 RENDERS this as
   *  the whole boat; steps 2-4 add local-space walking, deck collision, helm/cannon stations on the SAME grid.
   *  Boot-validated: parses, exactly one helm, watertight (walkable cells enclosed), and its span = length/width. */
  deck: string[];
}

// validated at boot: accel ≤ 0 is the "W does nothing" bug class as a data typo; fraction knobs must be 0..1
export const ShipHulls = new Registry<ShipHullDef>('ShipHulls', (s) => {
  if (!(s.hp > 0)) return `hp must be > 0 (got ${s.hp})`;
  if (!(s.maxSpeed > 0)) return `maxSpeed must be > 0 (got ${s.maxSpeed})`;
  if (!(s.accel > 0)) return `accel must be > 0 — a hull that can't thrust can't sail (got ${s.accel})`;
  if (s.reverseFrac < 0 || s.reverseFrac > 1) return `reverseFrac must be in [0, 1] (got ${s.reverseFrac})`;
  if (s.minTurnFrac < 0 || s.minTurnFrac > 1) return `minTurnFrac must be in [0, 1] (got ${s.minTurnFrac})`;
  if (!(s.turnRate > 0)) return `turnRate must be > 0 (got ${s.turnRate})`;
  if (!(s.turnBrake >= 0)) return `turnBrake must be ≥ 0 (got ${s.turnBrake})`;
  if (!(s.r > 0)) return `r must be > 0 (got ${s.r})`;
  // the deck GRID IS the hull. It must: parse (no unknown glyph); carry exactly ONE helm (can't pilot with none,
  // ambiguous with two); be watertight (every walkable cell enclosed — no gap open to the sea); and its bounding
  // box must MATCH length/width (so the drawn boat = the walkable grid, no drift). Each fails LOUD at boot.
  let grid;
  try {
    grid = parseDeck(s.deck);
  } catch (err) {
    return `deck failed to parse: ${(err as Error).message}`;
  }
  const helms = grid.cells.filter((c) => c.tile === 'helm').length;
  if (helms !== 1) return `deck must have exactly ONE helm ('H') tile (got ${helms})`;
  const gangplanks = grid.cells.filter((c) => c.tile === 'gangplank');
  if (gangplanks.length !== 1) return `deck must have exactly ONE gangplank ('G') tile — the board/leave door (got ${gangplanks.length})`;
  // the door must FACE OPEN SEA (an orthogonal off-grid neighbor): an interior gangplank would silently open a
  // hole mid-hull (hullBlocksOutside exempts it) and gangplankOutward would guess a direction — fail loud instead.
  const gp = gangplanks[0];
  const faceSea = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => tileAt(grid, gp.cx + dx, gp.cy + dy) === undefined);
  if (!faceSea) return `the gangplank at (col ${gp.cx}, row ${gp.cy}) must sit on the hull EDGE facing open sea (it's the door)`;
  const hullErr = deckHullError(grid);
  if (hullErr) return `deck hull not watertight: ${hullErr}`;
  const size = deckHullSize(grid);
  if (s.length !== size.length || s.width !== size.width) {
    return `length/width must match the deck grid — set length:${size.length}, width:${size.width} (got ${s.length}, ${s.width})`;
  }
  return null;
});

// DECK LAYOUTS — the whole GRID IS the hull: '#' rail cells are the gunwale/edge, '.' deck is the walkable
// interior, SPACES are off-hull (open sea) so the boat SHAPE is authored right here in the data — taper the bow
// (right, +x) to a point and round the stern (left) by leaving cells blank. Each cell = ONE WORLD TILE (32px), so
// the interior is genuinely walkable (step 3). 'H' helm aft, 'C' cannons on the broadsides. The drawn boat = the
// walkable grid exactly (no separate hull polygon), so what you see is what you can stand on.
// NOTE on authoring: '#' rail must ENCLOSE every '.'/'H'/'C'; spaces are open sea. Rows taper at both ends so the
// hull reads as a boat — the stern (left) is rounded, the bow (right) narrows to a point. Amidships is widest.
// Rectangular hulls: rail (#) rings a walkable (.) interior. Bow = the +x (right) end of each row. The RENDERER
// auto-shapes the rail (thin gunwale on outward edges, beveled corners) by reading each cell's neighbors — the
// data is just the plain grid. 'H' helm aft-left, 'C' cannons on the broadsides. Cell = 1 world tile (32px).
// 'G' = GANGPLANK: the ONE door in the rail where a world-space walker steps ON/OFF (boarding = walking across it).
// Placed on the STERN edge (left, −x) — the natural boarding point. Everywhere else the hull is solid from outside.
const SLOOP_DECK = [
  '######', // 6 cols (bow↔stern) × 4 rows (beam) → a 4×2 walkable interior
  '#H..C#',
  'GC...#', // gangplank on the aft port corner
  '######',
];
const CARAVEL_DECK = [
  '########', // 8 × 5
  '#H...C.#',
  'GC....C#', // gangplank aft-port
  '#....C.#',
  '########',
];
const GALLEON_DECK = [
  '###########', // 11 × 7
  '#H...C....#',
  '#C.......C#',
  'G....C....#', // gangplank amidships-port
  '#C.......C#',
  '#....C...C#',
  '###########',
];

// Hull length/width are DERIVED from the grid (cols×rows × DECK_TILE_PX) so the drawn boat and the walkable grid
// can never drift — a walkable ship is genuinely large next to a body (radius ~8). r (ocean-collision radius) ≈ the
// hull half-width. To resize a class, edit its deck grid (add/remove tiles); length/width follow. See deckHullSize.
ShipHulls.registerAll([
  // the starter boat — a humble Rowboat (id kept as ship.sloop to avoid churn; `name` is the display label)
  { id: 'ship.sloop', name: 'Rowboat', shipClass: 'sloop', hp: 220, maxSpeed: 150, accel: 70, reverseFrac: 0.25, turnBrake: 0.3, turnRate: 1.2, minTurnFrac: 0, r: 56, length: 192, width: 128, cannonSlots: 2, seats: 2, color: 0x8a5a2c, deck: SLOOP_DECK },
  { id: 'ship.caravel', name: 'Caravel', shipClass: 'caravel', hp: 430, maxSpeed: 200, accel: 80, reverseFrac: 0.2, turnBrake: 0.3, turnRate: 1.3, minTurnFrac: 0, r: 72, length: 256, width: 160, cannonSlots: 4, seats: 4, color: 0x7a4a22, deck: CARAVEL_DECK },
  { id: 'ship.galleon', name: 'Galleon', shipClass: 'galleon', hp: 820, maxSpeed: 165, accel: 55, reverseFrac: 0.15, turnBrake: 0.3, turnRate: 0.9, minTurnFrac: 0, r: 100, length: 352, width: 224, cannonSlots: 8, seats: 8, color: 0x6a3f1c, deck: GALLEON_DECK },
]);
