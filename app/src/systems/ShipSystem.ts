import { events } from '../core/EventBus';
import { deckCellAtLocal, deckOf, deckToWorld, deckTryMove, helmSpot, walkableSpots } from '../defs/decks';
import { clamp } from '../core/math';
import { ShipHulls } from '../defs/ships';
import type { Entity } from '../ecs/components';
import type { World } from '../ecs/World';
import type { Collision } from '../world/Collision';

/**
 * Moves ships (heading + throttle, water-only collision), drags them to a stop, PARENTS on-deck actors to the
 * deck (world = ship ∘ local), and handles board / disembark / piloting. Naval combat (cannons, battle mode) is
 * deferred; the data model (Ship.mode, cannonSlots) is already in place for it.
 */
export class ShipSystem {
  constructor(
    private readonly world: World,
    private readonly collision: Collision,
  ) {}

  update(dt: number): void {
    for (const ship of this.world.with('ship', 'transform')) {
      const sh = ship.ship!;
      const t = ship.transform!;
      // water drag + stop-snap apply only while COASTING — under throttle, accel is the net force. (The
      // snap once ate the ship's whole first tick of thrust: accel·dt < 2 was zeroed before it could move.)
      if (sh.throttle === 0) {
        sh.speed *= Math.exp(-0.8 * dt); // exact exponential drag — same coast distance at any fps
        if (Math.abs(sh.speed) < 2) sh.speed = 0;
      }
      if (sh.speed !== 0) {
        const dx = Math.cos(t.angle) * sh.speed * dt;
        const dy = Math.sin(t.angle) * sh.speed * dt;
        const px = t.x;
        const py = t.y;
        this.collision.tryMove(t, dx, dy, t.r, 'boat');
        if (t.x === px && t.y === py) sh.speed = 0; // ran aground / hit the world edge
        else if (Math.abs(sh.speed) > 60 && Math.random() < dt * 24) { // cosmetic roll — NOT a sim stream (dt-scaled Bernoulli)
          events.emit('fx:burst', { x: t.x - Math.cos(t.angle) * t.r, y: t.y - Math.sin(t.angle) * t.r, color: 0xdff0ff, n: 3, speed: 40 });
        }
      }
    }
    // PARENT on-deck actors: world = ship.pos + rotate(local, ship.angle). Each actor holds a LOCAL deck spot
    // (onDeck.lx/ly); we re-derive its world position + facing each tick, so it rides the deck as the hull
    // sails/turns. (onDeck stores the ship's ID — resolve it; a sunk ship = ref gone.) Step 3 will let lx/ly MOVE.
    for (const e of this.world.with('onDeck', 'transform')) {
      const ship = this.world.byId(e.onDeck!.shipId);
      if (ship?.transform && ship.ship) {
        const st = ship.transform;
        const w = deckToWorld(st, e.onDeck!.lx, e.onDeck!.ly);
        e.transform!.x = w.x;
        e.transform!.y = w.y;
        e.transform!.angle = st.angle; // face along the hull's heading (until walking gives its own facing)
      } else {
        delete (e as Entity).onDeck; // the ship no longer exists — no longer aboard
      }
    }
  }

  /** Board `ship`: stand the actor ON THE DECK beside the helm and unanchor it. Piloting is POSITIONAL — you walk
   *  ONTO the helm tile to steer, and off it to roam — so boarding drops you next to the wheel (not on it), making
   *  "walk to the wheel to drive" the discoverable loop. FOLLOWERS (recruited crew) board onto other walkable deck
   *  spots, up to the hull's `seats` capacity; each gets a distinct spot (spread so they don't stack). (verb.board) */
  board(e: Entity, ship: Entity): void {
    const hull = ShipHulls.get(ship.ship!.hull);
    const grid = deckOf(ship.ship!.hull, hull.deck);
    const helm = helmSpot(grid);
    // the leader stands on a deck spot NEXT TO the helm (nearest non-helm walkable), so stepping onto the wheel to
    // steer is a deliberate act; fall back to the helm itself only if the deck is a single tile.
    const nonHelm = walkableSpots(grid).filter((sp) => sp.lx !== helm.lx || sp.ly !== helm.ly);
    const start = nonHelm.length > 0
      ? nonHelm.reduce((best, sp) => (Math.hypot(sp.lx - helm.lx, sp.ly - helm.ly) < Math.hypot(best.lx - helm.lx, best.ly - helm.ly) ? sp : best))
      : helm;
    e.onDeck = { shipId: ship.id, lx: start.lx, ly: start.ly };
    if (e.mover) { e.mover.mode = 'foot'; e.mover.submerged = false; } // aboard the deck — clear any swim/dive state (you climbed OUT of the water)
    ship.ship!.anchored = false;
    // crew fill other walkable spots (skip the leader's spot), capped by seats
    const spots = walkableSpots(grid).filter((sp) => sp.lx !== start.lx || sp.ly !== start.ly);
    let n = 0;
    let leftBehind = 0;
    for (const c of this.world.with('ai', 'transform')) {
      if (c.ai!.bb.followId !== e.id || c.onDeck) continue; // only the leader's crew, not already aboard
      if (n + 1 < hull.seats && n < spots.length) {
        c.onDeck = { shipId: ship.id, lx: spots[n].lx, ly: spots[n].ly };
        if (c.mover) { c.mover.mode = 'foot'; c.mover.submerged = false; }
        n++;
      } else leftBehind++;
    }
    const tail = leftBehind > 0 ? ` (${leftBehind} crew left ashore — the ${hull.name} is full)` : '';
    events.emit('notify', { msg: `Boarded the ${hull.name} — WASD to walk the deck, stand at the wheel to steer, E to disembark.${tail}` });
  }

