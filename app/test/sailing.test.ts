import { describe, expect, it } from 'vitest';
import { ShipHulls, validateHull } from '../src/defs/ships';
import type { Entity } from '../src/ecs/components';
import { World } from '../src/ecs/World';
import { ShipSystem } from '../src/systems/ShipSystem';
import { WindSystem } from '../src/systems/WindSystem';
import { Collision } from '../src/world/Collision';
import { TileGrid } from '../src/world/TileGrid';

/**
 * SAILING core (SAILING.md pieces #2–#5): momentum with drift, points of sail on SAIL STATES (the set
 * canvas replaces throttle-as-gas), apparent wind via the strength term (the polar curve stays true-wind
 * indexed — EDGE_CASES' double-count trap), the real anchor. The wind is FROZEN per test (dir/strength are
 * the cached sample; update() is never called) so geometry is exact.
 */

const SIM = 1 / 60;

function sea(): { world: World; ships: ShipSystem; wind: WindSystem } {
  const g = new TileGrid(80, 80);
  g.tiles = Array.from({ length: 80 }, () => Array.from({ length: 80 }, () => 0 /* TERRAIN.water */));
  const world = new World();
  const wind = new WindSystem(1);
  wind.dir = 0; // frozen: blows TOWARD +x, so the SOURCE is at π (face west = dead upwind)
  wind.strength = 1;
  return { world, ships: new ShipSystem(world, new Collision(g), wind), wind };
}

function boat(world: World, hull: string, angle: number, sail: 'furled' | 'quarter' | 'half' | 'full' = 'full'): Entity {
  return world.create({
    // start mid-map: a full test run must stay INSIDE the world bounds (Collision clamps at the edge and
    // the ran-aground rule zeroes the velocity — an early draft sailed out past x≈2000 and read 0)
    transform: { x: 600, y: 600, angle, r: ShipHulls.get(hull).r },
    ship: { hull, mode: 'exploration', sail, anchor: 'up', anchorT: 0, back: 0, lash: false, helmOrder: 0, rudder: 0, yaw: 0, speed: 0, vx: 0, vy: 0 },
  });
}

function run(ships: ShipSystem, ticks: number): void {
  for (let i = 0; i < ticks; i++) ships.update(SIM);
}
const spd = (e: Entity): number => Math.hypot(e.ship!.vx, e.ship!.vy);

describe('momentum with drift — the velocity vector lags the heading (no go-kart snap)', () => {
  it('a hard 90° turn keeps the hull carrying its OLD direction, then velocity eases onto the new bow', () => {
    const { world, ships } = sea();
    const b = boat(world, 'ship.rowboat', 0); // rowboat east at full oar (flat rig isolates pure drift)
    run(ships, 300); // 5s — thrust ramps (accel 70) and velocity converges onto the heading
    expect(b.ship!.vx).toBeGreaterThan(110); // sanity: moving east at ~full speed
    b.transform!.angle = -Math.PI / 2; // helm hard over: bow now points NORTH (−y), instantly
    ships.update(SIM);
    expect(b.ship!.vx).toBeGreaterThan(80); // one tick later the mass still carries EAST…
    expect(Math.abs(b.ship!.vy)).toBeLessThan(32); // …barely moving north yet: the carve, not a snap
    run(ships, 120); // 2s of easing (≈7τ for the rowboat) — stays in bounds
    expect(b.ship!.vy).toBeLessThan(-110); // now sailing north…
    expect(Math.abs(b.ship!.vx)).toBeLessThan(10); // …with the eastward momentum bled away
  });

  it('driftEase is the mass feel: a galleon holds its old line through a turn far longer than a rowboat', () => {
    const { world, ships } = sea();
    const light = boat(world, 'ship.rowboat', 0); // driftEase 3.5
    const heavy = boat(world, 'ship.caravel', 0); // driftEase 1.2 — 200 tons of oak
    heavy.transform!.y = 1400; // apart, irrelevant here (no ship-ship collision yet — SAILING.md impacts)
    run(ships, 300); // both converge (galleon on a dead run reaches its apparent-limited pace)
    light.transform!.angle = -Math.PI / 2;
    heavy.transform!.angle = -Math.PI / 2;
    run(ships, 30); // half a second into the turn
    // alignment with the NEW heading (unit dot): the light hull answers the helm first
    const align = (e: Entity): number => -e.ship!.vy / spd(e);
    expect(align(light)).toBeGreaterThan(align(heavy) + 0.2); // clearly separated feels, not a rounding artifact
  });
});

