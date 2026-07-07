import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/Rng';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { EffectSystem } from '../src/systems/EffectSystem';
import { MovementSystem } from '../src/systems/MovementSystem';
import { JUMP_LAND_STUN, Tile } from '../src/config/constants';
import { Collision } from '../src/world/Collision';
import { TileGrid } from '../src/world/TileGrid';
import type { StrikeResolver } from '../src/systems/StrikeResolver';

/**
 * JUMP (docs/design/MOVEMENT_AIR.md) — the base air verb: activating ability.jump enters the AIR layer for its
 * duration; MovementSystem lands it (back to 'ground'); while airborne, collision clears foot-blocked terrain.
 * The two-layer model: a discrete 'ground'|'air' state, NOT a continuous height.
 */

const abilities = (world: World) => new AbilitySystem(world, new EffectSystem(world), {} as StrikeResolver, new Rng(1));

describe('jump enters + exits the air layer', () => {
  it('every unit is granted ability.jump (a fundamental movement verb, like guard)', () => {
    const e = new Spawner(new World(), new Rng(1)).spawnHero(0, 0);
    expect(e.loadout!.granted.has('ability.jump')).toBe(true);
  });

  it('activating jump sets layer=air + airT; MovementSystem ticks it down and LANDS at 0', () => {
    const world = new World();
    const e = new Spawner(world, new Rng(1)).spawnHero(100, 100);
    e.combatant!.stam = 100;
    const jumpDur = 0.55; // ability.jump `jump` field
    expect(abilities(world).activate(e, 'ability.jump')).toBe(true);
    expect(e.mover!.layer).toBe('air');
    expect(e.mover!.airT).toBeCloseTo(jumpDur, 5);

    // an all-grass grid so terrainSpeed/collision don't interfere; just tick the air timer down
    const grid = new TileGrid(50, 50);
    grid.tiles = Array.from({ length: 50 }, () => Array.from({ length: 50 }, () => Tile.Grass));
    const move = new MovementSystem(world, new Collision(grid));
    move.update(0.3); // partway
    expect(e.mover!.layer).toBe('air'); // still aloft
    expect(e.mover!.airT).toBeCloseTo(jumpDur - 0.3, 5);
    move.update(0.3); // past the end
    expect(e.mover!.layer).toBe('ground'); // LANDED (edge-triggered at airT<=0)
    expect(e.mover!.airT).toBe(0);
    // PUNISHABLE: landing applies a recovery stun (an enemy who waited out the hop catches you coming down)
    expect(e.combatant!.stunT).toBeCloseTo(JUMP_LAND_STUN, 5);
  });

  it('jump is COSTLY — real stamina + cooldown so the dodge cannot be spammed (20 stam / 1s cd)', () => {
    const world = new World();
    const e = new Spawner(world, new Rng(1)).spawnHero(0, 0);
    const before = e.combatant!.stam;
    abilities(world).activate(e, 'ability.jump');
    expect(before - e.combatant!.stam).toBeCloseTo(20, 1); // the authored stamina cost
    expect(e.loadout!.cd.get('ability.jump')).toBeGreaterThan(0.9); // ~1s cooldown (atkSpeed-scaled)
  });
});

describe('airborne clears LOW terrain but not TALL structures (the traversal payoff + the wall rule)', () => {
  /** A 20×20 grass grid with a vertical strip of `barrier` at column 10. */
  function barrierGrid(barrier: Tile): TileGrid {
    const g = new TileGrid(20, 20);
    g.tiles = Array.from({ length: 20 }, () => Array.from({ length: 20 }, (_, tx) => (tx === 10 ? barrier : Tile.Grass)));
    return g;
  }

  const tile = 32; // TILE px — the column-10 barrier spans x≈320..352
  /** Does an actor moving east from just-west of the barrier get THROUGH (airborne or grounded)? */
  function crosses(barrier: Tile, airborne: boolean): boolean {
    const p = { x: 9.5 * tile, y: 5 * tile };
    new Collision(barrierGrid(barrier)).tryMove(p, tile, 0, 8, 'foot', airborne);
    return p.x > 9.5 * tile;
  }

  it('deep water is crossable both ways: grounded WADES/SWIMS in, airborne FLIES over', () => {
    // deep water is no longer a foot WALL — a grounded unit enters it (becoming a swimmer, MovementSystem); an
    // airborne unit clears it. Both cross, differently. (The grounded-blocked-vs-airborne-clears contrast that
    // matters is now StoneWall/Tree, below.)
    expect(crosses(Tile.Water, false)).toBe(true); // grounded: steps into the sea (swims), not walled
    expect(crosses(Tile.Water, true)).toBe(true); // airborne: flies over
  });

  it('a jump CLEARS low barriers — StoneWall + Tree (grounded blocked, airborne passes)', () => {
    for (const low of [Tile.StoneWall, Tile.Tree] as const) {
      expect(crosses(low, false)).toBe(false); // on foot: blocked
      expect(crosses(low, true)).toBe(true); // in air: vaulted
    }
  });

  it('a jump is STILL BLOCKED by a building Wall + Door — too tall to hop onto (BLOCKS_AIR)', () => {
    for (const tall of [Tile.Wall, Tile.Door] as const) {
      expect(crosses(tall, false)).toBe(false); // on foot: blocked
      expect(crosses(tall, true)).toBe(false); // in air: STILL blocked (a roofed structure)
    }
  });
});
