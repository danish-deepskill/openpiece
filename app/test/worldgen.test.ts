import { describe, expect, it } from 'vitest';
import { ENEMY, HOME, TILE } from '../src/config/constants';
import { TERRAIN } from '../src/defs/terrains';
import { Rng } from '../src/core/Rng';
import { itemProblem } from '../src/defs/items';
import { generateLevel } from '../src/world/WorldGen';
import { TileGrid } from '../src/world/TileGrid';

/** Foot-reachability flood fill (4-neighbour). Uses `pathable`, not `walkable`: closed doors OPEN on
 *  approach (DoorSystem), so a house interior is reachable — but stone walls/trees have no such mechanic
 *  and stay blocking, so a grove or wall that truly seals a path still fails this fill. */
function footReachable(grid: TileGrid, sx: number, sy: number): boolean[][] {
  const seen: boolean[][] = grid.tiles.map((row) => row.map(() => false));
  const stack: Array<[number, number]> = [[sx, sy]];
  seen[sy][sx] = true;
  while (stack.length) {
    const [x, y] = stack.pop()!;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
      if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h || seen[ny][nx]) continue;
      if (!TileGrid.pathable(grid.tiles[ny][nx], 'foot')) continue;
      seen[ny][nx] = true;
      stack.push([nx, ny]);
    }
  }
  return seen;
}

const tileOf = (px: number): number => Math.floor(px / TILE);

describe('WorldGen — walls & groves never seal a required path', () => {
  // deterministic per seed; sweep a range so a bad grove roll on ANY seed would surface
  for (let seed = 0; seed < 40; seed++) {
    it(`seed ${seed}: captain, fodder, and home loot stay reachable`, () => {
      const level = generateLevel(new Rng(seed));
      const g = level.grid;

      // Flood each landmass from its foothold: the ENEMY isle from the west-dock landing (through the ring gap),
      // the HOME isle from the player spawn. Enemies now live on EITHER island (home-island bandits near spawn),
      // so each spawn must be walkable AND reachable from at least one of the two floods.
      const enemyReach = footReachable(g, ENEMY.cx - 10, ENEMY.cy);
      const homeReach = footReachable(g, HOME.cx - 7, HOME.cy);
      for (const e of level.enemies) {
        const tx = tileOf(e.x);
        const ty = tileOf(e.y);
        expect(TileGrid.walkable(g.tiles[ty][tx], 'foot')).toBe(true); // no spawn embedded in wall/tree
        expect(enemyReach[ty][tx] || homeReach[ty][tx]).toBe(true); // reachable from its island (enemy assault OR home spawn)
      }

      // HOME isle: both stashed pickups must be walk-in-able from the player spawn
      for (const p of level.pickups) {
        const tx = tileOf(p.x);
        const ty = tileOf(p.y);
        expect(homeReach[ty][tx]).toBe(true);
      }
    });
  }

  it('trunks keep ≥2 clear tiles between them (crowns never fuse; units weave between trees)', () => {
    for (const seed of [0, 7, 23, 39]) {
      const g = generateLevel(new Rng(seed)).grid;
      const trees: Array<[number, number]> = [];
      for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.tiles[y][x] === TERRAIN.tree) trees.push([x, y]);
      for (let i = 0; i < trees.length; i++) {
        for (let j = i + 1; j < trees.length; j++) {
          const d2 = (trees[i][0] - trees[j][0]) ** 2 + (trees[i][1] - trees[j][1]) ** 2;
          expect(d2).toBeGreaterThanOrEqual(9); // GROVES.spacing = 3 tiles, squared
        }
      }
    }
  });

  it('every stashed pickup is a resolvable ItemRef (no dangling loot ids)', () => {
    const level = generateLevel(new Rng(1));
    for (const pk of level.pickups) expect(itemProblem(pk.item)).toBeNull();
    // the straw hat is loot now, not spawn-worn
    expect(level.pickups.some((p) => p.item.id === 'accessory.strawHat')).toBe(true);
  });

  it('actually places a gapped stone ring and some trees', () => {
    const g = generateLevel(new Rng(1)).grid;
    let walls = 0;
    let trees = 0;
    for (const row of g.tiles) for (const t of row) {
      if (t === TERRAIN.stoneWall) walls++;
      else if (t === TERRAIN.tree) trees++;
    }
    expect(walls).toBeGreaterThan(10); // a real perimeter, not a stray tile
    expect(trees).toBeGreaterThan(0);
  });
});
