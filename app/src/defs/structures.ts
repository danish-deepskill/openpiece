import { Registry, type ContentId, type Def, type Validator } from '../core/Registry';
import { parseRows, type RowReader } from '../core/rows';
import structureRows from '../../data/structures.json';

/**
 * BUILT THINGS as content — walls, doors, trees, stone… and later windmills, cannons, masts. Structures are
 * NOT terrain: they're ENTITIES (`structure` component + transform) occupying grid cells through a per-grid
 * occupancy index (world/StructureIndex.ts — RimWorld's EdificeGrid pattern), stacked ON TOP of the terrain
 * layer. That split is what buys multi-tile footprints (a 3×2 windmill), per-instance state (a door's open
 * flag, HP later), and destructibility (naval weak-points) — none of which a terrain ordinal can carry.
 *
 * The def carries the same physical vocabulary as TerrainDef (blocksFoot/blocksAir/opaque) so the collision
 * oracle composes the two layers with one rulebook; presentation is plain data (color/bake keys) with the
 * painters as strategy rows in draw/structureDraws.ts.
 */
export type ReRing = 'refuse' | 'clear' | 'reset';

/** One unit of a summoner's roster: who, and where relative to the structure's anchor cell (tiles). */
export interface SummonSpawn {
  unit: ContentId;
  dx: number;
  dy: number;
}

export interface StructureDef extends Def {
  name: string;
  /** Footprint in whole tiles, anchored at the spawn cell (top-left). Every covered cell is occupied —
   *  collision, pathfinding, and placement all read the full rectangle (a 3×2 windmill blocks 6 cells). */
  size: { w: number; h: number };
  /** Stops a GROUNDED body — foot and swim like TerrainDef.blocksFoot, plus boats (a built thing is never
   *  sailable; terrain gates boats on `boatPassable` instead). */
  blocksFoot: boolean;
  /** TALL — stops even an AIRBORNE jumper (a roofed wall). blocksFoot && !blocksAir = a LOW structure:
   *  jump over it, or land on top and perch (mover.onLedge). Implies blocksFoot (boot-validated). */
  blocksAir: boolean;
  /** Blocks VISION — building walls, not trees. A SEAM for the future line-of-sight system: no runtime
   *  consumer yet (the debug collision overlay shows BLOCKING, not vision; AI sight still rays pathability). */
  opaque?: boolean;
  /** An openable doorway: DoorSystem toggles the INSTANCE's `structure.open` by actor proximity, collision
   *  clears while open, and AI PLANS through it as passable even while it physically blocks (it opens on
   *  arrival — so pursuers follow you inside instead of being walled out). */
  door?: boolean;
  /** A CONTAINER: placing this structure attaches a `hold` of this many stack-slots to the entity (a chest, a
   *  stall, a warehouse) — reach into it by standing beside it (Items.reachableHold). Integer ≥ 1 when set. */
  holdSlots?: number;
  /** A SUMMONER (the duel gong): E beside it spawns this roster — each unit at a TILE offset from the structure's
   *  anchor, every one facing the others (two → face to face). The INSTANCE remembers who it summoned
   *  (`structure.summoned`) and refuses to ring again while any of them lives, so a set-piece fight is started when
   *  someone is there to watch it, and re-run once it's over. Non-empty when set. */
  summon?: SummonSpawn[];
  /** What a second use does while the roster still LIVES: 'refuse' (the default — the duel is still on), 'clear' (remove
   *  them: a training post — dummies never die on their own), 'reset' (remove them AND summon a fresh roster: the duel gong —
   *  ring again and the pair restarts from their marks). */
  reRing?: ReRing;
  /** The E-prompt for a summoner ("Ring the Gong", "Set up the dummies"). Omitted ⇒ "Use <name>". */
  summonLabel?: string;
  // ---- presentation (plain data; draw FUNCTIONS live in draw/structureDraws.ts keyed by `bake`/`overlay`) ----
  /** Base fill painted over every footprint cell before the bake detail; ABSENT = the terrain underneath
   *  shows through (a tree trunk stands on visible grass; a wall replaces its ground entirely). */
  color?: number;
  /** Minimap pixel color for the footprint; ABSENT = invisible on the minimap. */
  minimap?: number;
  /** Key into draw/structureDraws.ts for the baked visual (wall shading, door frame, trunk). Unknown key =
   *  throw at first bake (fail loud), mirroring the terrain-bake boot sweep. */
  bake?: string;
  /** Key into draw/structureDraws.ts for the ABOVE-ACTORS overlay (baked at Depth.Canopy — units pass UNDER
   *  it): a tree's leaf crown, a windmill's blades. Same fail-loud key sweep as `bake`. */
  overlay?: string;
}

