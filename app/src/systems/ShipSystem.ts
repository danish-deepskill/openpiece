import { events } from '../core/EventBus';
import { clamp } from '../core/math';
import { ShipHulls } from '../defs/ships';
import type { Entity } from '../ecs/components';
import type { World } from '../ecs/World';
import type { Collision } from '../world/Collision';
import type { FxSystem } from './FxSystem';

/**
 * Moves ships (heading + throttle, water-only collision), drags them to a stop, pins riders to the deck,
 * and handles board / disembark / piloting. Naval combat (cannons, battle mode) is deferred; the data
 * model (Ship.mode, cannonSlots) is already in place for it.
 */
export class ShipSystem {
  constructor(
    private readonly world: World,
    private readonly collision: Collision,
    private readonly fx: FxSystem,
  ) {}

  update(dt: number): void {
    for (const ship of this.world.with('ship', 'transform')) {
      const sh = ship.ship!;
      const t = ship.transform!;
      // water drag
      sh.speed *= Math.max(0, 1 - dt * 0.8);
      if (Math.abs(sh.speed) < 2) sh.speed = 0;
      if (sh.speed !== 0) {
        const dx = Math.cos(t.angle) * sh.speed * dt;
        const dy = Math.sin(t.angle) * sh.speed * dt;
        const px = t.x;
        const py = t.y;
        this.collision.tryMove(t, dx, dy, t.r, 'boat');
        if (t.x === px && t.y === py) sh.speed = 0; // ran aground / hit the world edge
        else if (Math.abs(sh.speed) > 60 && Math.random() < dt * 24) {
          this.fx.burst(t.x - Math.cos(t.angle) * t.r, t.y - Math.sin(t.angle) * t.r, 0xdff0ff, 3, 40);
        }
      }
    }
    // pin riders to their ship's deck
    for (const e of this.world.with('riding', 'transform')) {
      const ship = e.riding!.ship;
      if (ship?.transform) {
        e.transform!.x = ship.transform.x;
        e.transform!.y = ship.transform.y;
      }
    }
  }

  /** Nearest boardable ship within reach of an on-foot actor. */
  nearestShip(e: Entity): Entity | undefined {
    const t = e.transform;
    if (!t) return undefined;
    let best: Entity | undefined;
    let bestD = Infinity;
    for (const ship of this.world.with('ship', 'transform')) {
      const st = ship.transform!;
      const reach = st.r + 38;
      const d = (t.x - st.x) ** 2 + (t.y - st.y) ** 2;
      if (d < reach * reach && d < bestD) {
        bestD = d;
        best = ship;
      }
    }
    return best;
  }

  /** E-press: disembark if aboard, else board the nearest ship. Returns true if it handled the press. */
  interact(e: Entity): boolean {
    if (e.riding) {
      this.disembark(e);
      return true;
    }
    const ship = this.nearestShip(e);
    if (ship) {
      this.board(e, ship);
      return true;
    }
    return false;
  }

  private board(e: Entity, ship: Entity): void {
    e.riding = { ship };
    ship.ship!.anchored = false;
    const name = ShipHulls.get(ship.ship!.hull).name;
    events.emit('notify', { msg: `Boarded the ${name} — W/S throttle, A/D steer, E to disembark.` });
  }

  private disembark(e: Entity): void {
    const ship = e.riding!.ship;
    const st = ship.transform!;
    for (let r = st.r + 10; r <= st.r + 90; r += 12) {
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2;
        const lx = st.x + Math.cos(ang) * r;
        const ly = st.y + Math.sin(ang) * r;
        if (this.collision.canBe(lx, ly, e.transform!.r, 'foot')) {
          e.transform!.x = lx;
          e.transform!.y = ly;
          delete e.riding;
          ship.ship!.anchored = true;
          ship.ship!.speed = 0;
          events.emit('notify', { msg: 'Stepped ashore.' });
          return;
        }
      }
    }
    events.emit('notify', { msg: 'Sail closer to land to disembark.' });
  }

  /** Apply helm input to the ridden ship: throttle (fwd ∈ -1..1) + steer (turn ∈ -1..1). */
  pilot(e: Entity, fwd: number, turn: number, dt: number): void {
    const ship = e.riding?.ship;
    if (!ship) return;
    const sh = ship.ship!;
    const t = ship.transform!;
    const d = ShipHulls.get(sh.hull);
    t.angle += turn * d.turnRate * dt;
    sh.speed = clamp(sh.speed + fwd * d.accel * dt, -d.maxSpeed * 0.4, d.maxSpeed);
    e.transform!.angle = t.angle;
  }
}
