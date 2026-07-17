import { events } from '../core/EventBus';
import { WIND_REF } from '../config/constants';
import { deckCellAtLocal, deckOf, deckToWorld, helmSpot } from '../defs/decks';
import { angleDiff, clamp } from '../core/math';
import { sailCurveAt, ShipHulls } from '../defs/ships';
import type { Entity } from '../ecs/components';
import type { World } from '../ecs/World';
import type { Collision } from '../world/Collision';
import type { WindSystem } from './WindSystem';

/**
 * Moves ships (heading + SAIL STATES + wind + momentum, water-only collision), runs the anchor state machine,
 * PARENTS on-deck actors to the deck (world = ship ∘ local), and applies helm input (pilot/stepSail/
 * toggleAnchor/atHelm). Boarding/leaving is NOT here: frame
 * transitions live in world/frames.ts and fire from MovementSystem (walk-offs) + HullCollisionSystem (walk-ons) —
 * you board by WALKING aboard, not by a verb. Naval combat (cannons, battle mode) is deferred; the data model
 * (Ship.mode, cannonSlots) is already in place for it.
 *
 * KNOWN GAP (deliberate, recorded): recruited CREW don't yet follow you aboard — that arrives with crew-AI
 * (walkable-ship step 5), where they PATH to the gangplank and cross it like anyone else, instead of the old
 * teleport-into-seats. Until then only actors that physically walk/jump aboard are on deck.
 */
/** Speed fraction per sail state — quarter = the docking/steerage crawl (rudder alive, parking pace);
 *  half = "battle sails" (canvas kept for maneuver, not pace). */
const SAIL_AMOUNT = { furled: 0, quarter: 0.25, half: 0.55, full: 1 } as const;
/** Hauling the anchor up takes a beat (s) — instant-ish solo now, a crew capstan JOB when crew lands. */
const ANCHOR_WEIGH_T = 1.2;
/** Dropped-anchor brake (exp rate/s): ~0.3s to dead stop — an anchor bites, it doesn't coast. */
const ANCHOR_BRAKE = 3.0;
/** Rudder multiplier while the dropped anchor still carries way — the ship PIVOTS around the hook (the
 *  deliberately-pirate anchor-turn, SAILING.md piece #5). Raised 2.5 → 3.2 when the at-rest steerage floor
 *  stopped applying at anchor (the pirouette fix shaved the pivot's authority; this restores the drama). */
const ANCHOR_TURN_MULT = 3.2;
/** Rudder SLEW rate (rudder-units/s): digital A/D command a TARGET; the wheel takes real time to wind over
 *  (~0.3s to hard-over) — the spokes SPIN and the blade SWEEPS instead of teleporting (the developer's
 *  snap report). Centering under hands uses the same rate; hands-OFF centering is the exp decay above. */
const RUDDER_SLEW = 3;
/** WINDAGE (px/s² at strength 1): the HULL is a sail too — the wind shoves every un-anchored ship downwind.
 *  Terminal leeway = WINDAGE_ACCEL×strength/driftEase (rowboat ~9 px/s, caravel ~25 — high topsides, more
 *  windage), so a stalled ship makes STERNWAY in irons and an abandoned unanchored hull genuinely drifts
 *  (the NAVAL theft rule gets physics). The hook suppresses it (anchored holds against anything). */
const WINDAGE_ACCEL = 30;
/** FALL-OFF (rad/s of yaw target at strength 1): a nearly-stopped bow PAYS OFF away from the eye of the
 *  wind — the real reason irons is a delay, not a prison (sailors wait it out). Only meaningful below
 *  bare-steerage flow; deterministic tie-break falls off to starboard from exact dead-upwind. */
const FALLOFF = 0.08;

export class ShipSystem {
  constructor(
    private readonly world: World,
    private readonly collision: Collision,
    private readonly wind: WindSystem,
  ) {}

