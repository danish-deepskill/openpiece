import { Abilities } from '../combat/Ability';
import { Registry, type ContentId, type Def } from '../core/Registry';
import { visualProblem, type Visual } from './visual';

/**
 * A TECHNIQUE MANUAL (a skill book) — a consumable that TEACHES an ability. Unlike weapons/fruits/accessories
 * (which EQUIP into a slot), a manual is READ once: picking it up grants `teaches` to the reader's loadout
 * permanently, then the book is consumed. This is how trainable techniques enter the world (Rokushiki — Geppo,
 * Soru, Rankyaku — and future spell/skill books): each is ONE data row here + a pickup placed in the world, no
 * new code per book (content-is-data, the Moat: any actor that reads it learns it). Serialization-safe: the def
 * is ids + a Visual; the granted ability lives in the Abilities registry.
 */
export interface ManualDef extends Def {
  name: string;
  /** The ability this book grants on read (must resolve in Abilities — validated at boot). */
  teaches: ContentId;
  /** The look on the ground (a book) — a Visual descriptor (placeholder / procedural / sprite), like any item. */
  visual: Visual;
}

// validated at boot: a manual that teaches a non-existent ability is a content bug (would grant a dead id)
export const Manuals = new Registry<ManualDef>('Manuals', (m) => {
  if (!Abilities.has(m.teaches)) return `teaches '${m.teaches}' is not in Abilities`;
  return visualProblem(m.visual);
});

Manuals.registerAll([
  // GEPPO (Rokushiki "Moon Walk") — the hover technique. FOUND as a book near the Gomu fruit (WorldGen loot);
  // reading it grants ability.geppo, which then REPLACES jump on space (a toggle-hover). Placeholder glyph for
  // now (a tome-brown disc); real book art is a one-line flip to a 'sprite' visual (art day, no code change).
  { id: 'manual.geppo', name: 'Geppo Manual', teaches: 'ability.geppo', visual: { kind: 'auto' } },
]);