describe('points of sail on SAIL STATES — the set canvas is the speed control', () => {
  it('IN IRONS is a DELAY, not a prison: she stalls to sternway, then the bow pays off and the canvas refills on its own', () => {
    const { world, ships } = sea();
    const b = boat(world, 'ship.sloop', Math.PI); // bow dead into the wind's source
    b.transform!.x = 1600; // the recovery leg sails northwest for ~35s — start deep in the southeast sea
    b.transform!.y = 1800;
    b.ship!.speed = 160; // came in with way on
    run(ships, 300); // 5s: the no-go collapses her — nothing left but windage STERNWAY (blown backward)
    expect(spd(b)).toBeLessThan(25); // stalled (terminal sternway ≈ WINDAGE/driftEase, not a hard 0)
    run(ships, 2400); // 40s hands-off: FALL-OFF walks the bow off the eye until she carries steerage way
    // recovers to a ~30%-of-rating cruise (the bow stops paying off once flow returns — physics hands you
    // STEERAGE, not a free full-speed sail; from here the wheel works and the escape is yours to finish)
    expect(spd(b)).toBeGreaterThan(40);
  });

  it('a beam reach makes her full rated speed (apparent wind FRESHENS across the wind, never caps it)', () => {
    const { world, ships } = sea();
    const b = boat(world, 'ship.sloop', Math.PI / 2); // 90° off the source — her best point of sail
    run(ships, 300);
    expect(spd(b)).toBeGreaterThan(150); // curve 1 → maxSpeed means maxSpeed
  });

  it('the POLAR has a shape: close-hauled (45° off) is clearly slower than a beam reach — the apparent term is CLAMPED at true strength', () => {
    // the double-count regression (the developer's audit): un-clamped, self-made wind inflated the term
    // ~1.5× across the wind and a beat matched a reach — the curve's shape must survive to the water
    const { world, ships } = sea();
    const close = boat(world, 'ship.sloop', (Math.PI * 3) / 4); // 45° off the western source
    close.ship!.speed = 90; // way on from tick 0 — below steerage flow, FALL-OFF would rotate an unpiloted bow
    close.ship!.vx = Math.cos((Math.PI * 3) / 4) * 90;
    close.ship!.vy = Math.sin((Math.PI * 3) / 4) * 90;
    const beam = boat(world, 'ship.sloop', Math.PI / 2);
    beam.transform!.x = 1400; // apart (no ship-ship collision yet)
    run(ships, 300);
    expect(spd(close)).toBeGreaterThan(80); // curve 0.6 × clamped term 1 × 160 ≈ 96…
    expect(spd(close)).toBeLessThan(110);
    expect(spd(beam) - spd(close)).toBeGreaterThan(40); // …and the reach is unmistakably faster (the diamond)
  });

  it('a DEAD RUN self-limits: you cannot outrun your own wind (apparent strength, not a cap)', () => {
    const { world, ships } = sea();
    const b = boat(world, 'ship.sloop', 0); // dead downwind (heading = the direction the wind blows toward)
    run(ships, 480); // 8s to equilibrium
    // naive (no apparent term) would be curve(180°)=0.75 × 160 = 120; the apparent term settles it near
    // v = 120·(208−v)/208 ≈ 76 — strictly and clearly below naive, well above a stall
    expect(spd(b)).toBeGreaterThan(56);
    expect(spd(b)).toBeLessThan(96);
  });

  it('OARS are wind-immune: the rowboat rows dead upwind at full pace (rig data, not a special case)', () => {
    const { world, ships } = sea();
    const b = boat(world, 'ship.rowboat', Math.PI); // straight into the wind — oars don't care
    b.transform!.x = 1400; // rowing WEST: start far enough east that the run stays inside the world bounds
    run(ships, 300);
    expect(spd(b)).toBeGreaterThan(105); // windage shaves an upwind row — the hull catches wind even if the oars ignore it
  });

  it('sail state is a SHIP fact: the canvas stays set and she keeps sailing with nobody at the wheel', () => {
    const { world, ships } = sea();
    const b = boat(world, 'ship.sloop', Math.PI / 2, 'half'); // battle sails set, then hands off
    run(ships, 300);
    const half = spd(b);
    expect(half).toBeGreaterThan(160 * 0.55 * 0.8); // cruising unpiloted at roughly the half-sail fraction
    expect(half).toBeLessThan(160 * 0.55 * 1.3);
  });

  it('QUARTER sail is the docking crawl: a beam reach holds near a quarter of the rating, rudder alive', () => {
    const { world, ships } = sea();
    const b = boat(world, 'ship.sloop', Math.PI / 2, 'quarter'); // the parking/battle-approach rung
    run(ships, 300);
    const q = spd(b);
    expect(q).toBeGreaterThan(160 * 0.25 * 0.8); // enough way for steerage…
    expect(q).toBeLessThan(160 * 0.25 * 1.4); // …but unmistakably a crawl (apparent freshening included)
  });

  it('BACKING (S at furled) reverses an oar hull per HELD tick — release the wheel and no ghost throttle survives', () => {
    const { world, ships } = sea();
    const row = boat(world, 'ship.rowboat', Math.PI, 'furled');
    row.transform!.x = 700;
    const helm = world.create({ transform: { x: 0, y: 0, angle: 0, r: 8 }, mover: { vx: 0, vy: 0, speed: 0, mass: 1, mode: 'foot', dodgeT: 0, dvx: 0, dvy: 0 } });
    helm.onDeck = { shipId: row.id, lx: 0, ly: 0 };
    for (let i = 0; i < 300; i++) {
      ships.pilot(helm, -1, 0, SIM); // the HELD S — backing is a per-tick order, consumed like helmOrder
      ships.update(SIM);
    }
    expect(row.ship!.vx).toBeGreaterThan(24); // facing west, backing EAST at reverseFrac pace
    run(ships, 300); // hands OFF the wheel: the order must die with the hand (the canon review's ghost-throttle catch)
    expect(row.ship!.back).toBe(0);
    expect(row.ship!.vx).toBeLessThan(15); // way off — only windage's downwind trickle remains, not the reverse
    expect(ShipHulls.get('ship.sloop').reverseFrac).toBe(0); // the rig can't back — its escape is steerage
  });

  it('the in-irons ESCAPE LADDER holds for a sail rig: bare steerage turns her off the wind and she fills', () => {
    // EDGE_CASES' softlock ladder: dead upwind → thrust 0 → flow 0 → no rudder. reverseFrac is 0 on rigs,
    // so the data escape is minTurnFrac (bare steerage) — prove the ladder has a bottom rung.
    const { world, ships } = sea();
    const b = boat(world, 'ship.sloop', Math.PI);
    const helm = world.create({ transform: { x: 0, y: 0, angle: 0, r: 8 }, mover: { vx: 0, vy: 0, speed: 0, mass: 1, mode: 'foot', dodgeT: 0, dvx: 0, dvy: 0 } });
    helm.onDeck = { shipId: b.id, lx: 0, ly: 0 };
    run(ships, 240); // 4s: fully in irons, v ≈ 0
    expect(spd(b)).toBeLessThan(25); // stalled to sternway (windage — no longer a hard stop)
    for (let i = 0; i < 360; i++) {
      ships.pilot(helm, 0, 1, SIM); // helm hard over on bare steerage…
      ships.update(SIM);
    }
    expect(spd(b)).toBeGreaterThan(30); // …she fell off the wind and the canvas filled — never softlocked
  });
});

