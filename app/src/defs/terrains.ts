import { SAND_MOVE_MULT, SHALLOW_MOVE_MULT } from '../config/constants';
import { Registry, type Def } from '../core/Registry';

/**
 * WORLD TERRAIN as content (replaces the `Tile` enum + the switch-y lookup functions). Each ground kind is a def
 * carrying its OWN behavior — passability, speed, water semantics, vision, and plain-data visuals — so a new
 * terrain (mud, snow, lava…) is ONE row here (+ optionally one bake row in draw/terrainBakes.ts), never an engine
 * edit. RimWorld's TerrainDef pattern, fitted to our canon; this family is also the intended PILOT for external-
 * data loading (ARCHITECTURE_SCALE §11 pillar 1) — the rows are already JSON-shaped.
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
  /** Stops a GROUNDED foot/swim body (walls, stone, trees). Water is NOT this — entering water just relabels the
   *  mover's mode to swim (movement-frames truthful-mode rule); blocking here is a physical wall. */
  blocksFoot: boolean;
  /** TALL — stops even an AIRBORNE jumper (building Wall/Door: there's a roof). blocksFoot && !blocksAir = a LOW
   *  WALL: jump over it, or land on top and perch (mover.onLedge). Implies blocksFoot (boot-validated). */
  blocksAir: boolean;
  /** A boat can travel this cell (deep/shallow water, dock). */
  boatPassable: boolean;
  /** Foot-speed multiplier on this ground (1 = normal; shallows wade at 0.5, sand trudges at 0.75). */
  speedMul: number;
  /** Water semantics: 'deep' relabels a grounded mover to swim + uses the swim pace + drains stamina/breath
   *  (SwimSystem); 'shallow' is wadable ground with the wade look (half-submerged render). Absent = dry land. */
  water?: 'deep' | 'shallow';
  /** A doorway: DoorSystem toggles the cell open/closed by proximity, and AI PLANS through it as passable
   *  (DoorSystem opens it on arrival) even while it physically blocks. */
  door?: boolean;
  /** AI planning only: land units never PLAN a route into this cell even though collision allows entering it
   *  (deep water — a foot brain has no swim logic; keeps enemies ashore without caging the player). */
  aiFootAvoid?: boolean;
  /** Blocks VISION (debug LOS overlay now; the future line-of-sight system) — building walls, not trees. */
  opaque?: boolean;
  /** Gets a baked leaf-crown overlay ABOVE the actor band (units walk under the leaves) — trees. */
  canopy?: boolean;
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
// physically incoherent (a roof with no wall); a door that doesn't block is just an open floor.
export const Terrains = new Registry<TerrainDef>('Terrains', (t) => {
  if (!Number.isInteger(t.ordinal) || t.ordinal < 0 || t.ordinal > 255) return `ordinal must be an integer 0–255 (got ${t.ordinal})`;
  if (t.blocksAir && !t.blocksFoot) return 'blocksAir implies blocksFoot (a roof needs a wall)';
  if (t.door && !t.blocksFoot) return 'a door must block while closed (blocksFoot)';
  if (!(t.speedMul > 0)) return `speedMul must be > 0 (got ${t.speedMul})`;
  if (t.water === 'deep' && !t.boatPassable) return 'deep water must be boatPassable (the sea is what boats sail)';
  return null;
});

/** Ordinal constants — the ONE authority binding name → grid value (each def row references these, so the table
 *  and the rows can't drift). WorldGen + tests stamp cells with them. Values keep the old Tile enum numbering so
 *  existing grids/tests carry over unchanged. */
export const TERRAIN = {
  water: 0,
  grass: 1,
  sand: 2,
  dock: 3,
  wall: 4,
  floor: 5,
  door: 6,
  shallowWater: 7,
  stoneWall: 8,
  tree: 9,
} as const;

