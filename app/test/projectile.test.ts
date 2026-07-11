import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/Rng';
import { TERRAIN } from '../src/defs/terrains';
import type { Entity, FactionId } from '../src/ecs/components';
import { World } from '../src/ecs/World';
import { Abilities } from '../src/combat/Ability';
import { AIProfiles } from '../src/defs/aiProfiles';
import { Spawner } from '../src/ecs/Spawner';
import { Units } from '../src/defs/units';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { CombatantSystem } from '../src/systems/CombatantSystem';
import { Damage } from '../src/systems/Damage';
import { EffectSystem } from '../src/systems/EffectSystem';
import { MeleeSystem } from '../src/systems/MeleeSystem';
import { ProjectileSystem } from '../src/systems/ProjectileSystem';
import { StrikeResolver } from '../src/systems/StrikeResolver';
import { StatBlock } from '../src/combat/StatBlock';
import { Collision } from '../src/world/Collision';
import { placeStructure } from '../src/world/StructureIndex';
import { TileGrid } from '../src/world/TileGrid';

/**
 * The TRAVELLING-shot substrate (docs DESIGN_BACKLOG #19): a musket ball is its own entity that moves each
 * tick and resolves on a SWEPT contact test — so it can be dodged, a wall stops it (physical cover for free),
 * and a fast ball can't tunnel past a body/wall between ticks. The hit itself goes through the SAME
 * StrikeResolver a melee contact uses, so guard/faction/ally rules apply with no duplicated combat code.
 */

const T = 32;
function grassGrid(w = 30, h = 30): TileGrid {
  const g = new TileGrid(w, h);
  g.tiles = Array.from({ length: h }, () => Array.from({ length: w }, () => TERRAIN.grass));
  return g;
}

function sysFor(world: World, g: TileGrid, rng = new Rng(1)): ProjectileSystem {
  const strikes = new StrikeResolver(new Damage(), new Rng(1));
  return new ProjectileSystem(world, strikes, new Collision(g), rng); // rng = the close-range pass-through roll
}

/** A minimal combat body — faction + health + attributes so StrikeResolver can land a hit on it. */
function body(world: World, x: number, y: number, faction: FactionId, hp = 50): Entity {
  return world.create({
    transform: { x, y, angle: 0, r: 11 },
    health: { hp, maxHp: hp, dead: false, hitFlash: 0, iframes: 0 },
    faction: { id: faction },
    attributes: new StatBlock({ atk: 10, atkSpeed: 1 }), // atkSpeed 1: unset reads as 0 → Math.max(0.1,0) inflates cooldowns 10× (real units get it at spawn)
    combatant: { stam: 100, maxStam: 100, combo: 0, comboT: 0, stunT: 0, posture: 0, maxPosture: 100, blocking: false, parryT: 0 },
  });
}

/** A shot in flight, owned by `owner`, aimed +x at `speed` px/s with `life` seconds aloft. `passChance` (baked
 *  at fire time in the real path) is the close-range fumble probability rolled on body contact. */
function shot(world: World, owner: Entity, x: number, y: number, speed: number, life = 2, passChance = 0): Entity {
  return world.create({
    transform: { x, y, angle: 0, r: 2 },
    projectile: { owner: owner.id, ability: 'ability.musketShot', vx: speed, vy: 0, life, hit: [], passChance },
  });
}

describe('projectile travel + expiry', () => {
  it('a shot advances along its velocity each tick', () => {
    const world = new World();
    const g = grassGrid();
    const owner = body(world, 5 * T, 5 * T, 'straw_hat');
    const b = shot(world, owner, 8 * T, 5 * T, 600);
    sysFor(world, g).update(1 / 60);
    expect(b.transform!.x).toBeCloseTo(8 * T + 600 / 60, 3); // moved forward exactly speed·dt
    expect(world.byId(b.id)).toBeDefined(); // still alive (nothing hit, range not spent)
  });

  it('a shot despawns when its life runs out (spent its range, hit nothing)', () => {
    const world = new World();
    const g = grassGrid();
    const owner = body(world, 5 * T, 5 * T, 'straw_hat');
    const b = shot(world, owner, 8 * T, 5 * T, 600, 0.005); // ~0.3 ticks of life
    sysFor(world, g).update(1 / 60);
    expect(world.byId(b.id)).toBeUndefined(); // fizzled at range
  });
});