describe('the strength ENVELOPE — 1.0 is a reference, not a cap: Calm Belt 0 and storm >1 are legal values', () => {
  it('CALM BELT (strength 0): a cruising sail hull decays to a stop — no bow-wind self-sustain', () => {
    const { world, ships, wind } = sea();
    const rig = boat(world, 'ship.sloop', Math.PI / 2); // beam reach, full canvas
    rig.transform!.y = 300; // 25s of southing ahead — start at the north shore (the world-edge gotcha)
    run(ships, 300);
    const cruise = spd(rig);
    expect(cruise).toBeGreaterThan(145); // sanity: she was sailing before the calm
    wind.strength = 0; // the Calm Belt drops
    run(ships, 600);
    const s1 = spd(rig);
    run(ships, 600);
    const s2 = spd(rig);
    // the zero-wind trap (EDGE_CASES): the apparent term reads the hull's OWN speed in a calm — the decay
    // must keep SHRINKING (or already be dead), never plateau where she motors on her own bow-wind
    expect(s1).toBeLessThan(cruise * 0.6);
    expect(s2).toBeLessThan(Math.max(s1 * 0.7, 5));
  });

  it('CALM BELT means nothing to oars: the rowboat rows through zero wind at full pace', () => {
    const { world, ships, wind } = sea();
    wind.strength = 0;
    const row = boat(world, 'ship.rowboat', Math.PI / 2);
    run(ships, 300);
    expect(spd(row)).toBeGreaterThan(112); // human power — the rig field is what makes the belt a SAIL trap
  });

  it('STORM (strength 2): wind beyond the reference cannot push a hull past its rating — the rig is the cap', () => {
    const { world, ships, wind } = sea();
    wind.strength = 2; // double the reference breeze — storm territory
    const b = boat(world, 'ship.sloop', Math.PI / 2); // beam reach, curve 1
    b.transform!.y = 300; // ~8s of southing — start at the north shore
    run(ships, 480);
    expect(spd(b)).toBeGreaterThan(150); // pinned at the top of her rating…
    expect(spd(b)).toBeLessThanOrEqual(170); // …but never meaningfully past it: the rig caps thrust at the rating; the small surplus is storm WINDAGE on the hull, not sail power
  });

  it('the validator refuses a sail hull rated faster than WIND_REF (the perpetual-motion data trap)', () => {
    // probe the exported validator directly — registering a poison row would break the shared singleton
    const racer = { ...ShipHulls.get('ship.sloop'), id: 'ship.stormRacer', maxSpeed: 300 };
    expect(validateHull(racer)).toMatch(/self-sustains in zero wind/);
    expect(validateHull(ShipHulls.get('ship.sloop'))).toBeNull(); // the real rows stay clean
  });
});

