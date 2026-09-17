import { WIND_REF } from '../config/constants';
import { Registry, type Def } from '../core/Registry';
import { deckHullError, deckHullSize, parseDeck, tileAt } from './decks';

/**
 * Ship hull templates (data-driven, like every other content family). A ship is a composite entity: a hull
 * gives base stats + slots; parts/cannons (deferred) will layer on as components/modifiers, and naval combat
 * reuses the shared attribute/ability engine. New classes = new registry entries.
 */
export interface ShipHullDef extends Def {
  name: string;
  shipClass: 'rowboat' | 'sloop' | 'caravel';
  /** PROPULSION KIND — the rig as data: 'sail' reads the wind (curve × apparent-strength terms); 'oars' is
   *  wind-INDEPENDENT (flat human power — the starter boat stays tutorial-friendly as data) and is the only
   *  kind that meaningfully backs (reverseFrac). Franky-tech engines later = one more kind, one more row. */
  rig: 'oars' | 'sail';
  hp: number; // hull health
  maxSpeed: number; // px/s forward
  accel: number; // px/s^2 sail response — LOW on purpose: sails catching wind, not a motorboat
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
  /** POINTS OF SAIL (SAILING.md piece #2): speed multiplier by angle-off-wind, evenly spaced buckets from
   *  0° (bow dead UPWIND) to 180° (dead downwind), linearly interpolated between (sailCurveAt). Leading
   *  zeros ARE the no-go zone (sails luff, thrust ≈ 0 — enter it slow and you're "in irons"). This ONE
   *  table is what makes rigs mechanically distinct: square rig = wide no-go + monstrous broad reach;
   *  fore-and-aft = points close to the wind; OARS = a flat curve of 1s (wind-independent — the starter
   *  boat stays tutorial-friendly as DATA, not a special case). Validator: values 0..1 and the best point
   *  of sail must BE 1, so maxSpeed keeps meaning "speed at the best angle, full sails". */
  sailCurve: number[];
  /** Momentum drift (SAILING.md piece #4): the rate/s the velocity VECTOR eases toward the heading (exp
   *  form). High = the hull grips the water and follows the bow (a rowboat); low = 200 tons of oak carried
   *  sideways through the turn (a galleon carves wide, gets caught abeam mid-turn). Consumed by the
   *  sail-state ShipSystem rework; inert until then. */
  driftEase: number;
  /** How fast the hull ANSWERS the helm (rate/s the yaw eases toward the rudder, exp form): high = the
   *  wheel is the bow (a rowboat); low = the helm goes over and 200 tons take a beat to start swinging —
   *  and keep swinging after you center (counter-steer to settle, the shipwright's answer to "car steering"). */
  helmEase: number;
  /** Seconds a FULL hoist (furled → full) takes to read — more canvas, more time: a lugsail flicks up, a
   *  galleon's plan takes several. Presentation eases the drawn sail at this pace today; when crew lands,
   *  hoisting becomes a JOB and this field becomes its solo-crew duration (crew size then divides it). */
  hoistT: number;
  /** The drawn sail SILHOUETTE family (the visual.kind pattern — mechanics live on sailCurve, this only
   *  picks the draw case): 'foreAft' = a boom pivoting aft of the mast, swung to leeward (trim ≈ half the
   *  off-wind angle); 'square' = a yard across the mast that braces toward the wind, canvas bellying
   *  downwind. Per-hull today; becomes per-MAST when masts move into the deck grid (SAILING.md step 5). */
  sailKind: 'foreAft' | 'square';
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
  /** HOLD capacity in STACKS (ITEMS.md §3): rowboat 6 · sloop 24 · caravel 60 — provisioning pressure is hull
   *  data. Reached by STANDING ON the deck's hatch tile ('T' in `deck`, exactly one — boot-validated), the way the
   *  wheel is the helm tile: the cargo is the hull's, the access is a place on deck (Items.reachableHold). */
  holdSlots: number;
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
// (exported standalone so tests can probe rejection rules without planting a poison row in the singleton)
export const validateHull = (s: ShipHullDef): string | null => {
  if (!(s.hp > 0)) return `hp must be > 0 (got ${s.hp})`;
  if (!(s.maxSpeed > 0)) return `maxSpeed must be > 0 (got ${s.maxSpeed})`;
  if (!(s.accel > 0)) return `accel must be > 0 — a hull that can't thrust can't sail (got ${s.accel})`;
  if (s.reverseFrac < 0 || s.reverseFrac > 1) return `reverseFrac must be in [0, 1] (got ${s.reverseFrac})`;
  if (s.minTurnFrac < 0 || s.minTurnFrac > 1) return `minTurnFrac must be in [0, 1] (got ${s.minTurnFrac})`;
  if (!(s.turnRate > 0)) return `turnRate must be > 0 (got ${s.turnRate})`;
  if (!(s.turnBrake >= 0)) return `turnBrake must be ≥ 0 (got ${s.turnBrake})`;
  if (!(s.r > 0)) return `r must be > 0 (got ${s.r})`;
  // the sail curve is the rig's physics — malformed data here is "my ship won't move" at sea, so fail at boot:
  // ≥ 2 buckets (0° and 180° at minimum), every value 0..1, and the BEST angle must be exactly 1 (otherwise
  // maxSpeed silently means nothing — a curve topping out at 0.8 is a hidden 20% nerf nobody can see in data)
  if (!Array.isArray(s.sailCurve) || s.sailCurve.length < 2) return `sailCurve needs ≥ 2 angle buckets (got ${JSON.stringify(s.sailCurve)})`;
  if (s.sailCurve.some((v) => !(v >= 0 && v <= 1))) return `sailCurve values must be in [0, 1] (got ${JSON.stringify(s.sailCurve)})`;
  // rig gates real behavior (wind terms, backing) — and hull rows go external-JSON eventually, so the union
  // must hold at BOOT, not just in the TS source
  if (s.rig !== 'oars' && s.rig !== 'sail') return `rig must be 'oars' | 'sail' (got ${JSON.stringify(s.rig)})`;
  if (s.rig === 'sail' && s.reverseFrac !== 0) return `a 'sail' rig cannot back — set reverseFrac 0 (got ${s.reverseFrac}); backing is the oars' escape hatch`;
  // the ZERO-WIND trap: the apparent-wind term reads |wind − shipVel|, so in a dead calm (Calm Belt, strength
  // 0) a moving hull still feels its own bow-wind. That decays to a stop ONLY while maxSpeed < WIND_REF —
  // at or above it the feedback self-sustains and the hull motors through a calm on nothing. Data trap, so it
  // crashes at boot, not 40 hours in when someone authors a racing sloop.
  if (s.rig === 'sail' && s.maxSpeed >= WIND_REF) return `a 'sail' hull's maxSpeed must stay below WIND_REF ${WIND_REF} or it self-sustains in zero wind (got ${s.maxSpeed})`;
  if (Math.max(...s.sailCurve) !== 1) return `sailCurve's best point of sail must be exactly 1 — maxSpeed IS the speed there (got max ${Math.max(...s.sailCurve)})`;
  if (!(s.driftEase > 0)) return `driftEase must be > 0 — a hull whose velocity never follows its heading can't sail (got ${s.driftEase})`;
  if (!(s.helmEase > 0)) return `helmEase must be > 0 — a hull that never answers its helm can't steer (got ${s.helmEase})`;
  if (!(s.hoistT > 0)) return `hoistT must be > 0 s — canvas that hoists in zero time snaps (got ${s.hoistT})`;
  if (s.sailKind !== 'foreAft' && s.sailKind !== 'square') return `sailKind must be 'foreAft' | 'square' (got ${JSON.stringify(s.sailKind)})`;
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
  // a hull WITH a hold needs exactly one hatch to reach it from (no hatch = cargo nobody can touch; two = an
  // ambiguous "the" hatch for the stow job); a holdless hull must not draw a trapdoor to nothing
  const hatches = grid.cells.filter((c) => c.tile === 'hatch').length;
  if (s.holdSlots > 0 && hatches !== 1) return `a hull with holdSlots needs exactly ONE hatch ('T') tile (got ${hatches})`;
  if (s.holdSlots <= 0 && hatches > 0) return `a hatch ('T') tile on a hull with no holdSlots leads nowhere`;
  // a sail rig with no mast tile would silently draw NO canvas — the "my sails are invisible" bug as a data
  // slip, so it fails at boot (oars may go mastless: a pure rowboat is legal)
  if (s.rig === 'sail' && !grid.cells.some((c) => c.tile === 'mast')) return `a 'sail' rig needs at least one mast ('M') tile in the deck grid`;
  const gangplanks = grid.cells.filter((c) => c.tile === 'gangplank');
  if (gangplanks.length < 1) return `deck needs at least one gangplank ('G') tile — the board/leave door`;
  // EVERY door must FACE OPEN SEA (an orthogonal off-grid neighbor): an interior gangplank would silently
  // open a hole mid-hull (hullBlocksOutside exempts it) and gangplankOutward would guess a direction — fail
  // loud instead. Plural doors are legal (the sloop boards from either broadside), each checked alone.
  for (const gp of gangplanks) {
    const faceSea = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => tileAt(grid, gp.cx + dx, gp.cy + dy) === undefined);
    if (!faceSea) return `the gangplank at (col ${gp.cx}, row ${gp.cy}) must sit on the hull EDGE facing open sea (it's a door)`;
  }
  const hullErr = deckHullError(grid);
  if (hullErr) return `deck hull not watertight: ${hullErr}`;
  const size = deckHullSize(grid);
  if (s.length !== size.length || s.width !== size.width) {
    return `length/width must match the deck grid — set length:${size.length}, width:${size.width} (got ${s.length}, ${s.width})`;
  }
  return null;
};