  /** Step the actor off their ship onto the nearest open land; re-anchors the ship. On-deck FOLLOWERS step off
   *  with the leader, each onto its own open spot near the ship. */
  disembark(e: Entity): void {
    const ship = this.world.byId(e.onDeck!.shipId);
    if (!ship?.ship || !ship.transform) {
      delete (e as Entity).onDeck; // ship gone (sunk/despawned) — nothing to step off of
      return;
    }
    const spot = this.landingSpot(ship.transform, e.transform!.r);
    if (!spot) {
      events.emit('notify', { msg: 'Sail closer to land to disembark.' });
      return;
    }
    e.transform!.x = spot.x;
    e.transform!.y = spot.y;
    delete e.onDeck;
    // the crew disembarks too — each to its own open spot beside the ship (skips any it can't fit, staying aboard)
    for (const c of this.world.with('onDeck', 'transform', 'ai')) {
      if (c.onDeck!.shipId !== ship.id || c.ai!.bb.followId !== e.id) continue;
      const cs = this.landingSpot(ship.transform, c.transform!.r);
      if (cs) { c.transform!.x = cs.x; c.transform!.y = cs.y; delete (c as Entity).onDeck; }
    }
    ship.ship!.anchored = true;
    ship.ship!.speed = 0;
    ship.ship!.throttle = 0; // pilot() no longer runs for this ship — don't leave it 'powered'
    events.emit('notify', { msg: 'Stepped ashore.' });
  }

  /** The nearest open foot-standable spot in a ring around the ship (for a body of radius `bodyR`), or null. */
  private landingSpot(st: { x: number; y: number; r: number }, bodyR: number): { x: number; y: number } | null {
    for (let r = st.r + 10; r <= st.r + 90; r += 12) {
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2;
        const lx = st.x + Math.cos(ang) * r;
        const ly = st.y + Math.sin(ang) * r;
        if (this.collision.canOccupy(lx, ly, bodyR, 'foot')) return { x: lx, y: ly };
      }
    }
    return null;
  }

  /** Apply helm input to the ship the actor is aboard: throttle (fwd ∈ -1..1) + steer (turn ∈ -1..1). */
  pilot(e: Entity, fwd: number, turn: number, dt: number): void {
    const ship = e.onDeck !== undefined ? this.world.byId(e.onDeck.shipId) : undefined;
    if (!ship?.ship || !ship.transform) return;
    const sh = ship.ship;
    const t = ship.transform;
    const d = ShipHulls.get(sh.hull);
    // rudder authority comes from water flowing past it: full turn at speed, only minTurnFrac while idle
    sh.throttle = fwd; // remembered by update(): drag applies only when this is 0 (coasting)
    const flow = Math.min(1, Math.abs(sh.speed) / d.maxSpeed);
    t.angle += turn * d.turnRate * (d.minTurnFrac + (1 - d.minTurnFrac) * flow) * dt;
    // carving costs momentum: a hard turn bleeds speed (exp form — frame-rate independent)
    if (turn !== 0) sh.speed *= Math.exp(-d.turnBrake * Math.abs(turn) * dt);
    sh.speed = clamp(sh.speed + fwd * d.accel * dt, -d.maxSpeed * d.reverseFrac, d.maxSpeed);
    // NOTE: the pilot's facing is set by the parenting loop (faces the hull heading), not here.
  }

  /** Is the actor STANDING on its ship's helm tile? Piloting is POSITIONAL — you steer only while on the helm
   *  (step off → free-walking passenger). Reads the deck cell under its LOCAL spot. */
  atHelm(e: Entity): boolean {
    const ship = e.onDeck ? this.world.byId(e.onDeck.shipId) : undefined;
    if (!ship?.ship) return false;
    const grid = deckOf(ship.ship.hull, ShipHulls.get(ship.ship.hull).deck);
    return deckCellAtLocal(grid, e.onDeck!.lx, e.onDeck!.ly)?.tile === 'helm';
  }

  /** WALK the deck: move the actor's LOCAL spot by a WORLD-space intent (wdx,wdy from WASD in screen space), so
   *  "up" is up on screen regardless of heading. The world delta is rotated into the deck frame, then deck
   *  collision walls the rails (the actor slides along them, can't walk into the sea). `airborne` lets a jump
   *  cross the rail (leap off). Local pos only — ShipSystem's parenting re-derives world pos next tick. */
  walkDeck(e: Entity, wdx: number, wdy: number, dt: number, airborne = false): void {
    if (!e.onDeck || !e.mover || !e.transform) return;
    const ship = this.world.byId(e.onDeck.shipId);
    if (!ship?.ship || !ship.transform) return;
    const len = Math.hypot(wdx, wdy);
    if (len === 0) return;
    const grid = deckOf(ship.ship.hull, ShipHulls.get(ship.ship.hull).deck);
    const speed = e.mover.speed * dt;
    // world intent → deck-local delta (un-rotate by the ship heading), normalized to the walk speed
    const a = -ship.transform.angle;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const nx = (wdx / len) * speed;
    const ny = (wdy / len) * speed;
    const dlx = nx * cos - ny * sin;
    const dly = nx * sin + ny * cos;
    deckTryMove(e.onDeck, dlx, dly, grid, e.transform.r, airborne);
  }
}
