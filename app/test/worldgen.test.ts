import { describe, expect, it } from 'vitest';
import { ARENA, ENEMY, HOME, TILE } from '../src/config/constants';
import { Rng } from '../src/core/Rng';
import { itemProblem } from '../src/defs/items';
import { World } from '../src/ecs/World';
import type { MoveCtx } from '../src/world/GridCollider';
import { placeStructure } from '../src/world/StructureIndex';
import { generateLevel, type LevelLayout } from '../src/world/WorldGen';
import { TileGrid } from '../src/world/TileGrid';

/** Turn the level's structure RECORDS into placed entities on the grid's index — what WorldScene does at
 *  world start. Doubles as an invariant: place() THROWS on any overlapping/out-of-bounds record, so a
 *  worldgen pass that emits an illegal layout fails right here, on every seed swept below. */
function materialize(level: LevelLayout): void {
  const world = new World();
  for (const s of level.structures) placeStructure(world, level.grid.structures, s.def, s.tx, s.ty);
}

const FOOT_CTX: MoveCtx = { mode: 'foot', airborne: false, onLedge: false };

/** Foot-reachability flood fill (4-neighbour) over BOTH layers. Uses the planning rules, not `walkable`:
 *  closed doors OPEN on approach (DoorSystem), so a house interior is reachable — but stone walls/trees have
 *  no such mechanic and stay blocking, so a grove or wall that truly seals a path still fails this fill. */
function footReachable(grid: TileGrid, sx: number, sy: number): boolean[][] {
  const seen: boolean[][] = grid.tiles.map((row) => row.map(() => false));
  const stack: Array<[number, number]> = [[sx, sy]];
  seen[sy][sx] = true;
  while (stack.length) {
    const [x, y] = stack.pop()!;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
      if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h || seen[ny][nx]) continue;
      if (!TileGrid.pathable(grid.tiles[ny][nx], 'foot') || !grid.structures.pathable(nx, ny, 'foot')) continue;
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
    it(`seed ${seed}: captain, fodder, the ronin, and home loot stay reachable`, () => {
      const level = generateLevel(new Rng(seed));
      materialize(level); // throws on any illegal structure record — part of the per-seed sweep
      const g = level.grid;

      // Flood each landmass from its foothold: the ENEMY isle from the west-dock landing (through the ring gap),
      // the HOME isle from the player spawn. Enemies now live on EITHER island (home-island bandits near spawn),
      // so each spawn must be walkable AND reachable from at least one of the two floods.
      const enemyReach = footReachable(g, ENEMY.cx - 10, ENEMY.cy);
      const homeReach = footReachable(g, HOME.cx - 7, HOME.cy);
      const arenaReach = footReachable(g, ARENA.cx, ARENA.cy - ARENA.r + 1); // the desert isle, from its dock's landward end
      for (const e of level.enemies) {
        const tx = tileOf(e.x);
        const ty = tileOf(e.y);
        // no spawn embedded in a blocking cell of EITHER layer (terrain or a built structure)
        expect(TileGrid.walkable(g.tiles[ty][tx], 'foot')).toBe(true);
        expect(g.structures.blocks(tx, ty, FOOT_CTX)).toBe(false);
        expect(enemyReach[ty][tx] || homeReach[ty][tx] || arenaReach[ty][tx]).toBe(true); // reachable from its island (enemy assault, home spawn, or the arena dock)
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
      const trees = generateLevel(new Rng(seed)).structures.filter((s) => s.def === 'structure.tree');
      for (let i = 0; i < trees.length; i++) {
        for (let j = i + 1; j < trees.length; j++) {
          const d2 = (trees[i].tx - trees[j].tx) ** 2 + (trees[i].ty - trees[j].ty) ** 2;
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

  it('actually places a gapped stone ring, houses with doors, trees, and THE windmill', () => {
    const s = generateLevel(new Rng(1)).structures;
    const count = (def: string) => s.filter((r) => r.def === def).length;
    expect(count('structure.stoneWall')).toBeGreaterThan(10); // a real perimeter, not a stray tile
    expect(count('structure.tree')).toBeGreaterThan(0);
    expect(count('structure.door')).toBe(4); // one per village house
    expect(count('structure.wall')).toBeGreaterThan(10); // the village shells
    expect(count('structure.windmill')).toBe(1); // the multi-tile landmark — ONE record, SIX cells at spawn
  });

  it('the windmill record occupies all six of its cells once materialized (multi-tile end-to-end)', () => {
    const level = generateLevel(new Rng(1));
    materialize(level);
    const mill = level.structures.find((r) => r.def === 'structure.windmill')!;
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        expect(level.grid.structures.blocks(mill.tx + dx, mill.ty + dy, FOOT_CTX)).toBe(true);
      }
    }
    expect(level.grid.structures.blocks(mill.tx - 1, mill.ty, FOOT_CTX)).toBe(false); // …and not its neighbor
  });
});