describe('contact resolution (swept, through StrikeResolver)', () => {
  it('hits a hostile in its path and damages it, then despawns', () => {
    const world = new World();
    const g = grassGrid();
    const owner = body(world, 5 * T, 5 * T, 'straw_hat');
    const foe = body(world, 5 * T + 40, 5 * T, 'bandits'); // 40px east, in the lane
    const b = shot(world, owner, 5 * T, 5 * T, 600);
    sysFor(world, g).update(1 / 60); // 600/60 = 10px/tick — sweep still catches the foe 40px out over enough ticks
    for (let i = 0; i < 6 && world.byId(b.id); i++) sysFor(world, g).update(1 / 60);
    expect(foe.health!.hp).toBeLessThan(50); // took the hit (atk 10 + flat 14 = 24)
    expect(world.byId(b.id)).toBeUndefined(); // the ball is spent on contact
  });

  it('does NOT hit an ALLY in its path (the harm predicate — the Moat)', () => {
    const world = new World();
    const g = grassGrid();
    const owner = body(world, 5 * T, 5 * T, 'straw_hat');
    const ally = body(world, 5 * T + 40, 5 * T, 'straw_hat'); // same faction
    const b = shot(world, owner, 5 * T, 5 * T, 600);
    for (let i = 0; i < 8 && world.byId(b.id); i++) sysFor(world, g).update(1 / 60);
    expect(ally.health!.hp).toBe(50); // untouched — the ball flew through a friend
  });

  it('does not tunnel: a FAST ball still hits a body it crosses within one tick', () => {
    const world = new World();
    const g = grassGrid();
    const owner = body(world, 5 * T, 5 * T, 'straw_hat');
    const foe = body(world, 5 * T + 30, 5 * T, 'bandits'); // 30px out
    // speed 3000 px/s → 50px in one tick, LEAPING PAST the 30px-out foe if the test were point-sampled
    const b = shot(world, owner, 5 * T, 5 * T, 3000);
    sysFor(world, g).update(1 / 60);
    expect(foe.health!.hp).toBeLessThan(50); // the SWEEP caught it mid-flight
    expect(world.byId(b.id)).toBeUndefined();
  });
});

describe('close-range pass-through (a point-blank shot can FUMBLE — phase through, reload still spent)', () => {
  it('a shot with a CERTAIN pass rolls THROUGH the body it strikes (no damage) and keeps flying', () => {
    const world = new World();
    const g = grassGrid();
    const owner = body(world, 5 * T, 5 * T, 'straw_hat');
    const foe = body(world, 5 * T + 40, 5 * T, 'bandits');
    const b = shot(world, owner, 5 * T, 5 * T, 600, 2, 1); // passChance 1 = always fumble
    for (let i = 0; i < 8 && world.byId(b.id); i++) sysFor(world, g).update(1 / 60);
    expect(foe.health!.hp).toBe(50); // untouched — the ball phased THROUGH
    // it either flew off the far edge or fizzled at range, but it did NOT deal damage — the reload's still gone
  });

  it('with NO pass chance (the default) it ALWAYS connects — no accidental phasing', () => {
    const world = new World();
    const g = grassGrid();
    const owner = body(world, 5 * T, 5 * T, 'straw_hat');
    const foe = body(world, 5 * T + 40, 5 * T, 'bandits');
    const b = shot(world, owner, 5 * T, 5 * T, 600); // passChance defaults to 0
    for (let i = 0; i < 8 && world.byId(b.id); i++) sysFor(world, g).update(1 / 60);
    expect(foe.health!.hp).toBeLessThan(50); // a normal-range shot always lands
  });
});

