import { ARENA, ENEMY, HOME, TILE, type IsleShape } from '../config/constants';
import { Structures } from '../defs/structures';
import { TERRAIN } from '../defs/terrains';
import type { Rng } from '../core/Rng';
import type { ItemRef } from '../defs/items';
import { TileGrid } from './TileGrid';

export interface EnemySpawn { x: number; y: number; boss: boolean; unit: string }

export interface PickupSpawn { item: ItemRef; x: number; y: number; /** pile count (materials); absent = a single thing */ n?: number }

/** WHAT to build at WHICH anchor cell — plain data, like EnemySpawn. Worldgen stays a pure function of the
 *  seed; the scene turns each record into a structure ENTITY (placeStructure) at world start. */
export interface StructureSpawn {
  def: string;
  tx: number;
  ty: number;
  /** Pre-stocked contents for a CONTAINER structure (a chest's starting stash) — stowed at spawn through the Items
   *  service, so worldgen never writes a hold by hand. */
  stash?: { item: ItemRef; n: number }[];
  /** A WAYSTONE's destination (world px): where the warp verb puts the actor — the paired stone's arrival tile. */
  warp?: { x: number; y: number };
}

export interface LevelLayout {
  grid: TileGrid;
  playerSpawn: { x: number; y: number };
  boatSpawn: { x: number; y: number };
  /** The sailing fleet berthed at the home NORTH dock (hull id + world px) — placement is worldgen's job
   *  (it knows the shore geometry); the scene just instantiates rows. */
  fleet: { hull: string; x: number; y: number }[];
  pickups: PickupSpawn[];
  structures: StructureSpawn[];
  enemies: EnemySpawn[];
}

/** Generation-time structure emitter shared by the stamp passes: records what to build (pure data) plus a
 *  cell-occupancy scratch, so a later pass can never stack a second structure on a claimed cell (the index's
 *  place() would throw at spawn — this keeps generation legal by construction). */
interface GenCtx {
  grid: TileGrid;
  occupied(tx: number, ty: number): boolean;
  build(def: string, tx: number, ty: number, stash?: StructureSpawn['stash'], warp?: StructureSpawn['warp']): void;
}

const px = (tx: number) => tx * TILE;

/** Isles are stamped slightly WIDER than tall (the y axis squashed by this) so a round radius reads as a natural
 *  landmass on a landscape screen, not a coin. One number for every isle, or their coasts would differ in character. */
const ISLE_SQUASH = 1.05;
/** Distance from a shape's center in ITS metric: Euclidean for a round outline, Chebyshev (the larger axis gap — a box)
 *  for a square one. The ONE metric islands, their floors and their wall rings share, so a square isle gets a square ring. */
const shapeDist = (dx: number, dy: number, shape: IsleShape = 'round'): number => (shape === 'square' ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.hypot(dx, dy));
const isleDist = (x: number, y: number, isle: { cx: number; cy: number; shape?: IsleShape }): number =>
  shapeDist(x - isle.cx, (y - isle.cy) * (isle.shape === 'square' ? 1 : ISLE_SQUASH), isle.shape); // the squash is the ellipse's; a box is a box

/** Enemy-isle fodder mix: F- / F / F+ variants (Brutes wield a cutlass). WHO spawns is level data, not scene code. */
const FODDER = ['unit.thug', 'unit.bandit', 'unit.brute'];

type Pt = { tx: number; ty: number };

/**
 * Enemy-isle stone perimeter — a defensive ring the assault must funnel through (one gap faces due west,
 * toward the player's dock approach). Placement knobs, tune freely:
 *  - `radius`    tiles from the island center (sits just inside the beach at 10 on a r=13 isle)
 *  - `thickness` band half-width in tiles (≈1.2 gives a connected ~2-tile wall; below ~1 leaves diagonal holes)
 *  - `gaps`      number of openings, evenly spaced (0 = sealed — DON'T: the reachability test will fail)
 *  - `gapWidth`  tiles of opening per gap (the funnel width the AI pours through)
 */
