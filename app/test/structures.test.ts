import { describe, expect, it } from 'vitest';
import { TILE } from '../src/config/constants';
import { TERRAIN } from '../src/defs/terrains';
import { Structures } from '../src/defs/structures';
import { structureDraws } from '../src/draw/structureDraws';
import { World } from '../src/ecs/World';
import { DoorSystem } from '../src/systems/DoorSystem';
import type { MoveCtx } from '../src/world/GridCollider';
import { placeStructure, removeStructure } from '../src/world/StructureIndex';
import { TileGrid } from '../src/world/TileGrid';

/**
 * STRUCTURES-AS-ENTITIES (defs/structures.ts + world/StructureIndex.ts) — the second layer of the two-layer
 * world. This file pins the data model (family sweep, low/tall coherence) and the occupancy MACHINERY:
 * multi-tile footprints, overlap fail-loud, the physical/planning/vision rules the oracles compose, and the
 * door lifecycle (DoorSystem flips `structure.open`; collision follows the component, no tile flips).
 */

const FOOT: MoveCtx = { mode: 'foot', airborne: false, onLedge: false };
const AIR: MoveCtx = { mode: 'foot', airborne: true, onLedge: false };
const PERCHED: MoveCtx = { mode: 'foot', airborne: false, onLedge: true };

/** A synthetic multi-tile row (3×2 barn) — the windmill/cannon shape the entity design exists for. Registered
 *  once at module load; vitest isolates module state per test FILE, so the live game registry never sees it. */
Structures.register({ id: 'structure.testBarn', name: 'Test Barn', size: { w: 3, h: 2 }, blocksFoot: true, blocksAir: true });

function grassGrid(w = 12, h = 12): TileGrid {
  const g = new TileGrid(w, h);
  g.tiles = Array.from({ length: h }, () => Array.from({ length: w }, () => TERRAIN.grass));
  return g;
}

describe('Structures registry (family sweep)', () => {
  it('air-blockers also foot-block; doors block while closed — the def model is coherent', () => {
    for (const d of Structures.all()) {
      if (d.blocksAir) expect(d.blocksFoot, `${d.id} blocksAir without blocksFoot`).toBe(true);
      if (d.door) expect(d.blocksFoot, `${d.id} is a door that never blocks`).toBe(true);
      expect(d.size.w >= 1 && d.size.h >= 1, `${d.id} has an empty footprint`).toBe(true);
    }
  });

  it("every def's bake key resolves to a painter (CI-side twin of the StructureRenderer boot sweep)", () => {
    // structureDraws imports Phaser TYPE-only, so this is legal headless — a typo'd bake key fails here in CI
    for (const d of Structures.all()) {
      if (d.bake) expect(structureDraws[d.bake], `${d.id} names unknown bake '${d.bake}'`).toBeDefined();
    }
  });
});

describe('StructureIndex occupancy (multi-tile footprints, fail-loud placement)', () => {
  it('a 3×2 footprint claims EVERY covered cell — and only those', () => {
    const g = grassGrid();
    const e = placeStructure(new World(), g.structures, 'structure.testBarn', 4, 5);
    for (let y = 5; y <= 6; y++) for (let x = 4; x <= 6; x++) expect(g.structures.at(x, y)).toBe(e);
    expect(g.structures.at(3, 5)).toBeUndefined(); // west of the barn
    expect(g.structures.at(4, 7)).toBeUndefined(); // south of it
    expect(g.structures.at(7, 5)).toBeUndefined(); // east of it
  });

  it('overlap THROWS (never a silent shadow), out-of-bounds THROWS', () => {
    const g = grassGrid();
    const world = new World();
    placeStructure(world, g.structures, 'structure.testBarn', 4, 5);
    expect(() => placeStructure(world, g.structures, 'structure.wall', 6, 6)).toThrow(/overlaps/); // barn's SE cell
    expect(() => placeStructure(world, g.structures, 'structure.testBarn', 10, 10)).toThrow(/leaves/); // 3×2 off a 12×12 grid
  });

  it('removeStructure (demolition) frees every cell, destroys the ENTITY, and bumps the version (dirty flag)', () => {
    const g = grassGrid();
    const world = new World();
    const e = placeStructure(world, g.structures, 'structure.testBarn', 4, 5);
    const v = g.structures.version;
    removeStructure(world, g.structures, e);
    expect(g.structures.at(5, 5)).toBeUndefined(); // cells released…
    expect(world.byId(e.id)).toBeUndefined(); // …AND the entity is gone — index and world can't disagree
    expect(g.structures.version).toBe(v + 1);
    expect(() => placeStructure(world, g.structures, 'structure.wall', 5, 5)).not.toThrow(); // cell reusable
  });

  it('placeStructure centers the transform on the footprint (a first-class, inspectable entity)', () => {
    const g = grassGrid();
    const e = placeStructure(new World(), g.structures, 'structure.testBarn', 4, 5);
    expect(e.transform!.x).toBeCloseTo((4 + 1.5) * TILE, 5);
    expect(e.transform!.y).toBeCloseTo((5 + 1) * TILE, 5);
  });
});