describe('close-range pass baked at FIRE time (AbilitySystem.closePass — distance to the nearest hostile)', () => {
  function musketeer(world: World, x: number, y: number): Entity {
    const e = body(world, x, y, 'straw_hat');
    e.mover = { vx: 0, vy: 0, speed: 100, mass: 1, mode: 'foot', dodgeT: 0, dvx: 0, dvy: 0 }; // the shot-swing update needs a mover
    e.loadout = { granted: new Set(['ability.musketShot']), cd: new Map(), cdMax: new Map(), primary: 'ability.musketShot', heavy: '', dash: '', slots: [] };
    return e;
  }
  function fire(world: World): Entity | undefined {
    const abilities = new AbilitySystem(world, new EffectSystem(world), new StrikeResolver(new Damage(), new Rng(1)), new Rng(1));
    const melee = new MeleeSystem(world, new StrikeResolver(new Damage(), new Rng(1)));
    const shooter = [...world.with('loadout')][0];
    abilities.activate(shooter, 'ability.musketShot');
    for (let i = 0; i < 40 && ![...world.with('projectile')].length; i++) { melee.update(1 / 60); abilities.update(1 / 60); } // spawn at the active cue
    return [...world.with('projectile')][0];
  }

  it('a shot fired POINT-BLANK bakes a HIGH pass chance (the barrel can’t bear on a body in your face)', () => {
    const world = new World();
    musketeer(world, 5 * T, 5 * T);
    body(world, 5 * T + 12, 5 * T, 'bandits'); // ~1px surface gap — deep inside closePassRange (44px)
    const ball = fire(world);
    expect(ball!.projectile.passChance!).toBeGreaterThan(0.3); // steeply high this close (peak 0.6)
  });

  it('a shot fired from RANGE bakes ZERO pass chance (a clean bead — nobody point-blank)', () => {
    const world = new World();
    musketeer(world, 5 * T, 5 * T);
    body(world, 5 * T + 120, 5 * T, 'bandits'); // well beyond closePassRange
    const ball = fire(world);
    expect(ball!.projectile.passChance).toBe(0); // no fumble risk at range
  });

  it('an ALLY in your face does NOT raise the pass chance (only harmable bodies count)', () => {
    const world = new World();
    musketeer(world, 5 * T, 5 * T);
    body(world, 5 * T + 12, 5 * T, 'straw_hat'); // same faction, point-blank
    const ball = fire(world);
    expect(ball!.projectile.passChance).toBe(0); // a friend hugging you doesn't make you fumble
  });
});

describe('walls + physical cover', () => {
  it('a TALL structure stops the ball (a wall between shooter and target eats the round)', () => {
    const world = new World();
    const g = grassGrid();
    placeStructure(new World(), g.structures, 'structure.wall', 8, 5); // wall cell at tile (8,5) = x∈[256,288]
    const owner = body(world, 5 * T, 5 * T, 'straw_hat');
    const foe = body(world, 12 * T, 5 * T, 'bandits'); // BEHIND the wall (east of it)
    const b = shot(world, owner, 5 * T, 5 * T, 600);
    for (let i = 0; i < 40 && world.byId(b.id); i++) sysFor(world, g).update(1 / 60);
    expect(foe.health!.hp).toBe(50); // never hit — the wall shielded it (cover)
    expect(world.byId(b.id)).toBeUndefined(); // the ball died at the wall
  });

  it('a LOW obstacle does NOT stop the ball (you can shoot over a stone wall / the sea)', () => {
    const world = new World();
    const g = grassGrid();
    placeStructure(new World(), g.structures, 'structure.stoneWall', 8, 5); // LOW — blocksAir false
    const owner = body(world, 5 * T, 5 * T, 'straw_hat');
    const foe = body(world, 12 * T, 5 * T, 'bandits');
    const b = shot(world, owner, 5 * T, 5 * T, 600);
    for (let i = 0; i < 40 && world.byId(b.id); i++) sysFor(world, g).update(1 / 60);
    expect(foe.health!.hp).toBeLessThan(50); // the ball flew OVER the low wall and struck the foe
  });

  it('a wall IN FRONT of a foe shields it; a foe in front of a wall gets hit (first blocker wins)', () => {
    const world = new World();
    const g = grassGrid();
    placeStructure(new World(), g.structures, 'structure.wall', 10, 5); // wall further out
    const owner = body(world, 5 * T, 5 * T, 'straw_hat');
    const near = body(world, 8 * T, 5 * T, 'bandits'); // foe BEFORE the wall — should be hit
    const b = shot(world, owner, 5 * T, 5 * T, 600);
    for (let i = 0; i < 40 && world.byId(b.id); i++) sysFor(world, g).update(1 / 60);
    expect(near.health!.hp).toBeLessThan(50); // the nearer foe eats it before the ball reaches the wall
  });
});

