import { modifierProblem, type Modifier } from '../combat/Modifier';
import { Registry, type Def } from '../core/Registry';
import { visualProblem, type Visual } from './visual';

/** Where an accessory sits on the body. Add a slot here to support a new wear location; each slot gets an
 *  anchor + depth in AccessorySystem (derived from draw/actorDraws.ANATOMY, the shared body contract).
 *  `chest` = the torso/shoulder armor canvas — author its sprites with a transparent head cutout at the
 *  head anchor (top-down: your head occludes your chest, and it renders ABOVE the chest layer). */
export type AccessorySlot = 'head' | 'face' | 'back' | 'chest';

/**
 * A wearable cosmetic. Content is data: the look is a `Visual` descriptor (auto placeholder / procedural
 * draw / hand-crafted sprite — see defs/visual.ts), so prototyping needs zero art and "getting real art"
 * is a per-item data flip, never a migration. Sprite art paths resolve in BootScene (presentation); defs
 * stay JSON-serializable and loadable on a headless server (which needs slots/modifiers/tags for combat,
 * never the pixels). Accessories may also carry `modifiers`/`tags` (e.g. a helmet granting +def).
 */
export interface AccessoryDef extends Def {
  name: string;
  slot: AccessorySlot;
  /** The look — substrate is data. Placement (offset/rotates/layer) stays HERE: it applies to any kind. */
  visual: Visual;
  /** Forward offset along the aim direction, in px (e.g. nudge a hat brim forward). Default 0. */
  offset?: number;
  /** Rotate to face the aim direction (a sprite's "forward" is up). Default true. */
  rotates?: boolean;
  /** Drawn over the body (hat) or under it (cape/back-item). Default 'over'. */
  layer?: 'over' | 'under';
  modifiers?: Modifier[];
  tags?: string[];
}

// validated at boot: a bad visual renders an invisible accessory — a content bug, not a style choice
export const Accessories = new Registry<AccessoryDef>('Accessories', (a) => {
  return visualProblem(a.visual) ?? modifierProblem(a.modifiers);
});

Accessories.registerAll([
  // the hero's icon — FOUND in the cutlass house (WorldGen loot), not spawn-worn (id grammar: accessory.<camelCase>)
  { id: 'accessory.strawHat', name: 'Straw Hat', slot: 'head', visual: { kind: 'sprite', art: 'accessories/examples/straw_hat.png', scale: 1.6 } },
  // the Brawler's helmet (the D- sword duelist) — the plain grey visor
  { id: 'accessory.soldierHelmet', name: 'Soldier Helmet', slot: 'head', visual: { kind: 'sprite', art: 'hats/soldier_helmet.png', scale: 1.6 } },
  // the Brute's helmet — the horned one, marks the F+ fodder variant at a glance
  { id: 'accessory.bruteHelmet', name: 'Brute Helmet', slot: 'head', visual: { kind: 'sprite', art: 'hats/brute_helmet.png', scale: 1.6 } },
  // the Bandit's hat — pairs with the knife (light-class kit)
  { id: 'accessory.banditHat', name: 'Bandit Hat', slot: 'head', visual: { kind: 'sprite', art: 'accessories/examples/bandit_hat.png', scale: 1.6 } },
]);
