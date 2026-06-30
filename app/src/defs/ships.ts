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
  accel: number; // px/s^2 throttle response
  turnRate: number; // rad/s
  r: number; // collision radius
  length: number; // draw size (full px)
  width: number;
  cannonSlots: number;
  color: number;
}

export const ShipHulls = new Registry<ShipHullDef>('ShipHulls');

ShipHulls.registerAll([
  { id: 'ship.sloop', name: 'Sloop', klass: 'sloop', hp: 220, maxSpeed: 235, accel: 300, turnRate: 1.9, r: 26, length: 92, width: 42, cannonSlots: 2, color: 0x8a5a2c },
  { id: 'ship.caravel', name: 'Caravel', klass: 'caravel', hp: 430, maxSpeed: 200, accel: 240, turnRate: 1.3, r: 34, length: 124, width: 54, cannonSlots: 4, color: 0x7a4a22 },
  { id: 'ship.galleon', name: 'Galleon', klass: 'galleon', hp: 820, maxSpeed: 165, accel: 180, turnRate: 0.9, r: 46, length: 168, width: 74, cannonSlots: 8, color: 0x6a3f1c },
]);