interface WallRingCfg {
  radius: number;
  thickness: number;
  gaps: number;
  gapWidth: number;
  /** Direction (rad) of gap 0; the rest space evenly from it. Default π = due west (the dock approach). */
  gapAngle?: number;
  /** The ring's outline (shapeDist): round (default) or a square box of half-side `radius`. */
  shape?: IsleShape;
}
const WALL_RING: WallRingCfg = { radius: 10, thickness: 1.2, gaps: 3, gapWidth: 2 };
/** The ARENA's ring — one opening, facing NORTH toward its dock, so the fight inside has exactly one way out. Takes the
 *  isle's shape (a square colosseum on a square isle): half-side 6. thickness 0.5 = exactly ONE tile of wall — a square
 *  ring's Chebyshev distances are whole numbers, so the band |d − 6| < 0.5 is the single loop d = 6 and stays closed (the
 *  round ring needs 1.2 for its diagonals; here that made a three-tile wall and ate the floor). Clear floor: ±5.5 → 11×11. */
const ARENA_RING: WallRingCfg = { radius: 6, thickness: 0.5, gaps: 1, gapWidth: 3, gapAngle: -Math.PI / 2, shape: ARENA.shape };

/**
 * Enemy-isle interior division — radial SPOKE walls from the hub out to the perimeter ring, splitting the
 * inside into `slices` equal wedges (the "pizza"). Each spoke carries ONE doorway gap so units still cross
 * between wedges; the spokes sit HALFWAY between the ring's gaps (offset ½ a wedge) so every perimeter
 * entrance opens into the MIDDLE of a slice, not onto a spoke. Knobs:
 *  - `slices`   wedge count (3 = the requested pizza; also the spoke count)
 *  - `inner`    tiles from center the spokes START (a small open hub around the captain, unwalled)
 *  - `halfW`    spoke half-width in tiles (matches the ring's `thickness` for a connected 2-tile wall)
 *  - `gapAt`    fraction along the spoke (inner→ring) where its crossing doorway sits
 *  - `gapWidth` tiles of opening at that doorway
 */
const WALL_SPOKES = { slices: 3, inner: 2, halfW: 1.2, gapAt: 0.55, gapWidth: 2 } as const;

/**
 * Tree groves (blocking cover) scattered on each island. A tree blocks ONLY its trunk tile; the leaf crown
 * overhangs ~1 tile all round (drawn above actors — StructureRenderer's canopy pass). Knobs:
 *  - `home`/`enemy` grove COUNT per island
 *  - `spread`      grove radius in tiles trunks scatter within
 *  - `perGrove`    target trunks per grove (fewer land when a spot can't satisfy spacing/clearance)
 *  - `spacing`     min trunk-to-trunk distance in tiles; 3 = 2 clear walkable tiles between trunks, so
 *                  crowns read as separate trees and units weave between them (below 3 canopies fuse)
 *  - `clear`       min tiles a trunk keeps from docks/doors/spawns (and, on the enemy isle, the wall band)
 */
const GROVES = { home: 3, enemy: 4, spread: 3.4, perGrove: 4, spacing: 3, clear: 3 } as const;

const inBounds = (grid: TileGrid, tx: number, ty: number): boolean =>
  tx >= 0 && ty >= 0 && tx < grid.w && ty < grid.h;

/** Stone ring around (cx,cy) with evenly-spaced gaps; only builds on unclaimed `floor` terrain (grass by default,
 *  the arena's sand), so it never carves beach, dock, or buildings. Gap 0 faces `cfg.gapAngle` (default due west,
 *  angle π — the player's natural landing approach). */