export const ShipHulls = new Registry<ShipHullDef>('ShipHulls', validateHull);

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
// 'M' = MAST: where the rig hangs — drawShipRig draws one sail PER mast cell, so mast count and placement
// are deck DATA (the customization architecture): the caravel carries two, a future galleon three, and the
// ship-building palette just places 'M' parts. Walkable for now (becoming a solid post = step-5 remainder).
const ROWBOAT_DECK = [
  '######', // 6 cols (bow↔stern) × 4 rows (beam) → a 4×2 walkable interior
  '#H.MC#',
  'GC.T.#', // gangplank on the aft port corner; the hold HATCH ('T') amidships — stand on it to reach the cargo
  '######',
];
// sloop: an actual BOAT silhouette, not a barge — bow/stern shoulders pull in a tile (spaces = open sea;
// 9×5 bounding box → length/width 288×160). TWO gangplanks (the developer's authoring): one on EACH
// broadside rail, so she boards from whichever side you dock — every door gets its own lane + outward.
const SLOOP_DECK = [
  ' ##G#### ',
  '#...C..##',
  '#.H...M.#', // helm on the CENTERLINE aft (the wheel commands the deck, not a rail); mast forward of the wheel
  '#..TC..##', // the hold hatch aft of the starboard gun
  ' ##G#### ',
];
const CARAVEL_DECK = [
  '###########', // 11 × 7
  '#H...C....#',
  '#C.......C#',
  'G..M.C.M..#', // gangplank amidships-port; TWO masts on the centerline — the first multi-master, purely deck data
  '#C...T...C#', // the hold hatch on the centerline, between the guns
  '#....C...C#',
  '###########',
];