describe('the physical / planning / vision rules (what the oracles compose)', () => {
  it('LOW structures (stone/tree) block grounded, clear airborne, and stand a perched actor', () => {
    const g = grassGrid();
    placeStructure(new World(), g.structures, 'structure.stoneWall', 5, 5);
    expect(g.structures.blocks(5, 5, FOOT)).toBe(true);
    expect(g.structures.blocks(5, 5, AIR)).toBe(false); // vault it
    expect(g.structures.blocks(5, 5, PERCHED)).toBe(false); // stand ON it
  });

  it('TALL structures (wall/door) block even airborne and perched (there is a roof)', () => {
    const g = grassGrid();
    placeStructure(new World(), g.structures, 'structure.wall', 5, 5);
    expect(g.structures.blocks(5, 5, AIR)).toBe(true);
    expect(g.structures.blocks(5, 5, PERCHED)).toBe(true);
  });

  it('a door plans-through while CLOSED, and stops blocking (collision + vision) once open', () => {
    const g = grassGrid();
    const door = placeStructure(new World(), g.structures, 'structure.door', 5, 5);
    expect(g.structures.blocks(5, 5, FOOT)).toBe(true); // physically shut…
    expect(g.structures.pathable(5, 5, 'foot')).toBe(true); // …but the AI routes through it
    door.structure!.open = true;
    expect(g.structures.blocks(5, 5, FOOT)).toBe(false); // an open door is a doorway
    expect(g.structures.opaqueAt(5, 5)).toBe(false);
  });

  it('vision: walls are opaque, trees are not (see into the grove, not through the house)', () => {
    const g = grassGrid();
    const world = new World();
    placeStructure(world, g.structures, 'structure.wall', 5, 5);
    placeStructure(world, g.structures, 'structure.tree', 7, 7);
    expect(g.structures.opaqueAt(5, 5)).toBe(true);
    expect(g.structures.opaqueAt(7, 7)).toBe(false);
  });
});

describe('DoorSystem on door entities', () => {
  function doorWorld(): { world: World; door: ReturnType<World['create']>; doors: DoorSystem } {
    const g = grassGrid();
    const world = new World();
    const door = placeStructure(world, g.structures, 'structure.door', 5, 5);
    return { world, door, doors: new DoorSystem(world) };
  }
  const walker = (world: World, x: number, y: number) =>
    world.create({
      transform: { x, y, angle: 0, r: 8 },
      mover: { vx: 0, vy: 0, speed: 100, mass: 1, mode: 'foot', dodgeT: 0, dvx: 0, dvy: 0 },
    });

  it('opens on touch, closes when everyone leaves — open state lives on the COMPONENT', () => {
    const { world, door, doors } = doorWorld();
    const w = walker(world, 5 * TILE + TILE / 2, 7 * TILE); // 1.5 tiles south — out of reach
    doors.update();
    expect(door.structure!.open).toBe(false);
    w.transform!.y = 6 * TILE; // pressed against the doorway's south edge — within touch reach
    doors.update();
    expect(door.structure!.open).toBe(true);
    w.transform!.y = 9 * TILE; // walk away
    doors.update();
    expect(door.structure!.open).toBe(false); // shuts (and re-blocks) behind you
  });

  it('the dead do not hold doors open', () => {
    const { world, door, doors } = doorWorld();
    const w = walker(world, 5 * TILE + TILE / 2, 6 * TILE + TILE / 2);
    w.health = { hp: 0, maxHp: 10, dead: true, hitFlash: 0, iframes: 0 };
    doors.update();
    expect(door.structure!.open).toBe(false);
  });
});
