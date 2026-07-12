import { expect, it } from 'vitest';
import { actorBrain } from '../src/ai/brains';
import type { AIContext } from '../src/ai/Brain';
import { TagSet } from '../src/combat/TagSet';
import { Rng } from '../src/core/Rng';
import { AIProfiles } from '../src/defs/aiProfiles';
import { deckOf, helmSpot } from '../src/defs/decks';
import type { FactionId } from '../src/defs/factions';
import { ShipHulls } from '../src/defs/ships';
import type { Entity } from '../src/ecs/components';
import { BASE_KIT } from '../src/defs/units';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { EffectSystem } from '../src/systems/EffectSystem';
import { MovementSystem } from '../src/systems/MovementSystem';
import { ShipSystem } from '../src/systems/ShipSystem';
import type { StrikeResolver } from '../src/systems/StrikeResolver';
import { Collision } from '../src/world/Collision';
import { Pathfinder } from '../src/world/Pathfinder';
import { SpatialQuery } from '../src/world/SpatialQuery';
import { TileGrid } from '../src/world/TileGrid';

/**
 * FRAME-AWARE PERCEPTION (the "he stops attacking when I set sail" regression): reaction-lagged aim memory
 * must lag RELATIVE motion, not world translation — two bodies riding the same sailing deck are mutually
 * still, so the aim never trails the ship. Pre-fix, the perceived point fell shipSpeed×reaction behind the
 * seated pilot and the strike gate (dist to PERCEIVED ≤ strike) never opened: adjacent, staring, not swinging.
 */

const SIM = 1 / 60;

function harness(): { world: World; ships: ShipSystem; move: MovementSystem; ctx: AIContext } {
  const g = new TileGrid(40, 40);
  g.tiles = Array.from({ length: 40 }, () => Array.from({ length: 40 }, () => 0 /* TERRAIN.water */));
  const world = new World();
  const collision = new Collision(g);
  const abilities = new AbilitySystem(world, new EffectSystem(world), {} as StrikeResolver, new Rng(7)); // strikes stubbed: the assertion is the SWING starting, contact never resolves here
  const ctx: AIContext = { world, query: new SpatialQuery(world), rng: new Rng(11), abilities, pathfinder: new Pathfinder(g) };
  return { world, ships: new ShipSystem(world, collision), move: new MovementSystem(world, collision), ctx };
}

function rider(world: World, faction: FactionId, shipId: number, lx: number, ly: number, angle = 0): Entity {
  const e = world.create({
    transform: { x: 0, y: 0, angle, r: 11 },
    mover: { vx: 0, vy: 0, speed: 95, mass: 1, mode: 'foot', dodgeT: 0, dvx: 0, dvy: 0 },
    health: { hp: 100, maxHp: 100, dead: false, hitFlash: 0, iframes: 0 },
    combatant: { stam: 200, maxStam: 200, combo: 0, comboT: 0, posture: 0, maxPosture: 20 },
    tags: new TagSet(),
    effects: { active: [], seq: 0 },
    faction: { id: faction },
    loadout: { granted: new Set([BASE_KIT.primary]), innate: [BASE_KIT.primary], cd: new Map(), cdMax: new Map(), primary: BASE_KIT.primary, heavy: '', dash: '', slots: [] },
  });
  e.onDeck = { shipId, lx, ly };
  return e;
}

it('a bandit keeps ATTACKING a seated pilot while the ship SAILS (same-deck aim must not trail the ship)', () => {
  const { world, ships, move, ctx } = harness();
  const ship = world.create({
    transform: { x: 500, y: 500, angle: 0, r: 56 },
    ship: { hull: 'ship.sloop', mode: 'exploration', anchored: false, speed: 0, throttle: 0 },
  });
  const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
  const helm = helmSpot(grid);
  const pilot = rider(world, 'straw_hat', ship.id, helm.lx, helm.ly); // seated at the wheel, standing still
  // the bandit stands one body AHEAD of the pilot along the ship's motion (+x): pre-fix the perceived point
  // trails BEHIND the pilot, so the bandit-to-perceived distance GROWS past strike range — the failing geometry
  const bandit = rider(world, 'bandits', ship.id, helm.lx + 24, helm.ly, Math.PI); // facing the pilot (west)
  ships.update(SIM); // settle parenting so both have world transforms
  bandit.ai = {
    brain: actorBrain,
    bb: {
      state: 'chase',
      profile: AIProfiles.get('ai.rusher'),
      home: { x: bandit.transform!.x, y: bandit.transform!.y }, // his post is where he stands (leash stays slack)
      canSprint: false,
      wanderT: 0,
      lastSeenX: pilot.transform!.x,
      lastSeenY: pilot.transform!.y,
      lostT: 0,
      quarryId: pilot.id,
    },
  };

  let swung = false;
  for (let i = 0; i < 180 && !swung; i++) {
    ship.transform!.x += 240 * SIM; // full sail (~4 tiles/s of pure frame translation, nobody walks) — fast enough that the pre-fix aim trail (speed×reaction ≈ 43px) clearly exceeds strike range, so this test has real teeth
    ships.update(SIM); // parenting rides both bodies along
    actorBrain.think(bandit, ctx, SIM);
    move.update(SIM);
    ctx.abilities.update(SIM);
    swung ||= bandit.melee !== undefined; // the swing STARTING is the whole assertion
  }
  expect(swung).toBe(true); // adjacent + visible + in reach ⇒ he fights; sailing must not turn him into a statue
});
