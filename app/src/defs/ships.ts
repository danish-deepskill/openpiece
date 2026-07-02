import { Registry, type Def } from '../core/Registry';

/**
 * Ship hull templates (data-driven, like every other content family). A ship is a composite entity: a hull
 * gives base stats + slots; parts/cannons (deferred) will layer on as components/modifiers, and naval combat
 * reuses the shared attribute/ability engine. New classes = new registry entries.
 */
export interface ShipHullDef extends Def {
  name: string;
  klass: 'sloop' | 'caravel' | 'galleon';
  hp: number; // hull health
  maxSpeed: number; // px/s forward
  accel: number; // px/s^2 throttle response — LOW on purpose: sails catching wind, not a motorboat
  /** Reverse cap as a fraction of maxSpeed (0..1). Sail ships can't sail backwards — this is slow "backing"
   *  to unstick from docks, not a gear. */
  reverseFrac: number;
  /** Speed bled while turning (exp rate/s at full rudder) — carving a hard turn costs momentum. */
  turnBrake: number;
  turnRate: number; // rad/s at full sail
  /** Fraction of turnRate available at ZERO speed (0..1). A rudder needs waterflow, so 0 = a stopped ship
   *  cannot turn at all (chosen: backing up restores flow, hence steering — no dock-lock). Raise above 0
   *  only if idle turning ever needs to come back as a QoL floor. */
  minTurnFrac: number;
  r: number; // collision radius
  length: number; // draw size (full px)
  width: number;
  cannonSlots: number;
  color: number;
}

// validated at boot: accel ≤ 0 is the "W does nothing" bug class as a data typo; fraction knobs must be 0..1
export const ShipHulls = new Registry<ShipHullDef>('ShipHulls', (s) => {
  if (!(s.hp > 0)) return `hp must be > 0 (got ${s.hp})`;
  if (!(s.maxSpeed > 0)) return `maxSpeed must be > 0 (got ${s.maxSpeed})`;
  if (!(s.accel > 0)) return `accel must be > 0 — a hull that can't thrust can't sail (got ${s.accel})`;
  if (s.reverseFrac < 0 || s.reverseFrac > 1) return `reverseFrac must be in [0, 1] (got ${s.reverseFrac})`;
  if (s.minTurnFrac < 0 || s.minTurnFrac > 1) return `minTurnFrac must be in [0, 1] (got ${s.minTurnFrac})`;
  if (!(s.turnRate > 0)) return `turnRate must be > 0 (got ${s.turnRate})`;
  if (!(s.turnBrake >= 0)) return `turnBrake must be ≥ 0 (got ${s.turnBrake})`;
  if (!(s.r > 0)) return `r must be > 0 (got ${s.r})`;
  return null;
});

ShipHulls.registerAll([
  { id: 'ship.sloop', name: 'Sloop', klass: 'sloop', hp: 220, maxSpeed: 235, accel: 120, reverseFrac: 0.25, turnBrake: 0.3, turnRate: 1.9, minTurnFrac: 0, r: 26, length: 92, width: 42, cannonSlots: 2, color: 0x8a5a2c },
  { id: 'ship.caravel', name: 'Caravel', klass: 'caravel', hp: 430, maxSpeed: 200, accel: 80, reverseFrac: 0.2, turnBrake: 0.3, turnRate: 1.3, minTurnFrac: 0, r: 34, length: 124, width: 54, cannonSlots: 4, color: 0x7a4a22 },
  { id: 'ship.galleon', name: 'Galleon', klass: 'galleon', hp: 820, maxSpeed: 165, accel: 55, reverseFrac: 0.15, turnBrake: 0.3, turnRate: 0.9, minTurnFrac: 0, r: 46, length: 168, width: 74, cannonSlots: 8, color: 0x6a3f1c },
]);
