import { describe, expect, it } from 'vitest';
import { SAND_MOVE_MULT, SHALLOW_MOVE_MULT, SWIM_MOVE_MULT } from '../src/config/constants';
import { TERRAIN, Terrains, terrainByOrdinal } from '../src/defs/terrains';
import { terrainBakes } from '../src/draw/terrainBakes';
import { TileGrid } from '../src/world/TileGrid';

/**
 * TERRAIN-AS-DEFS (defs/terrains.ts) — the family sweep + the semantic contract the movement/render systems
 * lean on. Behavior parity with the old Tile enum is pinned by the movement suites (swim/ledge/jump/collision);
 * THIS file pins the data model itself: ordinal integrity, the TERRAIN table ↔ def binding, and the derived
 * classification rules that replaced the old hand-listed sets. Built things (wall/door/stone/tree) are the
 * STRUCTURE layer's — see structures.test.ts.
 */
describe('Terrains registry', () => {
  it('every TERRAIN constant decodes to a def whose ordinal round-trips', () => {
    for (const [name, ord] of Object.entries(TERRAIN)) {
      const d = terrainByOrdinal(ord);
      expect(d, `TERRAIN.${name} (${ord}) has no def`).toBeDefined();
      expect(d.ordinal).toBe(ord);
    }
  });

  it('ordinals are unique and Uint8-ranged (the grid-storage contract)', () => {
    const seen = new Set<number>();
    for (const d of Terrains.all()) {
      expect(seen.has(d.ordinal), `duplicate ordinal ${d.ordinal}`).toBe(false);
      seen.add(d.ordinal);
      expect(Number.isInteger(d.ordinal) && d.ordinal >= 0 && d.ordinal <= 255).toBe(true);
    }
    expect(Terrains.all().length).toBe(Object.keys(TERRAIN).length); // no def without a named constant
  });

  it('air-blockers also foot-block (a roof needs a wall) — the low/tall derivation is coherent', () => {
    for (const d of Terrains.all()) {
      if (d.blocksAir) expect(d.blocksFoot, `${d.id} blocksAir without blocksFoot`).toBe(true);
    }
  });

  it('water semantics drive speed: deep swims, shallows wade, sand trudges', () => {
    expect(terrainByOrdinal(TERRAIN.water).water).toBe('deep');
    expect(terrainByOrdinal(TERRAIN.shallowWater).water).toBe('shallow');
    expect(TileGrid.swimSpeedMul(TERRAIN.water)).toBe(SWIM_MOVE_MULT);
    expect(TileGrid.speedMul(TERRAIN.shallowWater)).toBe(SHALLOW_MOVE_MULT);
    expect(TileGrid.speedMul(TERRAIN.sand)).toBe(SAND_MOVE_MULT);
  });

  it('AI pathability: deep water plans-around for foot (physically enterable → swim, but AI stays ashore)', () => {
    expect(TileGrid.pathable(TERRAIN.water, 'foot')).toBe(false);
    expect(TileGrid.walkable(TERRAIN.water, 'foot')).toBe(true);
  });

  it('boats travel exactly the boatPassable set (deep, shallow, dock)', () => {
    const sailable = Terrains.all().filter((d) => TileGrid.walkable(d.ordinal, 'boat')).map((d) => d.id).sort();
    expect(sailable).toEqual(['terrain.dock', 'terrain.shallowWater', 'terrain.water']);
  });

  it("every def's bake key resolves to a painter (CI-side twin of the TerrainRenderer boot sweep)", () => {
    // terrainBakes imports Phaser TYPE-only, so this is legal headless — a typo'd bake key fails here in CI,
    // not just at the first in-game bake.
    for (const d of Terrains.all()) {
      if (d.bake) expect(terrainBakes[d.bake], `${d.id} names unknown bake '${d.bake}'`).toBeDefined();
    }
  });
});