function stampWallRing(gen: GenCtx, cx: number, cy: number, cfg: WallRingCfg, floor: number = TERRAIN.grass): void {
  const gapHalf = cfg.gaps > 0 ? cfg.gapWidth / (2 * cfg.radius) : 0; // gap arc half-width (radians)
  const gap0 = cfg.gapAngle ?? Math.PI;
  for (let ty = 0; ty < gen.grid.h; ty++) {
    for (let tx = 0; tx < gen.grid.w; tx++) {
      if (gen.grid.tiles[ty][tx] !== floor || gen.occupied(tx, ty)) continue;
      const d = shapeDist(tx - cx, ty - cy, cfg.shape);
      if (Math.abs(d - cfg.radius) >= cfg.thickness) continue; // outside the wall band
      if (gapHalf > 0) {
        const a = Math.atan2(ty - cy, tx - cx);
        let inGap = false;
        for (let k = 0; k < cfg.gaps; k++) {
          const gk = gap0 + (k * 2 * Math.PI) / cfg.gaps; // gap 0 at gapAngle, rest evenly spaced
          const da = Math.abs(Math.atan2(Math.sin(a - gk), Math.cos(a - gk))); // wrapped angular distance
          if (da < gapHalf) { inGap = true; break; }
        }
        if (inGap) continue;
      }
      gen.build('structure.stoneWall', tx, ty);
    }
  }
}

/** Radial spoke walls dividing the ring's interior into `slices` wedges (the pizza). Each spoke runs from
 *  `inner` out to the ring radius along one angle, with a doorway gap partway along so wedges connect.
 *  Unclaimed-grass-only (never doubles the ring's cells or carves its gaps), so the perimeter stays as authored. */
function stampWallSpokes(gen: GenCtx, cx: number, cy: number, ring: WallRingCfg, cfg: typeof WALL_SPOKES): void {
  const angles: number[] = [];
  for (let k = 0; k < cfg.slices; k++) {
    // offset half a wedge off gap 0 (due west) so a spoke bisects the wall BETWEEN two entrances
    angles.push(Math.PI + Math.PI / cfg.slices + (k * 2 * Math.PI) / cfg.slices);
  }
  const gapStart = cfg.inner + (ring.radius - cfg.inner) * cfg.gapAt; // radial start of the crossing doorway
  const gapEnd = gapStart + cfg.gapWidth;
  for (let ty = 0; ty < gen.grid.h; ty++) {
    for (let tx = 0; tx < gen.grid.w; tx++) {
      if (gen.grid.tiles[ty][tx] !== TERRAIN.grass || gen.occupied(tx, ty)) continue;
      const dx = tx - cx;
      const dy = ty - cy;
      const d = Math.hypot(dx, dy);
      if (d < cfg.inner || d > ring.radius) continue; // stay between the open hub and the ring
      const a = Math.atan2(dy, dx);
      for (const sa of angles) {
        const da = Math.abs(Math.atan2(Math.sin(a - sa), Math.cos(a - sa))); // wrapped angular offset from the spoke line
        if (da * d >= cfg.halfW) continue; // perpendicular distance to the spoke line = da·d; outside the band
        if (d >= gapStart && d <= gapEnd) break; // the crossing doorway — leave it open
        gen.build('structure.stoneWall', tx, ty);
        break;
      }
    }
  }
}

/** Scatter tree groves on grass around (cx,cy): individually-placed trunks with a minimum spacing (held
 *  across ALL of the island's groves, so neighbouring groves can't fuse either), avoiding `protect` tiles
 *  (docks/doors/spawns) and — when `ringR` is given (enemy isle) — the wall band, so chokepoints stay open. */