Terrains.registerAll([
  // the open sea — swim it (mode relabel), sail it; AI foot brains plan around it; transparent on the minimap
  { id: 'terrain.water', name: 'Deep Water', ordinal: TERRAIN.water, blocksFoot: false, blocksAir: false, boatPassable: true, speedMul: 1, water: 'deep', aiFootAvoid: true, color: 0x16456b },
  // default ground — the (x+y) checker is the whole island's texture
  { id: 'terrain.grass', name: 'Grass', ordinal: TERRAIN.grass, blocksFoot: false, blocksAir: false, boatPassable: false, speedMul: 1, color: 0x4f8a45, checker: 0x4a8240, minimap: 0x3f7340 },
  // beach ring — heavier going than grass; the sandFoam bake paints the wet rim against water neighbors
  { id: 'terrain.sand', name: 'Sand', ordinal: TERRAIN.sand, blocksFoot: false, blocksAir: false, boatPassable: false, speedMul: SAND_MOVE_MULT, color: 0xd9bd82, minimap: 0xd9bd82, bake: 'sandFoam' },
  // the land↔sea handoff tile: walkable planking a boat can also float over — where you board
  { id: 'terrain.dock', name: 'Dock', ordinal: TERRAIN.dock, blocksFoot: false, blocksAir: false, boatPassable: true, speedMul: 1, color: 0xa9824e, minimap: 0xa9824e },
  // building wall — TALL (roofed): blocks even a jumper, and vision
  { id: 'terrain.wall', name: 'Wall', ordinal: TERRAIN.wall, blocksFoot: true, blocksAir: true, boatPassable: false, speedMul: 1, opaque: true, color: 0x5a4a30, minimap: 0x2e2618, bake: 'wall' },
  // building interior ground
  { id: 'terrain.floor', name: 'Floor', ordinal: TERRAIN.floor, blocksFoot: false, blocksAir: false, boatPassable: false, speedMul: 1, color: 0xb98a5a, minimap: 0x8a6a3a },
  // doorway — blocks while closed (tall, part of the building shell); DoorSystem opens it; AI plans through
  { id: 'terrain.door', name: 'Door', ordinal: TERRAIN.door, blocksFoot: true, blocksAir: true, boatPassable: false, speedMul: 1, door: true, color: 0xb98a5a, minimap: 0x8a6a3a, bake: 'door' },
  // coastal shallows — wadable (slow) on foot, sailable by boat, the depth band the swim/wade look keys on
  { id: 'terrain.shallowWater', name: 'Shallow Water', ordinal: TERRAIN.shallowWater, blocksFoot: false, blocksAir: false, boatPassable: true, speedMul: SHALLOW_MOVE_MULT, water: 'shallow', color: 0x2e7ea3 },
  // freestanding stone — a LOW wall: jump it or perch on it; no door mechanic
  { id: 'terrain.stoneWall', name: 'Stone Wall', ordinal: TERRAIN.stoneWall, blocksFoot: true, blocksAir: false, boatPassable: false, speedMul: 1, color: 0x8a8781, minimap: 0x6b6b6b, bake: 'stoneWall' },
  // tree trunk — a LOW blocker (vault the grove / perch); ground draws as grass, crown bakes above actors
  { id: 'terrain.tree', name: 'Tree', ordinal: TERRAIN.tree, blocksFoot: true, blocksAir: false, boatPassable: false, speedMul: 1, canopy: true, color: 0x4f8a45, checker: 0x4a8240, minimap: 0x2f5a2f, bake: 'tree' },
]);

/** Dense ordinal → def decode table (built once at load; `!` below is guaranteed by this loop + the uniqueness
 *  throw). The O(1) hot-path lookup every collision/speed/render read goes through. */
const byOrdinal: TerrainDef[] = [];
for (const d of Terrains.all()) {
  if (byOrdinal[d.ordinal]) throw new Error(`Terrains: duplicate ordinal ${d.ordinal} (${byOrdinal[d.ordinal]!.id} vs ${d.id})`);
  byOrdinal[d.ordinal] = d;
}

/** The terrain def a grid cell's stored ordinal decodes to. Out-of-range/unwritten ordinals cannot occur in a
 *  generated grid (cells are only stamped with TERRAIN constants); `!` is guaranteed by the boot table above. */
export function terrainByOrdinal(ordinal: number): TerrainDef {
  return byOrdinal[ordinal]!;
}
