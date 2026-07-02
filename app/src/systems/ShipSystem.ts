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
    // pin riders to their ship's deck (riding stores the ship's ID — resolve it; a sunk ship = ref gone)
    for (const e of this.world.with('riding', 'transform')) {
      const ship = this.world.byId(e.riding!.shipId);
      if (ship?.transform) {
        e.transform!.x = ship.transform.x;
        e.transform!.y = ship.transform.y;
      } else {
        delete (e as Entity).riding; // the ship no longer exists — the rider is simply no longer riding
      }
    }
  }

  /** Board `ship`: pin the actor to its deck and unanchor it. (Driven by the `verb.board` interaction.) */
  board(e: Entity, ship: Entity): void {
    e.riding = { shipId: ship.id }; // id at rest — every use re-resolves via world.byId
    ship.ship!.anchored = false;
    const name = ShipHulls.get(ship.ship!.hull).name;
    events.emit('notify', { msg: `Boarded the ${name} — W/S throttle, A/D steer, E to disembark.` });
  }

  /** Step the rider off their ship onto the nearest open land; re-anchors the ship. */
  disembark(e: Entity): void {
    const ship = this.world.byId(e.riding!.shipId);
    if (!ship?.ship || !ship.transform) {
      delete (e as Entity).riding; // ship gone (sunk/despawned) — nothing to step off of
      return;
    }
    const st = ship.transform;
    for (let r = st.r + 10; r <= st.r + 90; r += 12) {
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2;
        const lx = st.x + Math.cos(ang) * r;
        const ly = st.y + Math.sin(ang) * r;
        if (this.collision.canOccupy(lx, ly, e.transform!.r, 'foot')) {
          e.transform!.x = lx;
          e.transform!.y = ly;
          delete e.riding;
          ship.ship!.anchored = true;
          ship.ship!.speed = 0;
          ship.ship!.throttle = 0; // pilot() no longer runs for this ship — don't leave it 'powered'
          events.emit('notify', { msg: 'Stepped ashore.' });
          return;
        }
      }
    }
    events.emit('notify', { msg: 'Sail closer to land to disembark.' });
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
