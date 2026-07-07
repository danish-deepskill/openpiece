import { FRAME_SWITCH_COOLDOWN } from '../config/constants';
import type { Entity } from '../ecs/components';

/**
 * MOVEMENT-FRAME TRANSITION PRIMITIVES (docs/design/features/movement-frames.md). The ONE place an actor switches
 * reference frames (world ↔ deck) — every path (gangplank walk-on/off, land-on-deck boarding, rail adoption,
 * airborne leave, future deck↔deck battle boarding) calls THESE, so the state normalization can never fork.
 * Free functions, not ShipSystem methods, ON PURPOSE: the consumers (MovementSystem, HullCollisionSystem) would
 * otherwise need a whole system injected just to flip a component — a transition is data surgery, not behavior.
 */

/** ENTER the deck frame: position becomes deck-LOCAL (parenting owns world pos from here). Normalizes state that
 *  must not survive boarding: you're on dry planks (swim/dive cleared), and the anti-ping-pong cooldown starts so
 *  the door can't instantly hand you back. Idempotent-safe: overwrites an existing onDeck. */
export function enterDeck(e: Entity, shipId: number, lx: number, ly: number): void {
  e.onDeck = { shipId, lx, ly };
  if (e.mover) {
    e.mover.mode = 'foot';
    e.mover.submerged = false;
    e.mover.frameCd = FRAME_SWITCH_COOLDOWN;
  }
}

/** EXIT the deck frame: the actor returns to WORLD space at (wx,wy); world movement resumes next tick. Starts the
 *  same cooldown so the gangplank/land-on handoffs don't instantly re-board (the leave↔board ping-pong). */
export function exitDeck(e: Entity, wx: number, wy: number): void {
  delete e.onDeck;
  if (e.transform) {
    e.transform.x = wx;
    e.transform.y = wy;
  }
  if (e.mover) e.mover.frameCd = FRAME_SWITCH_COOLDOWN;
}

/** True while the actor is in its post-transition beat — frame handoffs are muted (no board↔leave flapping). */
export function inFrameCooldown(e: Entity): boolean {
  return (e.mover?.frameCd ?? 0) > 0;
}