  update(dt: number): void {
    for (const ship of this.world.with('ship', 'transform')) {
      const sh = ship.ship!;
      const t = ship.transform!;
      const hull = ShipHulls.get(sh.hull);
      // ANCHOR states (SAILING.md piece #5): weighing counts down to 'up'; dropped/weighing suppress thrust
      // (and dropped brakes the hull below). Edge-trigger: the state flips exactly once, on the timer.
      if (sh.anchor === 'weighing') {
        sh.anchorT -= dt;
        if (sh.anchorT <= 0) {
          sh.anchorT = 0;
          sh.anchor = 'up';
          events.emit('notify', { msg: 'Anchor aweigh.' });
        }
      }
      // SAIL-STATE thrust (piece #3 — the SET canvas replaces throttle-as-gas): thrust RAMPS toward the
      // sail target at hull accel (sails catching wind), no key held. The target per rig:
      //  - 'oars': sail × maxSpeed — wind-independent human power (no curve, no strength: the starter boat's
      //    immunity is rig data, not a special case). Backing (S at furled) reverses at reverseFrac.
      //  - 'sail': sail × curve(TRUE-wind angle) × apparent-strength × maxSpeed. The curve is a POLAR (its
      //    real-world convention — angle effects INCLUDING apparent-wind geometry are baked into its shape),
      //    so apparent wind enters ONLY via the strength term (EDGE_CASES: the double-count trap): the wind
      //    the canvas feels is trueWind − shipVelocity, which self-limits a dead run (you can't outrun your
      //    own wind — emergent, no cap code). The term is CLAMPED at the true strength (the developer's
      //    point-of-sail audit): un-clamped, the ship's own motion inflated it ~1.5× across the wind and a
      //    close-hauled beat matched a beam reach — re-multiplying the freshening the polar already encodes
      //    (the double-count through the magnitude door). Clamped, the curve owns the SHAPE, the term owns
      //    strength + the downwind deficit — and a Calm Belt (strength 0) zeroes thrust by construction.
      // Wind blows TOWARD wind.dir; the source is dir+π; 0 off-wind = bow dead into the source.
      let target: number;
      if (sh.anchor !== 'up') target = 0;
      else if (sh.back > 0) target = -hull.maxSpeed * hull.reverseFrac;
      else if (hull.rig === 'oars') target = SAIL_AMOUNT[sh.sail] * hull.maxSpeed;
      else {
        const wvx = Math.cos(this.wind.dir) * this.wind.strength * WIND_REF;
        const wvy = Math.sin(this.wind.dir) * this.wind.strength * WIND_REF;
        const apparent = Math.min(this.wind.strength, Math.hypot(wvx - sh.vx, wvy - sh.vy) / WIND_REF);
        target = Math.min(hull.maxSpeed, SAIL_AMOUNT[sh.sail] * sailCurveAt(hull, angleDiff(t.angle, this.wind.dir + Math.PI)) * apparent * hull.maxSpeed);
      }
      const dv = clamp(target - sh.speed, -hull.accel * dt, hull.accel * dt);
      sh.speed += dv;
      // THE WHEEL WINDS, never snaps (the developer's snap report): the rudder slews toward the pilot's
      // standing order at RUDDER_SLEW (~0.3s to hard-over — spokes spin, the blade sweeps), and the order
      // is then CONSUMED — an absent or idle pilot means "midships" automatically, so hands-off centering
      // needs no separate decay and no stale order ever steers a ghost helm. A LASHED wheel is TIED: no
      // winding at all until steering input or R unties it (the walk-away turn).
      if (!sh.lash) sh.rudder += clamp(sh.helmOrder - sh.rudder, -RUDDER_SLEW * dt, RUDDER_SLEW * dt);
      sh.helmOrder = 0;
      // `back` is the SAME per-tick order contract (canon review caught it missing the pattern): consumed
      // here after the thrust read above, so a pilot who releases the wheel mid-backing (or dies at it)
      // leaves no ghost throttle — an absent hand means "way off", exactly like the absent helm means midships.
      sh.back = 0;
      // THE HELM ANSWERS, the wheel doesn't steer (the last car-ism): yaw EASES toward rudder×turnRate×
      // authority at the hull's helmEase — the galleon takes a beat to start swinging and KEEPS swinging
      // after the rudder centers (counter-steer to settle). Rudder authority = waterflow past the blade
      // (true velocity; minTurnFrac is the bare-steerage floor), ×ANCHOR_TURN_MULT while a dropped hook
      // still carries way (the pivot).
      const flow = Math.min(1, Math.hypot(sh.vx, sh.vy) / hull.maxSpeed);
      const pivot = sh.anchor === 'dropped' && flow > 0.15 ? ANCHOR_TURN_MULT : 1;
      // the bare-steerage FLOOR (minTurnFrac) exists to escape irons — it does NOT apply at anchor: a
      // hooked, motionless ship must not pirouette under rudder alone (the developer's question; the
      // anchored-holds rule). FLOW authority stays, so the anchor-turn (dropped WITH way on) still pivots.
      const authority = (sh.anchor === 'up' ? hull.minTurnFrac : 0) + (1 - hull.minTurnFrac) * flow;
      const yawK = 1 - Math.exp(-hull.helmEase * dt);
      // FALL-OFF: with almost no way on (below bare-steerage flow), the wind pushes the bow AWAY from its
      // eye — irons is a delay, never a prison (the real bottom rung of the escape ladder: wait, and she
      // pays off until the canvas can fill). Enters the yaw TARGET so helmEase shapes it like any swing;
      // sign follows whichever side the bow already leans (starboard from exact dead-upwind, deterministic).
      let fallOff = 0;
      if (sh.anchor === 'up' && flow < 0.25) {
        const off = angleDiff(t.angle, this.wind.dir + Math.PI); // signed bow-vs-source (angle − source: + = bow starboard of the eye)
        // HARD gate, no fade: a smooth (1−flow/0.25) fade parked the coupled system at EXACTLY the gate
        // speed (yaw died as thrust arrived — she asymptoted at flow 0.25 forever, never filling). Full
        // push until the gate means the bow overshoots the marginal angle and the canvas genuinely fills.
        if (Math.abs(off) < 1.1) fallOff = FALLOFF * this.wind.strength * (off >= 0 ? 1 : -1);
      }
      sh.yaw += (sh.rudder * pivot * hull.turnRate * authority + fallOff - sh.yaw) * yawK;
      t.angle += sh.yaw * dt;
      // carving costs momentum, scaled by how hard the hull is ACTUALLY swinging (not the input)
      if (sh.yaw !== 0) sh.speed *= Math.exp(-hull.turnBrake * Math.min(1, Math.abs(sh.yaw) / hull.turnRate) * dt);
      // MOMENTUM WITH DRIFT (piece #4): the hull keeps a velocity VECTOR that EASES toward heading×thrust
      // at the hull's driftEase — steering turns the BOW, and the mass follows late (a galleon carves wide
      // and gets caught abeam mid-turn). driftEase doubles as water drag on the vector (split into a
      // separate knob only if feel demands). A DROPPED anchor overrides with a hard bite toward zero.
      const k = 1 - Math.exp(-(sh.anchor === 'dropped' ? ANCHOR_BRAKE : hull.driftEase) * dt);
      const goal = sh.anchor === 'dropped' ? 0 : sh.speed;
      sh.vx += (Math.cos(t.angle) * goal - sh.vx) * k;
      sh.vy += (Math.sin(t.angle) * goal - sh.vy) * k;
      // WINDAGE: the hull itself catches wind — a steady downwind shove on every un-hooked ship (leeway
      // under way, sternway when stalled, honest drift when abandoned). driftEase doubles as the water's
      // resistance to it, so terminal leeway = WINDAGE_ACCEL×strength/driftEase per hull.
      if (sh.anchor === 'up') {
        sh.vx += Math.cos(this.wind.dir) * WINDAGE_ACCEL * this.wind.strength * dt;
        sh.vy += Math.sin(this.wind.dir) * WINDAGE_ACCEL * this.wind.strength * dt;
      }
      if (sh.anchor === 'dropped') sh.speed = Math.min(Math.abs(sh.speed), Math.hypot(sh.vx, sh.vy)) * Math.sign(sh.speed); // thrust can't outlive the bite
      if (sh.vx !== 0 || sh.vy !== 0) {
        const px = t.x;
        const py = t.y;
        this.collision.tryMove(t, sh.vx * dt, sh.vy * dt, t.r, 'boat');
        if (t.x === px && t.y === py) {
          sh.speed = 0; // ran aground / hit the world edge — kill the thrust AND the momentum (one fact at a wall)
          sh.vx = 0;
          sh.vy = 0;
        } else if (Math.hypot(sh.vx, sh.vy) > 60 && Math.random() < dt * 24) { // cosmetic roll — NOT a sim stream (dt-scaled Bernoulli)
          events.emit('fx:burst', { x: t.x - Math.cos(t.angle) * t.r, y: t.y - Math.sin(t.angle) * t.r, color: 0xdff0ff, n: 3, speed: 40 });
        }
      }
    }
    // PARENT on-deck actors: world = ship.pos + rotate(local, ship.angle). Each actor holds a LOCAL deck spot
    // (onDeck.lx/ly); we re-derive its world POSITION each tick, so it rides the deck as the hull sails/turns.
    // Parenting owns POSITION only, NOT facing — an on-deck actor aims freely (mouse/auto-aim, set by Input) exactly
    // like on land (the Moat: a deck isn't a special mode). (onDeck stores the ship's ID — a sunk ship = ref gone.)
    for (const e of this.world.with('onDeck', 'transform')) {
      const ship = this.world.byId(e.onDeck!.shipId);
      if (ship?.transform && ship.ship) {
        const w = deckToWorld(ship.transform, e.onDeck!.lx, e.onDeck!.ly);
        e.transform!.x = w.x;
        e.transform!.y = w.y;
      } else {
        delete (e as Entity).onDeck; // the ship no longer exists — no longer aboard
      }
    }
  }

