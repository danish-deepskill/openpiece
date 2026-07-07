import { ENEMY, HOME, TILE } from '../config/constants';
import { TERRAIN } from '../defs/terrains';
import type { Rng } from '../core/Rng';
import type { ItemRef } from '../defs/items';
import { TileGrid } from './TileGrid';

export interface EnemySpawn { x: number; y: number; boss: boolean; unit: string }

export interface PickupSpawn { item: ItemRef; x: number; y: number }

export interface LevelLayout {
  grid: TileGrid;
  playerSpawn: { x: number; y: number };
  boatSpawn: { x: number; y: number };
  pickups: PickupSpawn[];
  doors: { tx: number; ty: number }[];
  enemies: EnemySpawn[];
}

const px = (tx: number) => tx * TILE;

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
const WALL_RING = { radius: 10, thickness: 1.2, gaps: 3, gapWidth: 2 } as const;

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
 * overhangs ~1 tile all round (drawn above actors — TerrainRenderer's canopy pass). Knobs:
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

/** Stone ring around (cx,cy) with evenly-spaced gaps; only overwrites Grass, so it never carves beach,
 *  dock, or buildings. Gap 0 faces due west (angle π) — the player's natural landing approach. */
function stampWallRing(grid: TileGrid, cx: number, cy: number, cfg: typeof WALL_RING): void {
  const gapHalf = cfg.gaps > 0 ? cfg.gapWidth / (2 * cfg.radius) : 0; // gap arc half-width (radians)
  for (let ty = 0; ty < grid.h; ty++) {
    for (let tx = 0; tx < grid.w; tx++) {
      if (grid.tiles[ty][tx] !== TERRAIN.grass) continue;
      const d = Math.hypot(tx - cx, ty - cy);
      if (Math.abs(d - cfg.radius) >= cfg.thickness) continue; // outside the wall band
      if (gapHalf > 0) {
        const a = Math.atan2(ty - cy, tx - cx);
        let inGap = false;
        for (let k = 0; k < cfg.gaps; k++) {
          const gk = Math.PI + (k * 2 * Math.PI) / cfg.gaps; // gap 0 due west, rest evenly spaced
          const da = Math.abs(Math.atan2(Math.sin(a - gk), Math.cos(a - gk))); // wrapped angular distance
          if (da < gapHalf) { inGap = true; break; }
        }
        if (inGap) continue;
      }
      grid.tiles[ty][tx] = TERRAIN.stoneWall;
    }
  }
}

/** Radial spoke walls dividing the ring's interior into `slices` wedges (the pizza). Each spoke runs from
 *  `inner` out to the ring radius along one angle, with a doorway gap partway along so wedges connect.
 *  Grass-only (never carves the ring's own gaps or any structure), so the perimeter stays as authored. */
function stampWallSpokes(grid: TileGrid, cx: number, cy: number, ring: typeof WALL_RING, cfg: typeof WALL_SPOKES): void {
  const angles: number[] = [];
  for (let k = 0; k < cfg.slices; k++) {
    // offset half a wedge off gap 0 (due west) so a spoke bisects the wall BETWEEN two entrances
    angles.push(Math.PI + Math.PI / cfg.slices + (k * 2 * Math.PI) / cfg.slices);
  }
  const gapStart = cfg.inner + (ring.radius - cfg.inner) * cfg.gapAt; // radial start of the crossing doorway
  const gapEnd = gapStart + cfg.gapWidth;
  for (let ty = 0; ty < grid.h; ty++) {
    for (let tx = 0; tx < grid.w; tx++) {
      if (grid.tiles[ty][tx] !== TERRAIN.grass) continue;
      const dx = tx - cx;
      const dy = ty - cy;
      const d = Math.hypot(dx, dy);
      if (d < cfg.inner || d > ring.radius) continue; // stay between the open hub and the ring
      const a = Math.atan2(dy, dx);
      for (const sa of angles) {
        const da = Math.abs(Math.atan2(Math.sin(a - sa), Math.cos(a - sa))); // wrapped angular offset from the spoke line
        if (da * d >= cfg.halfW) continue; // perpendicular distance to the spoke line = da·d; outside the band
        if (d >= gapStart && d <= gapEnd) break; // the crossing doorway — leave it open
        grid.tiles[ty][tx] = TERRAIN.stoneWall;
        break;
      }
    }
  }
}

/** Scatter tree groves on grass around (cx,cy): individually-placed trunks with a minimum spacing (held
 *  across ALL of the island's groves, so neighbouring groves can't fuse either), avoiding `protect` tiles
 *  (docks/doors/spawns) and — when `ringR` is given (enemy isle) — the wall band, so chokepoints stay open. */
function scatterGroves(
  grid: TileGrid, rng: Rng, cx: number, cy: number, islandR: number,
  count: number, cfg: typeof GROVES, protect: readonly Pt[], ringR?: number,
): void {
  const clear2 = cfg.clear * cfg.clear;
  const space2 = cfg.spacing * cfg.spacing;
  const trunks: Pt[] = []; // every trunk planted on THIS island — the spacing reference set
  const near = (tx: number, ty: number): boolean =>
    protect.some((p) => (p.tx - tx) ** 2 + (p.ty - ty) ** 2 < clear2) ||
    (ringR !== undefined && Math.abs(Math.hypot(tx - cx, ty - cy) - ringR) < cfg.clear);
  const plantable = (tx: number, ty: number): boolean =>
    inBounds(grid, tx, ty) && grid.tiles[ty][tx] === TERRAIN.grass && !near(tx, ty);
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
      grid.tiles[ty][tx] = TERRAIN.tree;
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
      const dh = Math.hypot(x - HOME.cx, (y - HOME.cy) * 1.05);
      const de = Math.hypot(x - ENEMY.cx, (y - ENEMY.cy) * 1.05);
      if (dh < HOME.r + 2 || de < ENEMY.r + 2) t = TERRAIN.shallowWater; // coastal shallows: a wadable ring off the beach
      if (dh < HOME.r) t = dh < HOME.r - 2 ? TERRAIN.grass : TERRAIN.sand; // …overridden by the island itself (sand/grass)
      if (de < ENEMY.r) t = de < ENEMY.r - 2 ? TERRAIN.grass : TERRAIN.sand;
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

  // home village buildings — stamped as hollow wall blocks (Wall perimeter, Floor interior, 1-tile door).
  // Real grid obstacles so collision + pathfinding share one source of truth.
  const doors: { tx: number; ty: number }[] = [];
  // buildings carry NO floating text label — the structure reads for itself (more natural than "House"/"Tavern" tags)
  const stampHouse = (tx: number, ty: number, tw: number, th: number) => {
    for (let y = ty; y < ty + th; y++) {
      for (let x = tx; x < tx + tw; x++) {
        if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) continue;
        const edge = x === tx || x === tx + tw - 1 || y === ty || y === ty + th - 1;
        grid.tiles[y][x] = edge ? TERRAIN.wall : TERRAIN.floor;
      }
    }
    const doorX = tx + Math.floor(tw / 2); // doorway in the bottom wall (openable — see DoorSystem)
    const doorY = ty + th - 1;
    if (grid.tiles[doorY]) {
      grid.tiles[doorY][doorX] = TERRAIN.door;
      doors.push({ tx: doorX, ty: doorY });
    }
  };
  const houses = [
    { tx: HOME.cx - 7, ty: HOME.cy - 6, tw: 5, th: 4 },
    { tx: HOME.cx - 2, ty: HOME.cy - 9, tw: 5, th: 4 },
    { tx: HOME.cx - 9, ty: HOME.cy + 1, tw: 5, th: 4 },
    { tx: HOME.cx, ty: HOME.cy + 4, tw: 6, th: 4 }, // the tavern (biggest) — recognizable by size + interior
  ];
  for (const h of houses) stampHouse(h.tx, h.ty, h.tw, h.th);
  // interior-center pixel of a house — where stashed loot sits (walk in through the door, press E)
  const inside = (h: (typeof houses)[number]) => ({ x: px(h.tx) + px(h.tw) / 2, y: px(h.ty) + px(h.th) / 2 });

  // loot stashed inside the village houses (walk in + E to take). The straw hat shares the cutlass house —
  // the hero now spawns bare-headed (defs/units unit.hero), so the hat is FOUND, not worn from birth.
  const cutlassHouse = inside(houses[0]);
  const pickups: PickupSpawn[] = [
    { item: { cat: 'weapon', id: 'weapon.cutlass' }, ...cutlassHouse },
    { item: { cat: 'weapon', id: 'weapon.dagger' }, x: cutlassHouse.x, y: cutlassHouse.y - 22 }, // the light blade, above the cutlass
    { item: { cat: 'weapon', id: 'weapon.sword' }, x: cutlassHouse.x - 22, y: cutlassHouse.y }, // the 2H combo blade, left of the cutlass
    { item: { cat: 'accessory', id: 'accessory.strawHat' }, x: cutlassHouse.x + 22, y: cutlassHouse.y }, // beside the cutlass
    { item: { cat: 'fruit', id: 'fruit.gomu' }, ...inside(houses[2]) },
    { item: { cat: 'manual', id: 'manual.geppo' }, x: inside(houses[2]).x + 24, y: inside(houses[2]).y }, // the Geppo book, beside the Gomu fruit — Read (E) to learn the hover
  ];

  // enemy-isle stone ring (the assault funnels through its gaps) — placed on the enemy island's grass
  stampWallRing(grid, ENEMY.cx, ENEMY.cy, WALL_RING);
  // …then divide the interior into 3 wedges (the pizza): radial spokes from the hub to the ring, each with a
  // crossing doorway. Stamped AFTER the ring so a spoke meeting the ring just thickens the join, never a gap.
  stampWallSpokes(grid, ENEMY.cx, ENEMY.cy, WALL_RING, WALL_SPOKES);

  // fodder scattered inside the ring; reject any roll that lands on a solid tile (the wall band), so no
  // enemy spawns embedded in stone. Falls back to the always-clear island center after the retry budget.
  const solidPx = (x: number, y: number): boolean => !TileGrid.walkable(grid.tileAtPx(x, y), 'foot');
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
  // the Soldier — the guard-master test unit — posted on the HOME island's SOUTH side (near where the player
  // spawns), placed deterministically so it always appears; nudged inward if it lands on a house/stone tile.
  // East of the tavern (HOME.cx, cy+4) so it doesn't spawn inside it.
  {
    const sx = px(HOME.cx + 4);
    let sy = px(HOME.cy + 8); // south, inside the r=13 isle
    for (let d = 8; d >= 4 && solidPx(sx, sy); d--) { sy = px(HOME.cy + d); }
    enemies.push({ x: sx, y: sy, boss: false, unit: 'unit.soldier' });
  }
  // LUFFY — a hostile D-tier rubber brawler (Gomu fruit + straw hat), posted at the TOP-RIGHT (NE) of the HOME
  // island (the old Brute's spot), clear of the NW house cluster and the east dock; a duel target to feel the
  // ai.luffy rush/charge + fruit-ability rotation. Placed deterministically, nudged toward the hub if the NE
  // corner lands on stone/a house.
  {
    let bx = px(HOME.cx + 7);
    let by = px(HOME.cy - 7); // north-east, inside the r=13 isle (~10 tiles from center)
    for (let d = 7; d >= 4 && solidPx(bx, by); d--) { bx = px(HOME.cx + d); by = px(HOME.cy - d); }
    enemies.push({ x: bx, y: by, boss: false, unit: 'unit.luffy' });
  }

  // tree groves — placed LAST so they can dodge every spawn/dock/door and the wall band (kept off the ring
  // so gaps stay open). Only grass is overwritten; the reachability test guards against a grove sealing a path.
  const spawnTiles: Pt[] = enemies.map((e) => ({ tx: Math.floor(e.x / TILE), ty: Math.floor(e.y / TILE) }));
  const protect: Pt[] = [
    ...dockTiles,
    ...doors,
    ...spawnTiles,
    { tx: HOME.cx - 7, ty: HOME.cy }, // player spawn
    { tx: HOME.cx + 18, ty: HOME.cy }, // boat spawn (out in open water — the walkable hull is big; keep it off the beach)
    { tx: ENEMY.cx, ty: ENEMY.cy }, // captain
  ];
  scatterGroves(grid, rng, HOME.cx, HOME.cy, HOME.r, GROVES.home, GROVES, protect);
  scatterGroves(grid, rng, ENEMY.cx, ENEMY.cy, ENEMY.r, GROVES.enemy, GROVES, protect, WALL_RING.radius);

  return {
    grid,
    playerSpawn: { x: px(HOME.cx - 7), y: px(HOME.cy) }, // west side of the island (near the loot houses)
    boatSpawn: { x: px(HOME.cx + 18), y: px(HOME.cy) }, // out past the dock/shallows in deep water — the walkable sloop is large (r≈56), so keep its whole hull clear of the beach or it runs aground and can't sail
    pickups,
    doors,
    enemies,
  };
}