// validated at boot: a fractional/zero footprint corrupts the occupancy stamp; an air-blocker that doesn't
// foot-block is physically incoherent (a roof with no wall); a door that doesn't block is just a gap.
/** The structure validator as a PURE function (the abilityProblem pattern): a problem string or null. Exported so a test
 *  can judge a bad row without registering it (the registry resolves lazily — a planted bad row poisons later lookups). */
export const structureProblem: Validator<StructureDef> = (s) => {
  if (!Number.isInteger(s.size.w) || !Number.isInteger(s.size.h) || s.size.w < 1 || s.size.h < 1) {
    return `size must be whole tiles ≥ 1×1 (got ${s.size.w}×${s.size.h})`;
  }
  if (s.blocksAir && !s.blocksFoot) return 'blocksAir implies blocksFoot (a roof needs a wall)';
  if (s.door && !s.blocksFoot) return 'a door must block while closed (blocksFoot)';
  if (s.holdSlots !== undefined && (!Number.isInteger(s.holdSlots) || s.holdSlots < 1)) return `holdSlots must be an integer ≥ 1 (got ${s.holdSlots})`;
  if (s.summon !== undefined && s.summon.length === 0) return 'summon must name at least one unit (omit it for a plain structure)'; // an empty roster rings for nobody
  if ((s.reRing !== undefined || s.summonLabel !== undefined) && s.summon === undefined) return 'reRing / summonLabel belong to a summoner (a `summon` roster)';
  return null;
};
export const Structures = new Registry<StructureDef>('Structures', structureProblem);

/** JSON row → StructureDef, shape-proven field by field (core/rows). Rows live EXTERNALLY in
 *  data/structures.json — the pillar-1 pilot's second family, chosen because it exercises a NESTED object
 *  field (size). Per-row rationale (JSON carries no comments): wall = TALL roofed shell, blocks vision ·
 *  door = blocks while closed, DoorSystem opens, AI plans through · stoneWall = LOW freestanding (jump or
 *  perch, see-through) · tree = LOW blocker on visible grass, crown overlaid above actors · windmill = the
 *  first MULTI-TILE structure (one entity, six occupied cells, blades overlaid above actors) · chest = a LOW
 *  1-tile CONTAINER (holdSlots — a `hold` is attached at placement; reach in from beside it) · waystone = a LOW 1-tile
 *  WARP stone: the INSTANCE carries its destination (`structure.warp`, set by worldgen); E beside it teleports you ·
 *  duelGong = a LOW 1-tile SUMMONER: its `summon` roster (Zoro west, the Ronin east of the arena's center) spawns on E ·
 *  trainingPost = the arena's other summoner: three dummies along the south row, cleared by a second use (reRing 'clear');
 *  the gong's second use RESETS the duel (reRing 'reset'). */
const parseStructure = (r: RowReader): StructureDef => {
  const size = r.obj('size');
  return {
    id: r.str('id'),
    name: r.str('name'),
    size: { w: size.num('w'), h: size.num('h') },
    blocksFoot: r.bool('blocksFoot'),
    blocksAir: r.bool('blocksAir'),
    opaque: r.optBool('opaque'),
    door: r.optBool('door'),
    holdSlots: r.optNum('holdSlots'),
    summon: r.optObjs('summon')?.map((u) => ({ unit: u.str('unit'), dx: u.num('dx'), dy: u.num('dy') })),
    reRing: r.optOneOf('reRing', ['refuse', 'clear', 'reset'] as const),
    summonLabel: r.optStr('summonLabel'),
    color: r.optColor('color'),
    minimap: r.optColor('minimap'),
    bake: r.optStr('bake'),
    overlay: r.optStr('overlay'),
  };
};

Structures.registerAll(parseRows('Structures', structureRows, parseStructure));