function scatterGroves(
  gen: GenCtx, rng: Rng, cx: number, cy: number, islandR: number,
  count: number, cfg: typeof GROVES, protect: readonly Pt[], ringR?: number,
): void {
  const clear2 = cfg.clear * cfg.clear;
  const space2 = cfg.spacing * cfg.spacing;
  const trunks: Pt[] = []; // every trunk planted on THIS island — the spacing reference set
  const near = (tx: number, ty: number): boolean =>
    protect.some((p) => (p.tx - tx) ** 2 + (p.ty - ty) ** 2 < clear2) ||
    (ringR !== undefined && Math.abs(Math.hypot(tx - cx, ty - cy) - ringR) < cfg.clear);
  const plantable = (tx: number, ty: number): boolean =>
    inBounds(gen.grid, tx, ty) && gen.grid.tiles[ty][tx] === TERRAIN.grass && !gen.occupied(tx, ty) && !near(tx, ty);
  const spaced = (tx: number, ty: number): boolean =>
    trunks.every((p) => (p.tx - tx) ** 2 + (p.ty - ty) ** 2 >= space2);
  for (let i = 0; i < count; i++) {
    let ctx = 0;
    let cty = 0;
    let found = false;
    for (let tries = 0; tries < 24 && !found; tries++) {
      const a = rng.range(0, Math.PI * 2);
      const rr = rng.range(0, islandR - 2);
      ctx = Math.round(cx + Math.cos(a) * rr);
      cty = Math.round(cy + Math.sin(a) * rr);
      if (plantable(ctx, cty)) found = true;
    }
    if (!found) continue; // no clear spot for this grove this seed — skip it (no forced overlap)
    let planted = 0;
    for (let tries = 0; tries < cfg.perGrove * 8 && planted < cfg.perGrove; tries++) {
      const a = rng.range(0, Math.PI * 2);
      const rr = rng.range(0, cfg.spread);
      const tx = Math.round(ctx + Math.cos(a) * rr);
      const ty = Math.round(cty + Math.sin(a) * rr);
      if (!plantable(tx, ty) || !spaced(tx, ty)) continue;
      gen.build('structure.tree', tx, ty);
      trunks.push({ tx, ty });
      planted++;
    }
  }
}

/** Procedurally builds the two-island map and every spawn placement (all in pixels).
 *  Takes the seeded `worldgen` stream — the whole level is a pure function of the seed. */