describe('the LASHED wheel — tie the rudder, walk away', () => {
  it('lashed holds the turn with NOBODY at the wheel; unlashed self-centers and she straightens out', () => {
    const { world, ships } = sea();
    const lashed = boat(world, 'ship.sloop', 0);
    const free = boat(world, 'ship.sloop', 0);
    free.transform!.y = 1400; // apart (no ship-ship collision yet)
    run(ships, 300); // both under way east
    lashed.ship!.rudder = 0.6; // helm over…
    lashed.ship!.lash = true; // …and TIED there (R at the wheel)
    free.ship!.rudder = 0.6; // same helm, NOT tied
    run(ships, 300); // 5s, hands off both wheels
    expect(lashed.ship!.rudder).toBeCloseTo(0.6, 5); // the rope holds the deflection exactly
    expect(free.ship!.rudder).toBe(0); // the midships fiction eased this one back
    expect(Math.abs(lashed.ship!.yaw)).toBeGreaterThan(0.1); // she is STILL swinging…
    expect(Math.abs(free.ship!.yaw)).toBeLessThan(0.02); // …while the free wheel runs true again
  });

  it('a HELD turn never unties the lash (you lash WHILE holding the wheel) — only the fresh-grab edge does', () => {
    // the R-during-A/D report: pilot() ran after toggleLash in the same tick and its held turn untied the
    // brand-new lash. Untying is an input EDGE (unlash(), fired by the input layer on released→pressed).
    const { world, ships } = sea();
    const b = boat(world, 'ship.sloop', 0);
    const helm = world.create({ transform: { x: 0, y: 0, angle: 0, r: 8 }, mover: { vx: 0, vy: 0, speed: 0, mass: 1, mode: 'foot', dodgeT: 0, dvx: 0, dvy: 0 } });
    helm.onDeck = { shipId: b.id, lx: 0, ly: 0 };
    run(ships, 120);
    b.ship!.rudder = 0.5;
    b.ship!.lash = true;
    for (let i = 0; i < 60; i++) {
      ships.pilot(helm, 0, 1, SIM); // the hold that accompanied the lash — orders land but the rope holds
      ships.update(SIM);
    }
    expect(b.ship!.lash).toBe(true);
    expect(b.ship!.rudder).toBeCloseTo(0.5, 5); // tied exactly where lashed
    ships.unlash(helm); // the fresh-grab edge, as the input layer fires it
    expect(b.ship!.lash).toBe(false);
  });
});