// Hull length/width are DERIVED from the grid (cols×rows × DECK_TILE_PX) so the drawn boat and the walkable grid
// can never drift — a walkable ship is genuinely large next to a body (radius ~8). r (ocean-collision radius) ≈ the
// hull half-width. To resize a class, edit its deck grid (add/remove tiles); length/width follow. See deckHullSize.
// SAIL CURVES (7 buckets = every 30° off the wind, 0°=dead upwind … 180°=dead downwind; interpolated):
// the rig differences ARE these tables (SAILING.md) — oars flat (wind-independent), fore-and-aft points
// close (narrow no-go, best on a beam reach), square rig wide no-go but monstrous on a broad reach.
const OARS_FLAT = [1, 1, 1, 1, 1, 1, 1];
const FORE_AND_AFT = [0, 0.4, 0.8, 1, 0.95, 0.85, 0.75];
const SQUARE_RIG = [0, 0, 0.35, 0.8, 1, 1, 0.9];

ShipHulls.registerAll([
  // SPEEDS ride the 2026-07 ×0.8 world re-tempo (with the walkers): maxSpeed AND accel scaled together so
  // time-to-speed is unchanged; WIND_REF scaled with them so every sailing RATIO (dead-run self-limit,
  // zero-wind decay, apparent freshening) is bit-identical in feel. turnRate deliberately NOT scaled — the
  // hand-tuned yaw feel (deg/s) survives; turning circles tighten ~20% in px as the price.
  // the starter boat — a humble Rowboat (the 2026-07 re-scale gave it its honest id, ending the ship.sloop squat);
  // oars: flat curve, high driftEase (a light hull grips the water), and the ONLY rig that truly backs
  { id: 'ship.rowboat', name: 'Rowboat', shipClass: 'rowboat', rig: 'oars', hp: 220, maxSpeed: 120, accel: 56, reverseFrac: 0.25, turnBrake: 0.3, turnRate: 1.2, minTurnFrac: 0, sailCurve: OARS_FLAT, driftEase: 3.5, helmEase: 6, hoistT: 0.6, sailKind: 'foreAft', r: 56, length: 192, width: 128, cannonSlots: 2, seats: 2, holdSlots: 6, color: 0x8a5a2c, deck: ROWBOAT_DECK },
  // sail rigs: reverseFrac 0 (sails can't back) — the in-irons escape is BARE STEERAGE (minTurnFrac 0.15,
  // the EDGE_CASES softlock-ladder re-proof) + falling off the wind until the curve pulls again
  { id: 'ship.sloop', name: 'Sloop', shipClass: 'sloop', rig: 'sail', hp: 430, maxSpeed: 160, accel: 64, reverseFrac: 0, turnBrake: 0.3, turnRate: 0.6, minTurnFrac: 0.15, sailCurve: FORE_AND_AFT, driftEase: 2.2, helmEase: 3, hoistT: 1.6, sailKind: 'foreAft', r: 72, length: 288, width: 160, cannonSlots: 4, seats: 4, holdSlots: 24, color: 0x7a4a22, deck: SLOOP_DECK },
  // the heavy flagship (the re-scale's Caravel — a real one dwarfed a sloop; the Galleon class returns later,
  // bigger still): LOW driftEase — it carves wide arcs and gets caught sideways mid-turn (the feel goal)
  { id: 'ship.caravel', name: 'Caravel', shipClass: 'caravel', rig: 'sail', hp: 820, maxSpeed: 132, accel: 44, reverseFrac: 0, turnBrake: 0.3, turnRate: 0.35, minTurnFrac: 0.15, sailCurve: SQUARE_RIG, driftEase: 1.2, helmEase: 1.6, hoistT: 3.2, sailKind: 'square', r: 100, length: 352, width: 224, cannonSlots: 8, seats: 8, holdSlots: 60, color: 0x6a3f1c, deck: CARAVEL_DECK },
]);

/** Sample a hull's points-of-sail curve at an angle-off-wind (rad; 0 = bow dead INTO the wind's source).
 *  Any input range is folded to [0, π] — port and starboard tacks read the same bucket (curves are
 *  symmetric by construction), then linear interpolation between the evenly spaced buckets. */
export function sailCurveAt(def: ShipHullDef, angleOffWind: number): number {
  let a = angleOffWind % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  a = Math.abs(a);
  const step = Math.PI / (def.sailCurve.length - 1);
  const i = Math.min(def.sailCurve.length - 2, Math.floor(a / step));
  const t = a / step - i;
  return def.sailCurve[i] + (def.sailCurve[i + 1] - def.sailCurve[i]) * t;
}