export function generateLevel(rng: Rng): LevelLayout {
  const grid = new TileGrid();

  for (let y = 0; y < grid.h; y++) {
    const row: number[] = [];
    for (let x = 0; x < grid.w; x++) {
      let t: number = TERRAIN.water;
      const dh = isleDist(x, y, HOME);
      const de = isleDist(x, y, ENEMY);
      if (dh < HOME.r + 2 || de < ENEMY.r + 2) t = TERRAIN.shallowWater; // coastal shallows: a wadable ring off the beach
      if (dh < HOME.r) t = dh < HOME.r - 2 ? TERRAIN.grass : TERRAIN.sand; // …overridden by the island itself (sand/grass)
      if (de < ENEMY.r) t = de < ENEMY.r - 2 ? TERRAIN.grass : TERRAIN.sand;
      const da = isleDist(x, y, ARENA);
      if (da < ARENA.r + 2) t = TERRAIN.shallowWater;
      if (da < ARENA.r) t = TERRAIN.sand; // the DESERT isle: sand…
      if (shapeDist(x - ARENA.cx, y - ARENA.cy, ARENA_RING.shape) < ARENA_RING.radius - ARENA_RING.thickness) t = TERRAIN.grass; // …except the arena FLOOR inside the wall: grass (sand slows the very fight the ring exists for). The ring's own metric, unsquashed.
      row.push(t);
    }
    grid.tiles.push(row);
  }

  // docks: home reaches east, enemy reaches west (tiles recorded so groves keep clear of the landings)
  const dockTiles: Pt[] = [];
  for (let x = HOME.cx + 10; x <= HOME.cx + 16 && x < grid.w; x++) {
    grid.tiles[HOME.cy][x] = TERRAIN.dock;
    dockTiles.push({ tx: x, ty: HOME.cy });
    if (grid.tiles[HOME.cy + 1]) grid.tiles[HOME.cy + 1][x] = TERRAIN.dock;
  }
  for (let x = ENEMY.cx - 16; x <= ENEMY.cx - 10; x++) {
    if (x < 0) continue;
    grid.tiles[ENEMY.cy][x] = TERRAIN.dock;
    dockTiles.push({ tx: x, ty: ENEMY.cy });
    if (grid.tiles[ENEMY.cy + 1]) grid.tiles[ENEMY.cy + 1][x] = TERRAIN.dock;
  }
  // NORTH dock (home): a 2-wide ribbon from the north beach (row ~15, walk-on) out past the shallows into
  // deep water (tip row 9) — the FLEET berth: the SLOOP anchors off its end (the wind-reading rig; the
  // rowboat at the east dock is oars and can't demo points of sail). Recorded in dockTiles so groves keep
  // clear, same as the east landings.
  for (let y = HOME.cy - 18; y <= HOME.cy - 12; y++) {
    if (y < 0) continue;
    grid.tiles[y][HOME.cx] = TERRAIN.dock;
    dockTiles.push({ tx: HOME.cx, ty: y });
    grid.tiles[y][HOME.cx + 1] = TERRAIN.dock;
  }

  // ARENA dock: a 2-wide north ribbon from inside the beach out past the shallows — the only landing on the
  // desert isle, straight at the ring's one gap. Recorded so nothing else claims it.
  for (let y = ARENA.cy - ARENA.r - 5; y <= ARENA.cy - ARENA.r + 1; y++) {
    grid.tiles[y][ARENA.cx] = TERRAIN.dock;
    grid.tiles[y][ARENA.cx + 1] = TERRAIN.dock;
    dockTiles.push({ tx: ARENA.cx, ty: y });
  }

  // structure records + a generation-time occupancy scratch (one claim per cell — see GenCtx)
  const structures: StructureSpawn[] = [];
  const occ = new Set<number>();
  const gen: GenCtx = {
    grid,
    occupied: (tx, ty) => occ.has(ty * grid.w + tx),
    build: (def, tx, ty, stash, warp) => {
      const rec: StructureSpawn = { def, tx, ty };
      if (stash) rec.stash = stash;
      if (warp) rec.warp = warp;
      structures.push(rec);
      // claim the FULL footprint, not just the anchor — a later pass probing any cell of a 3×2 windmill
      // must see it as taken (the anchor-only version under-claimed multi-tile defs)
      const { w, h } = Structures.get(def).size;
      for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) occ.add(y * grid.w + x);
    },
  };

  // home village buildings — floor terrain under the WHOLE rect (walls STAND on floor), wall structure
  // entities on the perimeter, one openable door structure mid-bottom. Structures are what collision +
  // pathfinding read (through the grid's StructureIndex), so the layout stays one source of truth.
  const doorCells: Pt[] = [];
  // buildings carry NO floating text label — the structure reads for itself (more natural than "House"/"Tavern" tags)
  const stampHouse = (tx: number, ty: number, tw: number, th: number) => {
    const doorX = tx + Math.floor(tw / 2); // doorway in the bottom wall (openable — see DoorSystem)
    const doorY = ty + th - 1;
    for (let y = ty; y < ty + th; y++) {
      for (let x = tx; x < tx + tw; x++) {
        if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) continue;
        grid.tiles[y][x] = TERRAIN.floor;
        const edge = x === tx || x === tx + tw - 1 || y === ty || y === ty + th - 1;
        if (!edge) continue;
        const door = x === doorX && y === doorY;
        gen.build(door ? 'structure.door' : 'structure.wall', x, y);
        if (door) doorCells.push({ tx: x, ty: y });
      }
    }
  };
  const houses = [
    { tx: HOME.cx - 7, ty: HOME.cy - 6, tw: 5, th: 4 },
    { tx: HOME.cx - 2, ty: HOME.cy - 9, tw: 5, th: 4 },
    { tx: HOME.cx - 9, ty: HOME.cy + 1, tw: 5, th: 4 },
    { tx: HOME.cx, ty: HOME.cy + 4, tw: 6, th: 4 }, // the tavern (biggest) — recognizable by size + interior
  ];
  for (const h of houses) stampHouse(h.tx, h.ty, h.tw, h.th);
  // the STOREHOUSE (house 1, otherwise empty): a chest in its top-left interior corner, clear of the door lane,
  // pre-stocked with timber + powder — the first CONTAINER to reach into (stand beside it, open the bag).
  gen.build('structure.chest', houses[1]!.tx + 1, houses[1]!.ty + 1, [
    { item: { cat: 'material', id: 'material.plank' }, n: 10 },
    { item: { cat: 'material', id: 'material.powder' }, n: 8 },
  ]);
  // WAYSTONES — a linked pair: one by the home spawn, one just inside the arena's ring. E beside either teleports you
  // to the tile SOUTH of the other (so you never arrive inside the stone). A dev-speed convenience today; the seed of
  // fast travel later. Each record carries the OTHER's arrival point — the def knows nothing of pairs.
  const homeStone = { tx: HOME.cx - 5, ty: HOME.cy - 1 }; // open grass two tiles east of the spawn, clear of houses 0 and 2
  const arenaStone = { tx: ARENA.cx + 2, ty: ARENA.cy - 2 };
  const arrival = (p: { tx: number; ty: number }) => ({ x: (p.tx + 0.5) * TILE, y: (p.ty + 1.5) * TILE });
  gen.build('structure.waystone', homeStone.tx, homeStone.ty, undefined, arrival(arenaStone));
  gen.build('structure.waystone', arenaStone.tx, arenaStone.ty, undefined, arrival(homeStone));
  // the DUEL GONG — just inside the ring's north gap, where you enter (and two tiles from the waystone's arrival): E rings
  // it and its roster (structures.json: Zoro west, the Ronin east, four tiles off the center) spawns facing each other.
  // The duel starts when someone is there to watch, and can be re-run once it's over (verb.summon).
  gen.build('structure.duelGong', ARENA.cx, ARENA.cy - 3);
  // the TRAINING POST — west of the gong: E sets three dummies along the ring's south row, E again clears them. Nothing
  // stands in the ring at world-gen, so the duel the gong starts has the floor to itself (the dummies were getting cut
  // into, and they'd shove the duelists around).
  gen.build('structure.trainingPost', ARENA.cx - 4, ARENA.cy - 3);
  // the village windmill — ONE entity, SIX cells (3×2): the multi-tile structure the entity layer exists for.
  // NE of the village on open grass, clear of every house/spawn; blocks foot AND air (a roofed landmark you
  // route around, not over), blade sweep baked above actors. Placement knob: the anchor cell below.
  gen.build('structure.windmill', HOME.cx + 4, HOME.cy - 8);
  // interior-center pixel of a house — where stashed loot sits (walk in through the door, press E)
  const inside = (h: (typeof houses)[number]) => ({ x: px(h.tx) + px(h.tw) / 2, y: px(h.ty) + px(h.th) / 2 });

  // loot stashed inside the village houses (walk in + E to take). The straw hat shares the cutlass house —
  // the hero now spawns bare-headed (defs/units unit.hero), so the hat is FOUND, not worn from birth.
  const cutlassHouse = inside(houses[0]);
  const pickups: PickupSpawn[] = [
    { item: { cat: 'weapon', id: 'weapon.cutlass' }, ...cutlassHouse },
    { item: { cat: 'weapon', id: 'weapon.dagger' }, x: cutlassHouse.x, y: cutlassHouse.y - 22 }, // the light blade, above the cutlass
    { item: { cat: 'weapon', id: 'weapon.sword' }, x: cutlassHouse.x - 22, y: cutlassHouse.y }, // the 2H combo blade, left of the cutlass
    { item: { cat: 'weapon', id: 'weapon.musket' }, x: cutlassHouse.x, y: cutlassHouse.y + 22 }, // the first RANGED weapon (#19) — travelling shot; below the cutlass
    { item: { cat: 'accessory', id: 'accessory.strawHat' }, x: cutlassHouse.x + 22, y: cutlassHouse.y }, // beside the cutlass
    // two 20-piles of powder flanking the musket: taking both MERGES into one stack of 40 — ITEMS.md slice 1's
    // acceptance ("pick up 30 powder → one stack"), visible in play on the bag readout; a plank bundle above
    { item: { cat: 'material', id: 'material.powder' }, n: 20, x: cutlassHouse.x - 22, y: cutlassHouse.y + 22 },
    { item: { cat: 'material', id: 'material.powder' }, n: 20, x: cutlassHouse.x + 22, y: cutlassHouse.y + 22 },
    { item: { cat: 'material', id: 'material.plank' }, n: 10, x: cutlassHouse.x - 22, y: cutlassHouse.y - 22 },
    { item: { cat: 'fruit', id: 'fruit.gomu' }, ...inside(houses[2]) },
    { item: { cat: 'manual', id: 'manual.geppo' }, x: inside(houses[2]).x + 24, y: inside(houses[2]).y }, // the Geppo book, beside the Gomu fruit — Read (E) to learn the hover
  ];

  // enemy-isle stone ring (the assault funnels through its gaps) — placed on the enemy island's grass
  stampWallRing(gen, ENEMY.cx, ENEMY.cy, WALL_RING);
  // …then divide the interior into 3 wedges (the pizza): radial spokes from the hub to the ring, each with a
  // crossing doorway. Stamped AFTER the ring so a spoke meeting the ring just thickens the join, never a gap.
  stampWallSpokes(gen, ENEMY.cx, ENEMY.cy, WALL_RING, WALL_SPOKES);
  // the ARENA ring on the desert isle: one gap, north, facing the dock — a duel inside has no sea to run to
  stampWallRing(gen, ARENA.cx, ARENA.cy, ARENA_RING, TERRAIN.sand);

  // fodder scattered inside the ring; reject any roll that lands on a solid cell in EITHER layer (terrain or
  // a built structure), so no enemy spawns embedded in stone. Falls back to the island center after the budget.
  const solidPx = (x: number, y: number): boolean =>
    !TileGrid.walkable(grid.tileAtPx(x, y), 'foot') || gen.occupied(Math.floor(x / TILE), Math.floor(y / TILE));
  const enemies: EnemySpawn[] = [];
  for (let i = 0; i < 7; i++) {
    let x = px(ENEMY.cx);
    let y = px(ENEMY.cy);
    for (let tries = 0; tries < 20; tries++) {
      const a = rng.range(0, Math.PI * 2);
      const rr = rng.range(2, 9) * TILE;
      const sx = px(ENEMY.cx) + Math.cos(a) * rr;
      const sy = px(ENEMY.cy) + Math.sin(a) * rr;
      if (!solidPx(sx, sy)) { x = sx; y = sy; break; }
    }
    enemies.push({ x, y, boss: false, unit: rng.pick(FODDER) });
  }
  // the Brawler — the island's boss (a bare-fisted aggressor), at the hub where the three wedges meet
  enemies.push({ x: px(ENEMY.cx), y: px(ENEMY.cy), boss: true, unit: 'unit.brawler' });
  // the MARINE OFFICER — the ranged musketeer test unit (docs #19), posted on the HOME island's SOUTH side (near
  // where the player spawns), placed deterministically so it always appears; nudged inward if it lands on a house/
  // stone tile. East of the tavern (HOME.cx, cy+4) so it doesn't spawn inside it. Replaces the guard-master
  // Soldier here — the first foe you meet near spawn now KITES and shoots (a dodgeable ball).
  {
    const sx = px(HOME.cx + 4);
    let sy = px(HOME.cy + 8); // south, inside the r=13 isle
    for (let d = 8; d >= 4 && solidPx(sx, sy); d--) { sy = px(HOME.cy + d); }
    enemies.push({ x: sx, y: sy, boss: false, unit: 'unit.marineOfficer' });
    // the SAMURAI — his duel partner, five tiles WEST (in his 260px sight), nudged back east if that lands on a
    // house/stone. pirates vs marine: they engage each other on sight; both leave the watching player alone.
    let kx = sx - px(5);
    for (let d = 5; d >= 2 && solidPx(kx, sy); d--) kx = sx - px(d); // nudge east until the tile is clear
    if (solidPx(kx, sy)) throw new Error('WorldGen: no clear tile for the samurai west of the officer'); // a layout bug, not a spawn-in-a-wall
    enemies.push({ x: kx, y: sy, boss: false, unit: 'unit.samurai' });
  }
  // the arena's DUELISTS (the Ronin, Zoro) and its DUMMIES are NOT placed here — the duel gong and the training post summon
  // them (verb.summon), so the fight starts when you are there to watch it, on an empty floor.
  // the NE DUEL SPOT — normally LUFFY (a hostile D-tier rubber brawler: Gomu fruit + straw hat, the
  // ai.luffy rush/charge duel target), posted at the TOP-RIGHT of the HOME island (the old Brute's spot),
  // clear of the NW house cluster and the east dock. Placed deterministically, nudged toward the hub if the
  // NE corner lands on stone/a house.
  // TEST (developer request 2026-07): spawn a plain Bandit here instead — a simple dagger rusher, e.g. to
  // watch the new plank-chase without Gomu rockets in the mix. Flip back to 'unit.luffy' when done.
  {
    let bx = px(HOME.cx + 7);
    let by = px(HOME.cy - 7); // north-east, inside the r=13 isle (~10 tiles from center)
    for (let d = 7; d >= 4 && solidPx(bx, by); d--) { bx = px(HOME.cx + d); by = px(HOME.cy - d); }
    enemies.push({ x: bx, y: by, boss: false, unit: 'unit.bandit' });
  }

  // tree groves — placed LAST so they can dodge every spawn/dock/door and the wall band (kept off the ring
  // so gaps stay open). Only grass is overwritten; the reachability test guards against a grove sealing a path.
  const spawnTiles: Pt[] = enemies.map((e) => ({ tx: Math.floor(e.x / TILE), ty: Math.floor(e.y / TILE) }));
  const protect: Pt[] = [
    ...dockTiles,
    ...doorCells,
    ...spawnTiles,
    { tx: HOME.cx - 7, ty: HOME.cy }, // player spawn
    { tx: HOME.cx - 5, ty: HOME.cy }, // the home waystone's arrival tile
    { tx: HOME.cx + 18, ty: HOME.cy }, // boat spawn (out in open water — the walkable hull is big; keep it off the beach)
    { tx: ENEMY.cx, ty: ENEMY.cy }, // captain
  ];
  scatterGroves(gen, rng, HOME.cx, HOME.cy, HOME.r, GROVES.home, GROVES, protect);
  scatterGroves(gen, rng, ENEMY.cx, ENEMY.cy, ENEMY.r, GROVES.enemy, GROVES, protect, WALL_RING.radius);

  return {
    grid,
    playerSpawn: { x: px(HOME.cx - 7), y: px(HOME.cy) }, // west side of the island (near the loot houses)
    boatSpawn: { x: px(HOME.cx + 18), y: px(HOME.cy) }, // out past the dock/shallows in deep water — the walkable sloop is large (r≈56), so keep its whole hull clear of the beach or it runs aground and can't sail
    // the north-dock fleet: the anchor keeps ≥ the hull's r (sloop 72px) clear of the dock ribbon, the
    // shallow ring (ends ~row 13 at this column), and the map edge — grounded = can't sail
    fleet: [
      { hull: 'ship.sloop', x: px(HOME.cx - 4), y: px(HOME.cy - 19) }, // west of the dock tip
    ],
    pickups,
    structures,
    enemies,
  };
}
