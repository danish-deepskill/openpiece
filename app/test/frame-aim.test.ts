import { expect, it } from 'vitest';
import { actorBrain } from '../src/ai/brains';
import type { AIContext } from '../src/ai/Brain';
import { TagSet } from '../src/combat/TagSet';
import { Rng } from '../src/core/Rng';
import { AIProfiles } from '../src/defs/aiProfiles';
import { deckOf, gangplankCell, helmSpot } from '../src/defs/decks';
import type { FactionId } from '../src/defs/factions';
import { ShipHulls } from '../src/defs/ships';
import type { Entity } from '../src/ecs/components';
import { BASE_KIT } from '../src/defs/units';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { EffectSystem } from '../src/systems/EffectSystem';
import { HullCollisionSystem } from '../src/systems/HullCollisionSystem';
import { MovementSystem } from '../src/systems/MovementSystem';
import { ShipSystem } from '../src/systems/ShipSystem';
import { WindSystem } from '../src/systems/WindSystem';
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

function harness(seed = 11): { world: World; ships: ShipSystem; move: MovementSystem; ctx: AIContext } {
  const g = new TileGrid(120, 40); // wide, so a full-sail run never hits the world edge (grounding kills the treadmill under test)
  g.tiles = Array.from({ length: 40 }, () => Array.from({ length: 120 }, () => 0 /* TERRAIN.water */));
  const world = new World();
  const collision = new Collision(g);
  const abilities = new AbilitySystem(world, new EffectSystem(world), {} as StrikeResolver, new Rng(7)); // strikes stubbed: the assertion is the SWING starting, contact never resolves here
  const ctx: AIContext = { world, query: new SpatialQuery(world), rng: new Rng(seed), abilities, pathfinder: new Pathfinder(g) };
  return { world, ships: new ShipSystem(world, collision, new WindSystem(1)), move: new MovementSystem(world, collision), ctx };
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
    loadout: { granted: new Set([BASE_KIT.primary]), innate: [BASE_KIT.primary], cd: new Map(), cdMax: new Map(), utilities: [], primary: BASE_KIT.primary, heavy: '', dash: '', slots: [] },
  });
  e.onDeck = { shipId, lx, ly };
  return e;
}

