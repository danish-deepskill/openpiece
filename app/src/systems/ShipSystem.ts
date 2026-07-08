import { events } from '../core/EventBus';
import { deckCellAtLocal, deckOf, deckToWorld, helmSpot } from '../defs/decks';
import { clamp } from '../core/math';
import { ShipHulls } from '../defs/ships';
import type { Entity } from '../ecs/components';
import type { World } from '../ecs/World';
import type { Collision } from '../world/Collision';

/**
 * Moves ships (heading + throttle, water-only collision), drags them to a stop, PARENTS on-deck actors to the
 * deck (world = ship ∘ local), and applies helm input (pilot/atHelm). Boarding/leaving is NOT here: frame
 * transitions live in world/frames.ts and fire from MovementSystem (walk-offs) + HullCollisionSystem (walk-ons) —
 * you board by WALKING aboard, not by a verb. Naval combat (cannons, battle mode) is deferred; the data model
 * (Ship.mode, cannonSlots) is already in place for it.
 *
 * KNOWN GAP (deliberate, recorded): recruited CREW don't yet follow you aboard — that arrives with crew-AI
 * (walkable-ship step 5), where they PATH to the gangplank and cross it like anyone else, instead of the old
 * teleport-into-seats. Until then only actors that physically walk/jump aboard are on deck.
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
    // HANDS ON THE WHEEL: the helmsman FACES THE BOW, live through every turn — steering locks your facing to
    // the ship, not to wherever you looked when you took the wheel (the frozen-facing report). This is pilot()'s
    // one exception to "ship code never touches facing" (parenting owns position only): holding the wheel IS
    // your action, so your body follows it; release the wheel and free aim returns (Input owns angle again).
    if (e.transform) e.transform.angle = t.angle;
  }

  /** SEAT the pilot AT the wheel on TAKING it (E on the helm tile): the whole tile is the station trigger, so
   *  you could otherwise steer from the tile's corner, visibly beside the wheel. A deliberate interaction pull,
   *  not a movement snap — the transitions-never-move-the-body rule governs frame handoffs, not grabbing a
   *  station. Works for ANY pilot (future AI helmsmen seat themselves the same way — the Moat). */
  seatAtHelm(e: Entity): void {
    const ship = e.onDeck ? this.world.byId(e.onDeck.shipId) : undefined;
    if (!ship?.ship || !e.onDeck) return;
    const helm = helmSpot(deckOf(ship.ship.hull, ShipHulls.get(ship.ship.hull).deck));
    e.onDeck.lx = helm.lx;
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
