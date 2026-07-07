import { events } from '../core/EventBus';
import { clamp } from '../core/math';
import { ShipHulls } from '../defs/ships';
import type { Entity } from '../ecs/components';
import type { World } from '../ecs/World';
import type { Collision } from '../world/Collision';

/**
 * Moves ships (heading + throttle, water-only collision), drags them to a stop, pins riders to the deck,
 * and handles board / disembark / piloting. Naval combat (cannons, battle mode) is deferred; the data
 * model (Ship.mode, cannonSlots) is already in place for it.
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
    // pin riders to their DECK SLOT (not the ship center — else riders stack): seat 0 = helm (aft), the rest
    // spread FORWARD along the deck. The along-deck offset rotates with the ship's heading so they ride the
    // deck as it turns. (riding stores the ship's ID — resolve it; a sunk ship = ref gone.)
    for (const e of this.world.with('riding', 'transform')) {
      const ship = this.world.byId(e.riding!.shipId);
      if (ship?.transform && ship.ship) {
        const st = ship.transform;
        const span = ShipHulls.get(ship.ship.hull).length * 0.32; // usable deck length for seating (px)
        const seats = ShipHulls.get(ship.ship.hull).seats;
        // map seat i∈[0,seats-1] to an offset from −span (aft/helm) to +span (bow), centered
        const frac = seats > 1 ? e.riding!.seat / (seats - 1) : 0.5;
        const along = -span + frac * (2 * span);
        e.transform!.x = st.x + Math.cos(st.angle) * along;
        e.transform!.y = st.y + Math.sin(st.angle) * along;
      } else {
        delete (e as Entity).riding; // the ship no longer exists — the rider is simply no longer riding
      }
    }
  }

  /** Board `ship`: seat the actor at the helm (seat 0) and unanchor it. FOLLOWERS (recruited crew) board with
   *  the leader into the remaining seats, up to the hull's `seats` capacity — extra crew are left ashore. Each
   *  gets a distinct deck slot (pinRiders), so they don't stack. (verb.board) */
  board(e: Entity, ship: Entity): void {
    const hull = ShipHulls.get(ship.ship!.hull);
    e.riding = { shipId: ship.id, seat: 0 }; // the pilot at the helm
    if (e.mover) { e.mover.mode = 'foot'; e.mover.submerged = false; } // aboard the deck — clear any swim/dive state (you climbed OUT of the water)
    ship.ship!.anchored = false;
    let seat = 1;
    let leftBehind = 0;
    for (const c of this.world.with('ai', 'transform')) {
      if (c.ai!.bb.followId !== e.id || c.riding) continue; // only the leader's crew, not already aboard
      if (seat < hull.seats) c.riding = { shipId: ship.id, seat: seat++ };
      else leftBehind++;
    }
    const tail = leftBehind > 0 ? ` (${leftBehind} crew left ashore — the ${hull.name} is full)` : '';
    events.emit('notify', { msg: `Boarded the ${hull.name} — W/S throttle, A/D steer, E to disembark.${tail}` });
  }

  /** Step the rider off their ship onto the nearest open land; re-anchors the ship. Riding FOLLOWERS step off
   *  with the leader, each onto its own open spot near the ship. */
  disembark(e: Entity): void {
    const ship = this.world.byId(e.riding!.shipId);
    if (!ship?.ship || !ship.transform) {
      delete (e as Entity).riding; // ship gone (sunk/despawned) — nothing to step off of
      return;
    }
    const spot = this.landingSpot(ship.transform, e.transform!.r);
    if (!spot) {
      events.emit('notify', { msg: 'Sail closer to land to disembark.' });
      return;
    }
    e.transform!.x = spot.x;
    e.transform!.y = spot.y;
    delete e.riding;
    // the crew disembarks too — each to its own open spot beside the ship (skips any it can't fit, staying aboard)
    for (const c of this.world.with('riding', 'transform', 'ai')) {
      if (c.riding!.shipId !== ship.id || c.ai!.bb.followId !== e.id) continue;
      const cs = this.landingSpot(ship.transform, c.transform!.r);
      if (cs) { c.transform!.x = cs.x; c.transform!.y = cs.y; delete (c as Entity).riding; }
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

  /** Apply helm input to the ridden ship: throttle (fwd ∈ -1..1) + steer (turn ∈ -1..1). */
  pilot(e: Entity, fwd: number, turn: number, dt: number): void {
    const ship = e.riding !== undefined ? this.world.byId(e.riding.shipId) : undefined;
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
    e.transform!.angle = t.angle;
  }
}