it('a bandit keeps ATTACKING a seated pilot while the ship SAILS (same-deck aim must not trail the ship)', () => {
  const { world, ships, move, ctx } = harness();
  const ship = world.create({
    transform: { x: 500, y: 500, angle: 0, r: 56 },
    ship: { hull: 'ship.rowboat', mode: 'exploration', sail: 'furled', anchor: 'up', anchorT: 0, back: 0, lash: false, helmOrder: 0, rudder: 0, yaw: 0, speed: 0, vx: 0, vy: 0 },
  });
  const grid = deckOf('ship.rowboat', ShipHulls.get('ship.rowboat').deck);
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

it('a roam spot picked ASHORE dies on BOARDING — a world anchor must not survive into the deck frame', () => {
  // the canon-review catch: invalidation was one-directional (deck→world only). A walker who boarded
  // mid-wander-cycle kept chasing his stale WORLD spot — receding aft at sail speed — for up to a full
  // wanderT before the next pick re-anchored it. The anchor is valid ONLY in the frame it was picked in;
  // any frame change kills it for an immediate re-pick.
  const { world, ships, move, ctx } = harness(11);
  const hulls = new HullCollisionSystem(world);
  const ship = world.create({
    transform: { x: 500, y: 500, angle: 0, r: 56 },
    ship: { hull: 'ship.rowboat', mode: 'exploration', sail: 'furled', anchor: 'up', anchorT: 0, back: 0, lash: false, helmOrder: 0, rudder: 0, yaw: 0, speed: 0, vx: 0, vy: 0 },
  });
  const grid = deckOf('ship.rowboat', ShipHulls.get('ship.rowboat').deck);
  const gp = gangplankCell(grid)!;
  const leader = rider(world, 'straw_hat', ship.id, gp.lx + grid.tilePx, gp.ly);
  const f = rider(world, 'straw_hat', ship.id, gp.lx + grid.tilePx + 24, gp.ly); // in the band, on the door row
  ships.update(SIM);
  f.ai = {
    brain: actorBrain,
    bb: {
      state: 'wander',
      profile: AIProfiles.get('ai.rusher'),
      home: { x: leader.transform!.x, y: leader.transform!.y },
      followId: leader.id,
      canSprint: false,
      wanderT: 999, // mid-cycle: the timer must NOT be what saves him — the frame check has to
      lastSeenX: 0,
      lastSeenY: 0,
      lostT: 0,
    },
  };
  f.ai.bb.roamX = f.transform!.x; // the boarded-mid-cycle state: a "pause in place" spot picked ASHORE —
  f.ai.bb.roamY = f.transform!.y; // world px, roamShipId deliberately unset (the pre-boarding anchor shape)
  ship.ship!.sail = 'full'; // canvas set — the ship holds pace with nobody at the wheel (a SHIP fact)
  ship.ship!.speed = 120;
  for (let i = 0; i < 240; i++) {
    actorBrain.think(f, ctx, SIM);
    move.update(SIM);
    ships.update(SIM);
    hulls.update();
    expect(f.onDeck, `tick ${i}: treadmilled out the door chasing the stale ashore spot`).toBeDefined();
    expect(f.onDeck!.lx).toBeGreaterThan(gp.lx - grid.tilePx / 2); // never even reaches the board's outer end
  }
});

it('an idle FOLLOWER rides a sailing deck — the roam anchor must not treadmill him out the stern door', () => {
  // the report: recruit aboard, player throttles forward — the recruit "slides back toward the gangplank and
  // falls off behind". His idle-roam spot (incl. the pause-in-place variant) was a WORLD point: the ship
  // sails away from it, so walking toward it is walking AFT across the deck, and the direction-aware door
  // reads the aft-walk as an exit. The anchor must ride the deck (bb.roamShipId — the third instance of
  // goals-carry-a-frame, after homeShipId and perceivedFrame).
  // THREE seeds so the first roam pick exercises BOTH branches (amble-bubble AND pause-in-place) — the
  // pause branch is the exact repro: chasing your own last spot straight out the stern door.
  for (const seed of [7, 11, 13]) {
    const { world, ships, move, ctx } = harness(seed);
    const hulls = new HullCollisionSystem(world);
    const ship = world.create({
      transform: { x: 500, y: 500, angle: 0, r: 56 },
      ship: { hull: 'ship.rowboat', mode: 'exploration', sail: 'furled', anchor: 'up', anchorT: 0, back: 0, lash: false, helmOrder: 0, rudder: 0, yaw: 0, speed: 0, vx: 0, vy: 0 },
    });
    const grid = deckOf('ship.rowboat', ShipHulls.get('ship.rowboat').deck);
    const gp = gangplankCell(grid)!; // the sloop's door faces WEST — the stern side while sailing east
    // leader one tile INSIDE the door, follower between him and the door (ON the plank row): the geometry
    // where the pre-fix aft-slide crossed the board's outer end before the >90px heel could catch it
    const leader = rider(world, 'straw_hat', ship.id, gp.lx + grid.tilePx, gp.ly);
    const f = rider(world, 'straw_hat', ship.id, gp.lx + 8, gp.ly);
    ships.update(SIM); // settle parenting so both have world transforms
    f.ai = {
      brain: actorBrain,
      bb: {
        state: 'wander',
        profile: AIProfiles.get('ai.rusher'),
        home: { x: leader.transform!.x, y: leader.transform!.y }, // syncFollow re-derives this every tick
        followId: leader.id,
        canSprint: false,
        wanderT: 0, // pick the first roam spot on tick 1 — through the REAL pick path (the anchor under test)
        lastSeenX: 0,
        lastSeenY: 0,
        lostT: 0,
      },
    };
    ship.ship!.sail = 'full'; // canvas set: the oar hull holds ~150px/s with no pilot
    ship.ship!.speed = 120; // starts faster than his 95px/s walk — the pre-fix treadmill outruns him for sure
    for (let i = 0; i < 480; i++) {
      actorBrain.think(f, ctx, SIM);
      move.update(SIM);
      ships.update(SIM);
      hulls.update();
      expect(f.onDeck, `seed ${seed}, tick ${i}: fell off the ship`).toBeDefined();
      // never even reaches the board's outer end line — no aft-slide, just the amble bubble at the leader's side
      expect(f.onDeck!.lx).toBeGreaterThan(gp.lx - grid.tilePx / 2);
      const dl = Math.hypot(f.onDeck!.lx - leader.onDeck!.lx, f.onDeck!.ly - leader.onDeck!.ly);
      expect(dl, `seed ${seed}, tick ${i}: drifted from the leader`).toBeLessThan(130);
    }
    expect(ship.ship!.speed).toBeGreaterThan(100); // sanity: still under way (full-oar ramp lifts 120 to ~150; grounding = 0 would defang the test)
  }
});
