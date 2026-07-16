import { Registry, type Def } from '../core/Registry';
import { parseRows, type RowReader } from '../core/rows';
import terrainRows from '../../data/terrains.json';

/**
 * WORLD TERRAIN as content (replaces the `Tile` enum + the switch-y lookup functions). Each ground kind is a def
 * carrying its OWN behavior — passability, speed, water semantics, and plain-data visuals — so a new terrain
 * (mud, snow, lava…) is ONE row here (+ optionally one bake row in draw/terrainBakes.ts), never an engine edit.
 * Terrain is the GROUND layer only: built things (walls/doors/trees) are STRUCTURE entities (defs/structures.ts)
 * on the grid's occupancy layer. RimWorld's TerrainDef pattern, fitted to our canon; this family IS the
 * external-data PILOT (ARCHITECTURE_SCALE §11 pillar 1): rows load from data/terrains.json through the
 * core/rows shape-check — editing a terrain is a DATA-file edit, and a malformed row refuses to boot.
 *
 * STORAGE: the grid stores each def's `ordinal` — a compact small integer — NOT the def object or id string.
 * Deliberate divergence from RimWorld (object-ref arrays): our future is chunked typed arrays (Uint8Array) +
 * JSON saves, where small ints win on memory, cache, and serialization. `terrainByOrdinal` is the O(1) dense
 * decode; systems compare def FIELDS (`water === 'deep'`), never ids — content-is-data, no identity branches.
 */
export interface TerrainDef extends Def {
  name: string;
  /** Grid storage value (0–255, unique — boot-validated): what `TileGrid.tiles` holds. Uint8Array-ready. */
  ordinal: number;
  /** Stops a GROUNDED foot/swim body. No current row blocks (walls/trees moved to the structure layer) but the
   *  vocabulary stays TERRAIN's too — cliffs/mountains are ground, not built things. Water is NOT this —
   *  entering water just relabels the mover's mode to swim (movement-frames truthful-mode rule). */
  blocksFoot: boolean;
  /** TALL — stops even an AIRBORNE jumper. blocksFoot && !blocksAir = a LOW blocker: jump over it, or land on
   *  top and perch (mover.onLedge). Implies blocksFoot (boot-validated). */
  blocksAir: boolean;
  /** A boat can travel this cell (deep/shallow water, dock). */
  boatPassable: boolean;
  /** Foot-speed multiplier on this ground (1 = normal; shallows wade at 0.5, sand trudges at 0.75). */
  speedMul: number;
  /** Water semantics: 'deep' relabels a grounded mover to swim + uses the swim pace + drains stamina/breath
   *  (SwimSystem); 'shallow' is wadable ground with the wade look (half-submerged render). Absent = dry land. */
  water?: 'deep' | 'shallow';
  /** AI planning only: land units never PLAN a route into this cell even though collision allows entering it
   *  (deep water — a foot brain has no swim logic; keeps enemies ashore without caging the player). */
  aiFootAvoid?: boolean;
  // ---- presentation (plain data; draw FUNCTIONS live in draw/terrainBakes.ts keyed by `bake`) ----
  /** Base fill color; with `checker` present, alternates on (x+y) parity (the grass checkerboard). */
  color: number;
  checker?: number;
  /** Minimap pixel color; ABSENT = transparent on the minimap (the sea, so the HUD panel shows through). */
  minimap?: number;
  /** Key into draw/terrainBakes.ts for baked per-tile detail (wall dimension, door frame, trunk, sand foam).
   *  Unknown key = throw at first bake (fail loud), mirroring the accessory proc-draw sweep. */
  bake?: string;
}

