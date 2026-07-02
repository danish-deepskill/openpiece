import { ENEMY, HOME, TILE, Tile } from '../config/constants';
import type { Rng } from '../core/Rng';
import { TileGrid } from './TileGrid';

export interface EnemySpawn { x: number; y: number; boss: boolean; unit: string }

export interface PickupSpawn { kind: 'weapon' | 'fruit'; defId: string; x: number; y: number }

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

  // docks: home reaches east, enemy reaches west
  for (let x = HOME.cx + 10; x <= HOME.cx + 16 && x < grid.w; x++) {
    grid.tiles[HOME.cy][x] = Tile.Dock;
    if (grid.tiles[HOME.cy + 1]) grid.tiles[HOME.cy + 1][x] = Tile.Dock;
  }
  for (let x = ENEMY.cx - 16; x <= ENEMY.cx - 10; x++) {
    if (x < 0) continue;
    grid.tiles[ENEMY.cy][x] = Tile.Dock;
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

  // loot stashed inside two of the village houses
  const pickups: PickupSpawn[] = [
    { kind: 'weapon', defId: 'weapon.cutlass', ...inside(houses[0]) },
    { kind: 'fruit', defId: 'fruit.gomu', ...inside(houses[2]) },
  ];

  const enemies: EnemySpawn[] = [];
  for (let i = 0; i < 7; i++) {
    const a = rng.range(0, Math.PI * 2);
    const rr = rng.range(2, 9) * TILE;
    enemies.push({
      x: px(ENEMY.cx) + Math.cos(a) * rr,
      y: px(ENEMY.cy) + Math.sin(a) * rr,
      boss: false,
      unit: rng.pick(FODDER),
    });
  }
  enemies.push({ x: px(ENEMY.cx), y: px(ENEMY.cy), boss: true, unit: 'unit.captain' });

  return {
    grid,
    playerSpawn: { x: px(HOME.cx - 7), y: px(HOME.cy) }, // west side of the island (near the loot houses)
    boatSpawn: { x: px(HOME.cx + 14), y: px(HOME.cy) },
    pickups,
    doors,
    enemies,
  };
}