describe('whiff', () => {
  it('a shot down an empty lane hits nobody and expires', () => {
    const world = new World();
    const g = grassGrid();
    const owner = body(world, 5 * T, 5 * T, 'straw_hat');
    const foe = body(world, 5 * T, 12 * T, 'bandits'); // OFF the lane (south, not east)
    const b = shot(world, owner, 5 * T, 5 * T, 600, 0.3);
    while (world.byId(b.id)) sysFor(world, g).update(1 / 60);
    expect(foe.health!.hp).toBe(50); // never in the path
  });
});

describe('aim spread cone (aiming narrows, moving widens — the accuracy mechanic)', () => {
  function gunner(world: World): Entity {
    const e = body(world, 5 * T, 5 * T, 'straw_hat');
    e.equipment = { weapon: 'weapon.musket', potentials: [] };
    e.mover = { vx: 0, vy: 0, speed: 100, mass: 1, mode: 'foot', dodgeT: 0, dvx: 0, dvy: 0 };
    return e;
  }
  const settle = (sys: CombatantSystem, e: Entity, secs: number) => {
    for (let i = 0; i < Math.round(secs * 60); i++) sys.update(1 / 60);
  };

  it('AIMING while still tightens the cone; NOT aiming (hip) it stays wide', () => {
    const world = new World();
    const sys = new CombatantSystem(world);
    const aimed = gunner(world);
    aimed.combatant!.aiming = true;
    const hip = gunner(world);
    hip.combatant!.aiming = false;
    settle(sys, aimed, 1.5);
    settle(sys, hip, 1.5);
    expect(aimed.combatant!.spread!).toBeLessThan(hip.combatant!.spread!); // aiming is tighter
    expect(aimed.combatant!.spread!).toBeLessThan(0.12); // settled near the aim floor (~0.07)
  });

  it('MOVING widens the cone even while aiming (the move penalty blooms it)', () => {
    const world = new World();
    const sys = new CombatantSystem(world);
    const still = gunner(world);
    still.combatant!.aiming = true;
    const moving = gunner(world);
    moving.combatant!.aiming = true;
    moving.mover!.vx = 100; // walking
    settle(sys, still, 1.5);
    settle(sys, moving, 1.5);
    expect(moving.combatant!.spread!).toBeGreaterThan(still.combatant!.spread!); // movement blooms it wider
  });

  it('a JUMP or ROLL blooms WIDER than a walk (a flip disrupts the bead more than a step)', () => {
    const world = new World();
    const sys = new CombatantSystem(world);
    const walking = gunner(world);
    walking.combatant!.aiming = true;
    walking.mover!.vx = 100; // walking = the middle-ground penalty
    const jumping = gunner(world);
    jumping.combatant!.aiming = true;
    jumping.mover!.layer = 'air'; // mid-jump = full disruption (to hip)
    const rolling = gunner(world);
    rolling.combatant!.aiming = true;
    rolling.mover!.rollT = 0.3; // mid-roll = full disruption
    settle(sys, walking, 1.5);
    settle(sys, jumping, 1.5);
    settle(sys, rolling, 1.5);
    expect(jumping.combatant!.spread!).toBeGreaterThan(walking.combatant!.spread!); // a jump blooms MORE than a walk
    expect(rolling.combatant!.spread!).toBeGreaterThan(walking.combatant!.spread!); // so does a roll
  });

  it('blooms FAST but tightens SLOW (the asymmetry — accuracy is earned)', () => {
    const world = new World();
    const sys = new CombatantSystem(world);
    const e = gunner(world);
    e.combatant!.aiming = true;
    settle(sys, e, 2); // fully settled (tight)
    const tight = e.combatant!.spread!;
    e.mover!.vx = 100; // start moving — should bloom almost immediately
    sys.update(1 / 60);
    sys.update(1 / 60);
    const afterTwoTicks = e.combatant!.spread!;
    expect(afterTwoTicks - tight).toBeGreaterThan(0.05); // bloomed a lot in 2 ticks (fast)
  });
});

