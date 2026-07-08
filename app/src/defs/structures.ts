import { Registry, type Def } from '../core/Registry';

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
  /** Gets a baked leaf-crown overlay ABOVE the actor band (units walk under the leaves) — trees. */
  canopy?: boolean;
  // ---- presentation (plain data; draw FUNCTIONS live in draw/structureDraws.ts keyed by `bake`) ----
  /** Base fill painted over every footprint cell before the bake detail; ABSENT = the terrain underneath
   *  shows through (a tree trunk stands on visible grass; a wall replaces its ground entirely). */
  color?: number;
  /** Minimap pixel color for the footprint; ABSENT = invisible on the minimap. */
  minimap?: number;
  /** Key into draw/structureDraws.ts for the baked visual (wall shading, door frame, trunk). Unknown key =
   *  throw at first bake (fail loud), mirroring the terrain-bake boot sweep. */
  bake?: string;
}

// validated at boot: a fractional/zero footprint corrupts the occupancy stamp; an air-blocker that doesn't
// foot-block is physically incoherent (a roof with no wall); a door that doesn't block is just a gap.
export const Structures = new Registry<StructureDef>('Structures', (s) => {
  if (!Number.isInteger(s.size.w) || !Number.isInteger(s.size.h) || s.size.w < 1 || s.size.h < 1) {
    return `size must be whole tiles ≥ 1×1 (got ${s.size.w}×${s.size.h})`;
  }
  if (s.blocksAir && !s.blocksFoot) return 'blocksAir implies blocksFoot (a roof needs a wall)';
  if (s.door && !s.blocksFoot) return 'a door must block while closed (blocksFoot)';
  return null;
});

Structures.registerAll([
  // building wall — TALL (roofed): blocks even a jumper, and vision; replaces its ground visually
  { id: 'structure.wall', name: 'Wall', size: { w: 1, h: 1 }, blocksFoot: true, blocksAir: true, opaque: true, color: 0x5a4a30, minimap: 0x2e2618, bake: 'wall' },
  // doorway — blocks while closed (tall, part of the building shell); DoorSystem opens it; AI plans through
  { id: 'structure.door', name: 'Door', size: { w: 1, h: 1 }, blocksFoot: true, blocksAir: true, door: true, color: 0xb98a5a, minimap: 0x8a6a3a, bake: 'door' },
  // freestanding stone — a LOW wall: jump it or perch on it; no door mechanic, see-through (waist height)
  { id: 'structure.stoneWall', name: 'Stone Wall', size: { w: 1, h: 1 }, blocksFoot: true, blocksAir: false, color: 0x8a8781, minimap: 0x6b6b6b, bake: 'stoneWall' },
  // tree — a LOW blocker (vault the grove / perch); no base color (the trunk stands on visible grass),
  // crown baked above actors via `canopy`
  { id: 'structure.tree', name: 'Tree', size: { w: 1, h: 1 }, blocksFoot: true, blocksAir: false, canopy: true, minimap: 0x2f5a2f, bake: 'tree' },
]);
