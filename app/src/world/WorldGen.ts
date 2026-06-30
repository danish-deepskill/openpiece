import { ENEMY, HOME, TILE, Tile } from '../config/constants';
import { rand } from '../core/math';
import { TileGrid } from './TileGrid';

export interface VillagerSpawn { x: number; y: number; line: string }
export interface PirateSpawn { x: number; y: number; name: string; hp: number; dmg: number }
export interface EnemySpawn { x: number; y: number; boss: boolean }

export interface LevelLayout {
  grid: TileGrid;
  playerSpawn: { x: number; y: number };
  boatSpawn: { x: number; y: number };
  fruit: { x: number; y: number; treeX: number; treeY: number };
  villagers: VillagerSpawn[];
  pirates: PirateSpawn[];
  enemies: EnemySpawn[];
}

const px = (tx: number) => tx * TILE;

/** Procedurally builds the two-island map and every spawn placement (all in pixels). */
export function generateLevel(): LevelLayout {
  const grid = new TileGrid();

  for (let y = 0; y < grid.h; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < grid.w; x++) {
      let t = Tile.Water;
      const dh = Math.hypot(x - HOME.cx, (y - HOME.cy) * 1.05);
      const de = Math.hypot(x - ENEMY.cx, (y - ENEMY.cy) * 1.05);
      if (dh < HOME.r) t = dh < HOME.r - 2 ? Tile.Grass : Tile.Sand;
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
  const stampHouse = (tx: number, ty: number, tw: number, th: number, label: string) => {
    for (let y = ty; y < ty + th; y++) {
      for (let x = tx; x < tx + tw; x++) {
        if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) continue;
        const edge = x === tx || x === tx + tw - 1 || y === ty || y === ty + th - 1;
        grid.tiles[y][x] = edge ? Tile.Wall : Tile.Floor;
      }
    }
    const doorX = tx + Math.floor(tw / 2); // gap in the bottom wall
    if (grid.tiles[ty + th - 1]) grid.tiles[ty + th - 1][doorX] = Tile.Floor;
    grid.labels.push({ x: px(tx) + px(tw) / 2, y: px(ty) - 6, text: label });
  };
  stampHouse(HOME.cx - 7, HOME.cy - 6, 5, 4, 'House');
  stampHouse(HOME.cx - 2, HOME.cy - 9, 5, 4, 'House');
  stampHouse(HOME.cx - 9, HOME.cy + 1, 5, 4, 'House');
  stampHouse(HOME.cx, HOME.cy + 4, 6, 4, 'Tavern');

  const fruitX = px(HOME.cx + 4);
  const fruitY = px(HOME.cy - 3);

  const villLines = [
    "Mornin'! The sea's calm today.",
    "Heard there's a strange fruit by the old tree...",
    'Bandits took over the eastern isle. Stay sharp.',
  ];
  const villSpots: Array<[number, number]> = [
    [HOME.cx - 3, HOME.cy - 2],
    [HOME.cx + 2, HOME.cy - 1],
    [HOME.cx - 5, HOME.cy + 3],
    [HOME.cx, HOME.cy + 2],
  ];
  const villagers: VillagerSpawn[] = villSpots.map((s, i) => ({
    x: px(s[0]),
    y: px(s[1]),
    line: villLines[i % villLines.length],
  }));

  const pirateNames = ['Roric', 'Bell', 'Tason'];
  const pirateSpots: Array<[number, number]> = [
    [HOME.cx + 2, HOME.cy + 3],
    [HOME.cx + 4, HOME.cy + 3],
    [HOME.cx + 5, HOME.cy + 5],
  ];
  const pirates: PirateSpawn[] = pirateSpots.map((s, i) => ({
    x: px(s[0]),
    y: px(s[1]),
    name: pirateNames[i],
    hp: 80 + i * 10,
    dmg: 18 + i * 4,
  }));

  const enemies: EnemySpawn[] = [];
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = rand(2, 9) * TILE;
    enemies.push({
      x: px(ENEMY.cx) + Math.cos(a) * rr,
      y: px(ENEMY.cy) + Math.sin(a) * rr,
      boss: false,
    });
  }
  enemies.push({ x: px(ENEMY.cx), y: px(ENEMY.cy), boss: true });

  return {
    grid,
    playerSpawn: { x: px(HOME.cx), y: px(HOME.cy) },
    boatSpawn: { x: px(HOME.cx + 14), y: px(HOME.cy) },
    fruit: { x: fruitX, y: fruitY, treeX: fruitX, treeY: fruitY - 24 },
    villagers,
    pirates,
    enemies,
  };
}