describe('the Marine Officer — the ranged musketeer unit (#19)', () => {
  it('spawns wielding the marine musket, resolving to the travelling SHOT as its primary', () => {
    const e = new Spawner(new World(), new Rng(1)).spawnUnit('unit.marineOfficer', 0, 0);
    expect(e.equipment!.weapon).toBe('weapon.marineMusket');
    const primary = Abilities.get(e.loadout!.primary);
    expect(primary.shape?.swing).toBe('shot'); // its attack is a projectile, not a melee swing
    expect(primary.shape?.shotSpeed).toBe(384); // the FASTER marine ball (12 tiles/s vs the base 8)
  });

  it("the marine AI KITES (keeps distance) and its preferred range sits INSIDE the shot's reach", () => {
    const p = AIProfiles.get(Units.get('unit.marineOfficer').aiProfile!);
    expect(p.approach).toBe('kite'); // it holds range, not a rusher
    const shotRange = Abilities.get('ability.marineMusketShot').shape!.range;
    expect(p.preferredRange!).toBeLessThan(shotRange); // it kites at a range it can actually SHOOT from
  });
});

describe('firing through AbilitySystem (the reload gate = the counterplay)', () => {
  function shooterWith(world: World, ability: string): Entity {
    const e = body(world, 5 * T, 5 * T, 'straw_hat');
    e.mover = { vx: 0, vy: 0, speed: 100, mass: 1, mode: 'foot', dodgeT: 0, dvx: 0, dvy: 0 }; // the shot-swing update needs a mover
    e.loadout = { granted: new Set([ability]), cd: new Map(), cdMax: new Map(), primary: ability, heavy: ability, dash: ability, slots: [] };
    return e;
  }

  /** Activate a shot, then tick the swing PAST its windup so the projectile(s) actually spawn — the ball leaves
   *  the barrel at the ACTIVE cue now (deferred spawn), not on activate. MeleeSystem advances the swing clock
   *  (m.t), AbilitySystem fires the spawn at the windup→active cue — both run each real tick. */
  function fireShot(world: World, abilities: AbilitySystem, shooter: Entity, ability: string): boolean {
    const ok = abilities.activate(shooter, ability);
    const melee = new MeleeSystem(world, new StrikeResolver(new Damage(), new Rng(1)));
    for (let i = 0; i < 40 && ![...world.with('projectile')].length; i++) { melee.update(1 / 60); abilities.update(1 / 60); }
    return ok;
  }

  it('activating the musket spawns a travelling projectile (not an instant hit)', () => {
    const world = new World();
    const abilities = new AbilitySystem(world, new EffectSystem(world), new StrikeResolver(new Damage(), new Rng(1)), new Rng(1));
    const shooter = shooterWith(world, 'ability.musketShot');
    expect(fireShot(world, abilities, shooter, 'ability.musketShot')).toBe(true);
    const balls = [...world.with('projectile')];
    expect(balls.length).toBe(1); // ONE ball, born from the muzzle
    expect(balls[0].projectile.owner).toBe(shooter.id);
    expect(Math.hypot(balls[0].projectile.vx, balls[0].projectile.vy)).toBeCloseTo(256, 0); // at shotSpeed (8 tiles/s)
  });

  it('BUCKSHOT fires a CONE of pellets in one trigger pull (a scatter blast, not one ball)', () => {
    const world = new World();
    const abilities = new AbilitySystem(world, new EffectSystem(world), new StrikeResolver(new Damage(), new Rng(1)), new Rng(1));
    const shooter = shooterWith(world, 'ability.marineBuckshot');
    shooter.transform!.angle = 0; // aiming +x
    expect(fireShot(world, abilities, shooter, 'ability.marineBuckshot')).toBe(true);
    const balls = [...world.with('projectile')];
    expect(balls.length).toBe(5); // the pellets (ability.marineBuckshot pellets: 5)
    // the pellets FAN across the cone: their headings span a spread, not all identical
    const angles = balls.map((b) => Math.atan2(b.projectile.vy, b.projectile.vx));
    const spread = Math.max(...angles) - Math.min(...angles);
    expect(spread).toBeGreaterThan(0.2); // a real cone (shotSpreadArc 0.24 half-angle → ~0.48 span)
    expect(spread).toBeLessThan(1.0); // but still a tight-ish blast, not omnidirectional
  });

  it('the marine musket GRANTS Buckshot on slot 0 (equip wiring, both player + AI paths)', () => {
    const e = new Spawner(new World(), new Rng(1)).spawnUnit('unit.marineOfficer', 0, 0);
    expect(e.loadout!.slots[0]).toBe('ability.marineBuckshot'); // slot 1: the signature scatter blast
    expect(e.loadout!.slots[1]).toBe('ability.marineShockKick'); // slot 2: the electric retreat kick
    expect(e.loadout!.granted.has('ability.marineBuckshot')).toBe(true); // granted (so activate() passes the gate)
    expect(e.loadout!.granted.has('ability.marineShockKick')).toBe(true);
  });

  it('firing KICKS the cone wider (recoil bloom — a rapid string sprays, paced shots stay tight)', () => {
    const world = new World();
    const abilities = new AbilitySystem(world, new EffectSystem(world), new StrikeResolver(new Damage(), new Rng(1)), new Rng(1));
    const shooter = shooterWith(world, 'ability.musketShot');
    shooter.combatant!.spread = 0.07; // settled tight
    fireShot(world, abilities, shooter, 'ability.musketShot'); // spawns at the active cue (the bloom fires WITH the ball)
    expect(shooter.combatant!.spread!).toBeGreaterThan(0.07 + 0.2); // the shot bloomed it (SPREAD_SHOT_KICK ~0.25)
  });

  it('firing RECOILS the shooter backward (a musket kicks; mass-scaled)', () => {
    const world = new World();
    const abilities = new AbilitySystem(world, new EffectSystem(world), new StrikeResolver(new Damage(), new Rng(1)), new Rng(1));
    const shooter = shooterWith(world, 'ability.musketShot');
    shooter.transform!.angle = 0; // aiming +x
    fireShot(world, abilities, shooter, 'ability.musketShot'); // recoil fires WITH the ball (the active cue)
    expect(shooter.mover!.dvx).toBeLessThan(0); // shoved BACKWARD (−x), opposite the +x aim
    expect(shooter.mover!.dodgeT).toBeGreaterThan(0); // a brief kick window
  });

  it('a SECOND shot is refused until the reload cooldown elapses (one shot, then vulnerable)', () => {
    const world = new World();
    const abilities = new AbilitySystem(world, new EffectSystem(world), new StrikeResolver(new Damage(), new Rng(1)), new Rng(1));
    const shooter = shooterWith(world, 'ability.musketShot');
    expect(fireShot(world, abilities, shooter, 'ability.musketShot')).toBe(true); // fires (spawns at the active cue)
    expect(abilities.activate(shooter, 'ability.musketShot')).toBe(false); // still reloading → refused
    expect([...world.with('projectile')].length).toBe(1); // only the first ball exists
    // tick the cooldown past the 3s reload window (abilities.update ticks only cooldowns, not stamina —
    // top that back up so THIS test isolates the reload gate, not the stamina gate). Clear the recoil swing
    // MeleeSystem would have removed by now (not run here), so the commitment gate doesn't shadow the reload.
    for (let i = 0; i < 190; i++) abilities.update(1 / 60); // 190/60 ≈ 3.17s > the 3s musketShot cooldown
    shooter.combatant!.stam = 100;
    delete shooter.melee;
    expect(abilities.activate(shooter, 'ability.musketShot')).toBe(true); // reloaded → fires again
  });
});
