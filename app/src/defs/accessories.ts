import { modifierProblem, type Modifier } from '../combat/Modifier';
import { Registry, type Def } from '../core/Registry';

/** Where an accessory sits on the body. Add a slot here to support a new wear location. */
export type AccessorySlot = 'head' | 'face' | 'back';

/**
 * A wearable cosmetic. Content is data: `art` is a plain path under src/art (BootScene — presentation —
 * resolves it to a bundled URL and loads it into a texture keyed by `id`). Defs stay JSON-serializable and
 * loadable on a headless server (which needs slots/modifiers/tags for combat, never the pixels).
 * Accessories may also carry `modifiers`/`tags` (e.g. a helmet granting +def), composed like the layers.
 */
export interface AccessoryDef extends Def {
  name: string;
  slot: AccessorySlot;
  /** Asset path relative to src/art (e.g. 'accessories/examples/straw_hat.png'). */
  art: string;
  /** Display diameter = actor body diameter (2·r) × scale. */
  scale: number;
  /** Forward offset along the aim direction, in px (e.g. nudge a hat brim forward). Default 0. */
  offset?: number;
  /** Rotate to face the aim direction (the sprite's "forward" is up). Default true. */
  rotates?: boolean;
  /** Drawn over the body (hat) or under it (cape/back-item). Default 'over'. */
  layer?: 'over' | 'under';
  modifiers?: Modifier[];
  tags?: string[];
}

// validated at boot: a 0/negative scale renders an invisible accessory — a content bug, not a style choice
export const Accessories = new Registry<AccessoryDef>('Accessories', (a) => {
  if (!(a.scale > 0)) return `scale must be > 0 (got ${a.scale})`;
  return modifierProblem(a.modifiers);
});

Accessories.registerAll([
  // the hero's icon — worn from frame one (id grammar: accessory.<camelCase>, DESIGN_PATTERNS §3)
  { id: 'accessory.strawHat', name: 'Straw Hat', slot: 'head', art: 'accessories/examples/straw_hat.png', scale: 1.6 },
  // the Brute's helmet — marks the F+ fodder variant at a glance
  { id: 'accessory.soldierHelmet', name: 'Soldier Helmet', slot: 'head', art: 'accessories/examples/soldier_helmet.png', scale: 1.6 },
  // the Bandit's hat — pairs with the knife (light-class kit)
  { id: 'accessory.banditHat', name: 'Bandit Hat', slot: 'head', art: 'accessories/examples/bandit_hat.png', scale: 1.6 },
]);