  /** Apply helm input to the ship the actor is aboard: the RUDDER echo (turn ∈ -1..1 — the hull answers it
   *  in update() via yaw, so the wheel is an INPUT, not a steering ray) + the BACKING hold (fwd < 0 with
   *  sails furled — oar hulls reverse at reverseFrac; sail rigs' reverseFrac is 0). Sail STATE changes are
   *  stepSail (edge-triggered), not held input — the canvas stays set when hands leave the wheel. */
  pilot(e: Entity, fwd: number, turn: number, _dt: number): void {
    const ship = e.onDeck !== undefined ? this.world.byId(e.onDeck.shipId) : undefined;
    if (!ship?.ship || !ship.transform) return;
    const sh = ship.ship;
    sh.back = fwd < 0 && sh.sail === 'furled' ? 1 : 0; // held S below furled = backing water (update() consumes)
    // The ORDER is all pilot() writes — update() winds the rudder and consumes it (one authority on the
    // wheel). A HELD turn deliberately does NOT untie a lash here: you lash the wheel WHILE holding it
    // (one hand holds, one ties — the developer's report: R during A/D must stick). Untying happens on a
    // FRESH grab — an input EDGE the INPUT layer detects (unlash()), because "new grip vs continued grip"
    // is a fact about hands, not about the ship.
    sh.helmOrder = clamp(turn, -1, 1);
    // HANDS ON THE WHEEL: the helmsman FACES THE BOW, live through every turn — steering locks your facing to
    // the ship, not to wherever you looked when you took the wheel (the frozen-facing report). This is pilot()'s
    // one exception to "ship code never touches facing" (parenting owns position only): holding the wheel IS
    // your action, so your body follows it; release the wheel and free aim returns (Input owns angle again).
    if (e.transform) e.transform.angle = ship.transform.angle;
  }

