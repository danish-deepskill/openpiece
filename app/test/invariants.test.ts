import { describe, expect, it } from 'vitest';
import type { AIContext } from '../src/ai/Brain';
import { SIM_DT } from '../src/config/constants';
import { Rng, streamSeed } from '../src/core/Rng';
import { World } from '../src/ecs/World';
import { Spawner } from '../src/ecs/Spawner';
import { restoreWorld, snapshotWorld, type WorldSnapshot } from '../src/ecs/snapshot';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { AISystem } from '../src/systems/AISystem';
import { BodyCollisionSystem } from '../src/systems/BodyCollisionSystem';
import { CombatantSystem } from '../src/systems/CombatantSystem';
import { Damage } from '../src/systems/Damage';
import { DialogueSystem } from '../src/systems/DialogueSystem';
import { DoorSystem } from '../src/systems/DoorSystem';
import { EffectSystem } from '../src/systems/EffectSystem';
import { GameDirector } from '../src/systems/GameDirector';
import { HullCollisionSystem } from '../src/systems/HullCollisionSystem';
import { MeleeSystem } from '../src/systems/MeleeSystem';
import { MovementSystem } from '../src/systems/MovementSystem';
import { ProjectileSystem } from '../src/systems/ProjectileSystem';
import { ShipSystem } from '../src/systems/ShipSystem';
import { SquadSystem } from '../src/systems/SquadSystem';
import { StrikeResolver } from '../src/systems/StrikeResolver';
import { SwimSystem } from '../src/systems/SwimSystem';
import { Collision } from '../src/world/Collision';
import { Pathfinder } from '../src/world/Pathfinder';
import { SpatialQuery } from '../src/world/SpatialQuery';
import { placeStructure } from '../src/world/StructureIndex';
import { generateLevel } from '../src/world/WorldGen';

// the REAL sim quantum — a hardcoded 1/60 here would silently diverge from the game if SIM_DT is retuned
const SIM = SIM_DT;

/**
 * The FULL headless sim: real worldgen, real spawns, every sim system from WorldScene.stepSim in the
 * exact play-branch order — minus InputSystem (the one Phaser-coupled call; the hero stands idle, which
 * is itself a valid input recording: all-zero intent). This harness IS the future server loop's shape;
 * when stepSim gains a PlayerIntent slot, this file swaps the omission for an intent injector.
 */
function buildSim(masterSeed: number) {
  const worldgenRng = new Rng(streamSeed(masterSeed, 'worldgen'));
  const aiRng = new Rng(streamSeed(masterSeed, 'ai'));
  const combatRng = new Rng(streamSeed(masterSeed, 'combat'));
  const level = generateLevel(worldgenRng);
  const world = new World();
  // materialize structure RECORDS into entities + index claims BEFORE anything reads the grid (the
  // WorldScene.create order, reproduced)
  for (const s of level.structures) placeStructure(world, level.grid.structures, s.def, s.tx, s.ty);
  const collision = new Collision(level.grid);
  const pathfinder = new Pathfinder(level.grid);
  const query = new SpatialQuery(world);
  const damage = new Damage();
  const strikes = new StrikeResolver(damage, combatRng);
  const effects = new EffectSystem(world);
  const abilities = new AbilitySystem(world, effects, strikes, combatRng);
  const ships = new ShipSystem(world, collision);
  const hulls = new HullCollisionSystem(world);
  const squads = new SquadSystem(world, query);
  const spawner = new Spawner(world, worldgenRng);
  // a representative world, spawn order mirroring WorldScene.create (spawn rolls consume worldgenRng, so
  // ORDER is part of the seed's meaning)
  spawner.spawnHero(level.playerSpawn.x, level.playerSpawn.y);
  for (const pk of level.pickups) spawner.spawnPickup(pk.item, pk.x, pk.y);
  const isle = { id: 2, name: 'Isle Raiders' };
  for (const s of level.enemies) spawner.spawnUnit(s.unit, s.x, s.y, s.boss ? undefined : { ...isle });
  spawner.spawnShip('ship.sloop', level.boatSpawn.x, level.boatSpawn.y, 'straw_hat');
  const ctx: AIContext = { world, query, rng: aiRng, abilities, pathfinder };
  const director = new GameDirector(world, level);
  const doors = new DoorSystem(world);
  const ai = new AISystem(world, ctx);
  const move = new MovementSystem(world, collision);
  const swim = new SwimSystem(world, damage);
  const bodies = new BodyCollisionSystem(world, query, collision);
  const melee = new MeleeSystem(world, strikes);
  const projectiles = new ProjectileSystem(world, strikes, collision, combatRng);
  const combatants = new CombatantSystem(world);
  const dialogue = new DialogueSystem();
  director.setState('play'); // stepSim's play branch is gated on this; headless has no start screen
  const step = (): void => {
    // WorldScene.stepSim's play-branch order, verbatim — keep in sync when the scene reorders systems
    doors.update();
    // (InputSystem slot — omitted: headless, zero player intent)
    squads.update();
    ai.update(SIM);
    move.update(SIM);
    swim.update(SIM);
    bodies.update();
    ships.update(SIM);
    hulls.update();
    melee.update(SIM);
    projectiles.update(SIM);
    abilities.update(SIM);
    combatants.update(SIM);
    effects.update(SIM);
    director.update(SIM);
    dialogue.update(SIM);
  };
  return { world, level, step };
}