describe('the REAL anchor — up | dropped | weighing', () => {
  it('dropping at speed BITES: the hull stops in about a second, not a coast', () => {
    const { world, ships } = sea();
    const b = boat(world, 'ship.sloop', Math.PI / 2);
    run(ships, 300); // full pace on a beam reach
    expect(spd(b)).toBeGreaterThan(150);
    b.ship!.anchor = 'dropped';
    run(ships, 60); // one second on the hook
    expect(spd(b)).toBeLessThan(20); // bitten, not coasting (driftEase alone would take far longer)
  });

  it('an anchored hull cannot thrust, and WEIGHING takes its beat before way returns', () => {
    const { world, ships } = sea();
    const b = boat(world, 'ship.sloop', Math.PI / 2);
    b.ship!.anchor = 'dropped';
    run(ships, 300); // full sail set the whole time — the hook wins
    expect(spd(b)).toBeLessThan(2);
    b.ship!.anchor = 'weighing';
    b.ship!.anchorT = 1.2;
    run(ships, 30); // half a second: still hauling
    expect(b.ship!.anchor).toBe('weighing');
    expect(spd(b)).toBeLessThan(10);
    run(ships, 60); // the beat passes → 'up' → the canvas pulls again
    expect(b.ship!.anchor).toBe('up');
    run(ships, 240);
    expect(spd(b)).toBeGreaterThan(120);
  });

  it('an anchored ship at REST cannot be steered in place — the steerage floor is for irons, not the hook', () => {
    // the pirouette bug (the developer's question): minTurnFrac let a hooked, motionless hull slowly spin
    // under held rudder. At anchor the floor is 0; only real water flow (the anchor-turn) moves the bow.
    const { world, ships } = sea();
    const b = boat(world, 'ship.sloop', Math.PI / 2, 'furled');
    const helm = world.create({ transform: { x: 0, y: 0, angle: 0, r: 8 }, mover: { vx: 0, vy: 0, speed: 0, mass: 1, mode: 'foot', dodgeT: 0, dvx: 0, dvy: 0 } });
    helm.onDeck = { shipId: b.id, lx: 0, ly: 0 };
    b.ship!.anchor = 'dropped';
    run(ships, 60); // settled on the hook, dead in the water
    const a0 = b.transform!.angle;
    for (let i = 0; i < 300; i++) {
      ships.pilot(helm, 0, 1, SIM); // helm hard over for 5s…
      ships.update(SIM);
    }
    expect(Math.abs(b.transform!.angle - a0)).toBeLessThan(0.02); // …and she does not budge
  });

  it('the ANCHOR-TURN: dropped with way on, the rudder pivots the hull around the hook', () => {
    const { world, ships } = sea();
    const mk = (): { b: Entity; helm: Entity } => {
      const b = boat(world, 'ship.sloop', Math.PI / 2);
      const helm = world.create({ transform: { x: 0, y: 0, angle: 0, r: 8 }, mover: { vx: 0, vy: 0, speed: 0, mass: 1, mode: 'foot', dodgeT: 0, dvx: 0, dvy: 0 } });
      helm.onDeck = { shipId: b.id, lx: 0, ly: 0 };
      return { b, helm };
    };
    const drop = mk();
    const free = mk();
    free.b.transform!.x = 1500;
    run(ships, 300); // both at full pace south
    drop.b.ship!.anchor = 'dropped';
    const a0drop = drop.b.transform!.angle;
    const a0free = free.b.transform!.angle;
    for (let i = 0; i < 20; i++) {
      ships.pilot(drop.helm, 0, 1, SIM); // both helms hard over for a third of a second, way still on
      ships.pilot(free.helm, 0, 1, SIM);
      ships.update(SIM);
    }
    const swungDrop = Math.abs(drop.b.transform!.angle - a0drop);
    const swungFree = Math.abs(free.b.transform!.angle - a0free);
    // the brake bleeds flow DURING the swing, diluting the 2.5× rudder to ~1.75× over the window — still
    // unmistakably a pivot vs a carve; the felt drama is ANCHOR_TURN_MULT's knob, not this floor's
    expect(swungDrop).toBeGreaterThan(swungFree * 1.5);
  });
});
