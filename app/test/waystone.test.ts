import { describe, expect, it } from 'vitest';
import { ARENA, HOME, TILE } from '../src/config/constants';
import { Rng } from '../src/core/Rng';
import { TERRAIN } from '../src/defs/terrains';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { Verbs, type VerbCtx } from '../src/systems/InteractionSystem';
import { placeStructure } from '../src/world/StructureIndex';
import { generateLevel } from '../src/world/WorldGen';

describe('waystones — a linked pair, home ↔ arena, one verb', () => {
  it('worldgen builds two stones, each carrying the OTHER\'s arrival tile (one tile south of it, on walkable ground)', () => {
    const level = generateLevel(new Rng(0));
    const stones = level.structures.filter((s) => s.def === 'structure.waystone');
    expect(stones).toHaveLength(2);
    const home = stones.find((s) => s.tx < HOME.cx + HOME.r)!;
    const arena = stones.find((s) => s.ty > ARENA.cy - ARENA.r)!;
    expect(home.warp).toEqual({ x: (arena.tx + 0.5) * TILE, y: (arena.ty + 1.5) * TILE });
    expect(arena.warp).toEqual({ x: (home.tx + 0.5) * TILE, y: (home.ty + 1.5) * TILE });
    for (const s of stones) {
      const w = s.warp!;
      const tile = level.grid.tiles[Math.floor(w.y / TILE)]![Math.floor(w.x / TILE)]!;
      expect([TERRAIN.grass, TERRAIN.sand]).toContain(tile); // you arrive on ground, never in the stone or the sea
      expect(level.grid.structures.blocks(Math.floor(w.x / TILE), Math.floor(w.y / TILE), { mode: 'foot', airborne: false, onLedge: false })).toBe(false);
    }
  });

  it('the warp verb offers itself beside a stone and moves the actor to its destination, velocities dropped', () => {
    const world = new World();
    const level = generateLevel(new Rng(0));
    const home = level.structures.find((s) => s.def === 'structure.waystone' && s.tx < HOME.cx + HOME.r)!;
    const stone = placeStructure(world, level.grid.structures, home.def, home.tx, home.ty, home.warp);
    expect(stone.structure!.warp).toEqual(home.warp);
    const hero = new Spawner(world, new Rng(1)).spawnHero(stone.transform!.x, stone.transform!.y + 30);
    hero.mover!.vx = 50;
    const warp = Verbs.find((v) => v.id === 'verb.warp')!;
    const ctx = { world } as unknown as VerbCtx; // the verb reads only the two entities
    expect(warp.can(hero, stone, ctx)).toBe(true);
    warp.run(hero, stone, ctx);
    expect(hero.transform!.x).toBe(home.warp!.x);
    expect(hero.transform!.y).toBe(home.warp!.y);
    expect(hero.mover!.vx).toBe(0);
    const wall = level.structures.find((s) => s.def === 'structure.stoneWall')!;
    const wallE = placeStructure(world, level.grid.structures, wall.def, wall.tx, wall.ty);
    expect(warp.can(hero, wallE, ctx)).toBe(false); // a structure without a destination offers nothing
  });
});