  /** STEP the sail state (W/S edge at the wheel): furled ↔ half ↔ full. A SHIP fact — it survives the pilot
   *  walking away, dying, or possession swapping (EDGE_CASES: sail states are ship facts, not pilot facts). */
  stepSail(e: Entity, delta: 1 | -1): void {
    const ship = e.onDeck !== undefined ? this.world.byId(e.onDeck.shipId) : undefined;
    if (!ship?.ship) return;
    const order = ['furled', 'quarter', 'half', 'full'] as const;
    const next = order[clamp(order.indexOf(ship.ship.sail) + delta, 0, order.length - 1)];
    if (next !== ship.ship.sail) {
      ship.ship.sail = next;
      // canvas up against a set hook: the sail fills but the ship holds — say WHY, instead of a silent
      // no-move mystery (the anchor is deliberately never auto-weighed; the ritual is the loop)
      const held = delta > 0 && ship.ship.anchor !== 'up' ? ' The anchor holds her — SPACE to weigh.' : '';
      const name = next === 'furled' ? 'Sails furled.' : next === 'quarter' ? 'Quarter sail — steerage way.' : next === 'half' ? 'Battle sails.' : 'Full sail!';
      events.emit('notify', { msg: name + held });
    }
  }

  /** The ANCHOR control (SPACE at the wheel — the handbrake): up → dropped (instant bite; at speed, the
   *  anchor-turn); dropped → weighing (hauling takes ANCHOR_WEIGH_T); weighing → ignored (already hauling). */
  toggleAnchor(e: Entity): void {
    const ship = e.onDeck !== undefined ? this.world.byId(e.onDeck.shipId) : undefined;
    if (!ship?.ship) return;
    const sh = ship.ship;
    if (sh.anchor === 'up') {
      sh.anchor = 'dropped';
      events.emit('notify', { msg: 'Anchor dropped!' });
    } else if (sh.anchor === 'dropped') {
      sh.anchor = 'weighing';
      sh.anchorT = ANCHOR_WEIGH_T;
      events.emit('notify', { msg: 'Weighing anchor…' });
    }
  }