describe('sim invariants (the persistence + determinism harness)', () => {
  it('SAME-SEED REPLAY: two sims from one seed are byte-identical after 600 ticks (10s)', () => {
    // The determinism guarantee, finally positive: identical seeds ⇒ identical state. Until now it was
    // only fenced negatively (no wall-clock/Math.random in sim dirs) — this test catches what fences
    // can't: iteration-order drift, unseeded branches, cross-tick aliasing.
    const a = buildSim(0xc0ffee);
    const b = buildSim(0xc0ffee);
    for (let i = 0; i < 600; i++) {
      a.step();
      b.step();
    }
    expect(JSON.stringify(snapshotWorld(a.world))).toBe(JSON.stringify(snapshotWorld(b.world)));
  });

  it('the state hash is SENSITIVE: a different seed produces a different world', () => {
    // guards the replay test against a degenerate snapshot (one that serializes nothing meaningful)
    const a = buildSim(1);
    const b = buildSim(2);
    for (let i = 0; i < 60; i++) {
      a.step();
      b.step();
    }
    expect(JSON.stringify(snapshotWorld(a.world))).not.toBe(JSON.stringify(snapshotWorld(b.world)));
  });

  it('SNAPSHOT ROUND-TRIP: serialize → JSON → restore → re-serialize is the identity', () => {
    const { world, step } = buildSim(0xbea7ed);
    for (let i = 0; i < 300; i++) step(); // a LIVED-IN world: swings mid-flight, effects ticking, deaths
    const json = JSON.stringify(snapshotWorld(world));
    const worldB = new World();
    restoreWorld(JSON.parse(json) as WorldSnapshot, worldB);
    expect(JSON.stringify(snapshotWorld(worldB))).toBe(json);
    expect(worldB.count).toBe(world.count);
  });

  it('restored refs + class components WORK: ids resolve, StatBlock computes, new ids never collide', () => {
    const { world, step } = buildSim(0xbea7ed);
    for (let i = 0; i < 300; i++) step();
    const json = JSON.stringify(snapshotWorld(world));
    const worldB = new World();
    restoreWorld(JSON.parse(json) as WorldSnapshot, worldB);

    const [heroA] = world.with('control', 'attributes');
    const [heroB] = worldB.with('control', 'attributes');
    expect(heroB).toBeDefined();
    expect(heroB.attributes.get('maxHp')).toBe(heroA.attributes.get('maxHp')); // StatBlock recomputed, not stale
    expect(heroB.loadout!.granted.size).toBeGreaterThan(0); // Set round-tripped
    for (const e of worldB.with('ai')) {
      expect(e.ai.bb.profile).toBeDefined(); // live def re-resolved from its id
      expect(typeof e.ai.brain.think).toBe('function'); // the shared brain re-attached
    }
    for (const e of worldB.with('onDeck')) expect(worldB.byId(e.onDeck.shipId)).toBeDefined(); // id refs resolve
    const maxId = Math.max(...[...worldB.entities].map((e) => e.id));
    expect(worldB.create({}).id).toBeGreaterThan(maxId); // nextId advanced past every restored id
  });

  it('restore NEVER re-issues an id a despawned entity once held (stale at-rest refs stay dead)', () => {
    // the wrong-target bug class: entity 3 despawns, but a grudge/quarry ref may still hold id 3 at rest.
    // If restore recounted nextId from the LIVE max (2), the first post-load spawn would re-mint id 3 —
    // and the old grudge would aim at an unrelated newcomer. The saved nextId must survive the trip.
    const w = new World();
    w.create({});
    w.create({});
    const despawned = w.create({}); // mints id 3…
    w.destroy(despawned); // …then dies; live max is now 2, but id 3 is burned forever
    const w2 = new World();
    restoreWorld(JSON.parse(JSON.stringify(snapshotWorld(w))) as WorldSnapshot, w2);
    expect(w2.create({}).id).toBeGreaterThan(despawned.id); // pre-fix: this re-minted exactly id 3
  });

  it('the StructureIndex REBUILDS from restored entities (derived state is never saved)', () => {
    const seed = 0x5eed;
    const { world, step } = buildSim(seed);
    for (let i = 0; i < 60; i++) step();
    const worldB = new World();
    restoreWorld(JSON.parse(JSON.stringify(snapshotWorld(world))) as WorldSnapshot, worldB);
    // the grid regenerates from the SAME seed (terrain is never saved); the index re-claims from entities
    const level2 = generateLevel(new Rng(streamSeed(seed, 'worldgen')));
    const structures = worldB.with('structure', 'transform');
    expect(structures.length).toBeGreaterThan(0);
    for (const s of structures) level2.grid.structures.place(s); // throws on OOB/overlap — a rebuild failure fails loud
  });
});
