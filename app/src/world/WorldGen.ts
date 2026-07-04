import { ENEMY, HOME, TILE, Tile } from '../config/constants';
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
      if (grid.tiles[ty][tx] !== Tile.Grass) continue;
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
      grid.tiles[ty][tx] = Tile.StoneWall;
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
    inBounds(grid, tx, ty) && grid.tiles[ty][tx] === Tile.Grass && !near(tx, ty);
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
      grid.tiles[ty][tx] = Tile.Tree;
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
    const row: Tile[] = [];
    for (let x = 0; x < grid.w; x++) {
      let t = Tile.Water;
      const dh = Math.hypot(x - HOME.cx, (y - HOME.cy) * 1.05);
      const de = Math.hypot(x - ENEMY.cx, (y - ENEMY.cy) * 1.05);
      if (dh < HOME.r + 2 || de < ENEMY.r + 2) t = Tile.ShallowWater; // coastal shallows: a wadable ring off the beach
      if (dh < HOME.r) t = dh < HOME.r - 2 ? Tile.Grass : Tile.Sand; // …overridden by the island itself (sand/grass)
      if (de < ENEMY.r) t = de < ENEMY.r - 2 ? Tile.Grass : Tile.Sand;
      row.push(t);
    }
    grid.tiles.push(row);
  }

  // docks: home reaches east, enemy reaches west (tiles recorded so groves keep clear of the landings)
  const dockTiles: Pt[] = [];
  for (let x = HOME.cx + 10; x <= HOME.cx + 16 && x < grid.w; x++) {
    grid.tiles[HOME.cy][x] = Tile.Dock;
    dockTiles.push({ tx: x, ty: HOME.cy });
    if (grid.tiles[HOME.cy + 1]) grid.tiles[HOME.cy + 1][x] = Tile.Dock;
  }
  for (let x = ENEMY.cx - 16; x <= ENEMY.cx - 10; x++) {
    if (x < 0) continue;
    grid.tiles[ENEMY.cy][x] = Tile.Dock;
    dockTiles.push({ tx: x, ty: ENEMY.cy });
    if (grid.tiles[ENEMY.cy + 1]) grid.tiles[ENEMY.cy + 1][x] = Tile.Dock;
  }

  // home village buildings — stamped as hollow wall blocks (Wall perimeter, Floor interior, 1-tile door).
  // Real grid obstacles so collision + pathfinding share one source of truth.
  const doors: { tx: number; ty: number }[] = [];
  const stampHouse = (tx: number, ty: number, tw: number, th: number, label: string) => {
    for (let y = ty; y < ty + th; y++) {
      for (let x = tx; x < tx + tw; x++) {
        if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) continue;
        const edge = x === tx || x === tx + tw - 1 || y === ty || y === ty + th - 1;
        grid.tiles[y][x] = edge ? Tile.Wall : Tile.Floor;
      }
    }
    const doorX = tx + Math.floor(tw / 2); // doorway in the bottom wall (openable — see DoorSystem)
    const doorY = ty + th - 1;
    if (grid.tiles[doorY]) {
      grid.tiles[doorY][doorX] = Tile.Door;
      doors.push({ tx: doorX, ty: doorY });
    }
    grid.labels.push({ x: px(tx) + px(tw) / 2, y: px(ty) - 6, text: label });
  };
  const houses = [
    { tx: HOME.cx - 7, ty: HOME.cy - 6, tw: 5, th: 4, label: 'House' },
    { tx: HOME.cx - 2, ty: HOME.cy - 9, tw: 5, th: 4, label: 'House' },
    { tx: HOME.cx - 9, ty: HOME.cy + 1, tw: 5, th: 4, label: 'House' },
    { tx: HOME.cx, ty: HOME.cy + 4, tw: 6, th: 4, label: 'Tavern' },
  ];
  for (const h of houses) stampHouse(h.tx, h.ty, h.tw, h.th, h.label);
  // interior-center pixel of a house — where stashed loot sits (walk in through the door, press E)
  const inside = (h: (typeof houses)[number]) => ({ x: px(h.tx) + px(h.tw) / 2, y: px(h.ty) + px(h.th) / 2 });

  // loot stashed inside the village houses (walk in + E to take). The straw hat shares the cutlass house —
  // the hero now spawns bare-headed (defs/units unit.hero), so the hat is FOUND, not worn from birth.
  const cutlassHouse = inside(houses[0]);
  const pickups: PickupSpawn[] = [
    { item: { cat: 'weapon', id: 'weapon.cutlass' }, ...cutlassHouse },
    { item: { cat: 'weapon', id: 'weapon.sword' }, x: cutlassHouse.x - 22, y: cutlassHouse.y }, // the 2H combo blade, left of the cutlass
    { item: { cat: 'accessory', id: 'accessory.strawHat' }, x: cutlassHouse.x + 22, y: cutlassHouse.y }, // beside the cutlass
    { item: { cat: 'fruit', id: 'fruit.gomu' }, ...inside(houses[2]) },
  ];

  // enemy-isle stone ring (the assault funnels through its gaps) — placed on the enemy island's grass
  stampWallRing(grid, ENEMY.cx, ENEMY.cy, WALL_RING);

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
  enemies.push({ x: px(ENEMY.cx), y: px(ENEMY.cy), boss: true, unit: 'unit.captain' });

  // tree groves — placed LAST so they can dodge every spawn/dock/door and the wall band (kept off the ring
  // so gaps stay open). Only grass is overwritten; the reachability test guards against a grove sealing a path.
  const spawnTiles: Pt[] = enemies.map((e) => ({ tx: Math.floor(e.x / TILE), ty: Math.floor(e.y / TILE) }));
  const protect: Pt[] = [
    ...dockTiles,
    ...doors,
    ...spawnTiles,
    { tx: HOME.cx - 7, ty: HOME.cy }, // player spawn
    { tx: HOME.cx + 14, ty: HOME.cy }, // boat spawn
    { tx: ENEMY.cx, ty: ENEMY.cy }, // captain
  ];
  scatterGroves(grid, rng, HOME.cx, HOME.cy, HOME.r, GROVES.home, GROVES, protect);
  scatterGroves(grid, rng, ENEMY.cx, ENEMY.cy, ENEMY.r, GROVES.enemy, GROVES, protect, WALL_RING.radius);

  return {
    grid,
    playerSpawn: { x: px(HOME.cx - 7), y: px(HOME.cy) }, // west side of the island (near the loot houses)
    boatSpawn: { x: px(HOME.cx + 14), y: px(HOME.cy) },
    pickups,
    doors,
    enemies,
  };
}