  /** LASH/UNLASH the wheel (R at the helm — the real-sailor rope trick): ties the rudder at its CURRENT
   *  deflection so she holds this helm with nobody at the wheel (a straight leg, or a slow safe circle
   *  while the solo captain works the masts). Steering input also unties it (pilot()). */
  toggleLash(e: Entity): void {
    const ship = e.onDeck !== undefined ? this.world.byId(e.onDeck.shipId) : undefined;
    if (!ship?.ship) return;
    ship.ship.lash = !ship.ship.lash;
    events.emit('notify', { msg: ship.ship.lash ? 'Wheel lashed — she holds this helm (R or a fresh grab unlashes).' : 'Wheel unlashed.' });
  }

  /** UNTIE the lash (a FRESH grab of the wheel — the steering-edge the input layer detects). No-op when
   *  not lashed, so the edge can fire unconditionally. */
  unlash(e: Entity): void {
    const ship = e.onDeck !== undefined ? this.world.byId(e.onDeck.shipId) : undefined;
    if (!ship?.ship || !ship.ship.lash) return;
    ship.ship.lash = false;
    events.emit('notify', { msg: 'Wheel unlashed.' });
  }

  /** SEAT the pilot AT the wheel on TAKING it (E on the helm tile): the whole tile is the station trigger, so
   *  you could otherwise steer from the tile's corner, visibly beside the wheel. A deliberate interaction pull,
   *  not a movement snap — the transitions-never-move-the-body rule governs frame handoffs, not grabbing a
   *  station. Works for ANY pilot (future AI helmsmen seat themselves the same way — the Moat). */
  seatAtHelm(e: Entity): void {
    const ship = e.onDeck ? this.world.byId(e.onDeck.shipId) : undefined;
    if (!ship?.ship || !e.onDeck) return;
    const helm = helmSpot(deckOf(ship.ship.hull, ShipHulls.get(ship.ship.hull).deck));
    // stand ABAFT the wheel, not on its hub — the station must stay visible past the pilot's body (the
    // "I'm sitting on the wheel" report). Still within the helm TILE, so atHelm() keeps granting the wheel.
    e.onDeck.lx = helm.lx - 10;
    e.onDeck.ly = helm.ly;
  }

  /** Is the actor STANDING on its ship's helm tile? Piloting is POSITIONAL — you steer only while on the helm
   *  (step off → free-walking passenger). Reads the deck cell under its LOCAL spot. */
  atHelm(e: Entity): boolean {
    const ship = e.onDeck ? this.world.byId(e.onDeck.shipId) : undefined;
    if (!ship?.ship) return false;
    const grid = deckOf(ship.ship.hull, ShipHulls.get(ship.ship.hull).deck);
    return deckCellAtLocal(grid, e.onDeck!.lx, e.onDeck!.ly)?.tile === 'helm';
  }
}