// validated at boot: a bad ordinal corrupts the grid silently; an air-blocker that doesn't foot-block is
// physically incoherent (a roof with no wall).
export const Terrains = new Registry<TerrainDef>('Terrains', (t) => {
  if (!Number.isInteger(t.ordinal) || t.ordinal < 0 || t.ordinal > 255) return `ordinal must be an integer 0–255 (got ${t.ordinal})`;
  if (t.blocksAir && !t.blocksFoot) return 'blocksAir implies blocksFoot (a roof needs a wall)';
  if (!(t.speedMul > 0)) return `speedMul must be > 0 (got ${t.speedMul})`;
  if (t.water === 'deep' && !t.boatPassable) return 'deep water must be boatPassable (the sea is what boats sail)';
  return null;
});

/** Ordinal constants — the ONE authority binding name → grid value for CODE (WorldGen + tests stamp cells
 *  with these). The rows now live externally (data/terrains.json), so this table CAN drift from the data —
 *  the boot assertion under `byOrdinal` below closes that: every TERRAIN entry must decode to a loaded row,
 *  or the game refuses to start. Values keep the old Tile enum numbering so existing grids/tests carry over
 *  unchanged; 4/6/8/9 (wall/door/stoneWall/tree) retired to defs/structures.ts — built things are ENTITIES
 *  on the structure layer now, and the retired slots stay unassigned so an old grid can never silently
 *  decode to the wrong ground. */
export const TERRAIN = {
  water: 0,
  grass: 1,
  sand: 2,
  dock: 3,
  floor: 5,
  shallowWater: 7,
} as const;

/** JSON row → TerrainDef, shape-proven field by field (core/rows). The rows live EXTERNALLY in
 *  data/terrains.json — the pillar-1 pilot: content edits are data-file edits, no recompile of meaning.
 *  Per-row rationale (JSON carries no comments): water = the open sea (swim/sail, AI avoids on foot,
 *  minimap-transparent) · grass = default ground with the (x+y) checker · sand = the beach ring, heavier
 *  going + the sandFoam wet rim · dock = the land↔sea handoff planking boats float over · floor = building
 *  interior ground · shallowWater = the wadable/sailable depth band the wade look keys on. */
const parseTerrain = (r: RowReader): TerrainDef => ({
  id: r.str('id'),
  name: r.str('name'),
  ordinal: r.num('ordinal'),
  blocksFoot: r.bool('blocksFoot'),
  blocksAir: r.bool('blocksAir'),
  boatPassable: r.bool('boatPassable'),
  speedMul: r.num('speedMul'),
  water: r.optOneOf('water', ['deep', 'shallow'] as const),
  aiFootAvoid: r.optBool('aiFootAvoid'),
  color: r.color('color'),
  checker: r.optColor('checker'),
  minimap: r.optColor('minimap'),
  bake: r.optStr('bake'),
});

Terrains.registerAll(parseRows('Terrains', terrainRows, parseTerrain));

/** Dense ordinal → def decode table (built once at load; `!` below is guaranteed by this loop + the uniqueness
 *  throw). The O(1) hot-path lookup every collision/speed/render read goes through. */
const byOrdinal: TerrainDef[] = [];
for (const d of Terrains.all()) {
  if (byOrdinal[d.ordinal]) throw new Error(`Terrains: duplicate ordinal ${d.ordinal} (${byOrdinal[d.ordinal]!.id} vs ${d.id})`);
  byOrdinal[d.ordinal] = d;
}
// the code↔data binding, asserted at boot: every ordinal CODE stamps (the TERRAIN table) must have a row in
// data/terrains.json — a deleted/renumbered JSON row would otherwise surface as an undefined-def crash on
// the first tile of a generated island, far from the actual mistake
for (const [name, ord] of Object.entries(TERRAIN)) {
  if (!byOrdinal[ord]) throw new Error(`Terrains: TERRAIN.${name} (ordinal ${ord}) has no row in data/terrains.json`);
}

/** The terrain def a grid cell's stored ordinal decodes to. Out-of-range/unwritten ordinals cannot occur in a
 *  generated grid (cells are only stamped with TERRAIN constants); `!` is guaranteed by the boot table above. */
export function terrainByOrdinal(ordinal: number): TerrainDef {
  return byOrdinal[ordinal]!;
}
