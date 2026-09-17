import { Registry, type Def } from '../core/Registry';
import { visualProblem, type Visual } from './visual';

/**
 * MATERIALS — the first STACKABLE commons (ITEMS.md §1): powder, timber, and later provisions, ore, cloth. A
 * material is pure quantity: no per-item state, so it never becomes an entity (the boundary law: state ⇒
 * instance; no state, no entity). It lives only in bags/holds as `ItemStack`s and on the ground as a `Pickup`
 * with a count. Every mutation of those counts goes through the `Items` service (systems/Items). Adding a
 * material = one row here (content-is-data); what CONSUMES it (ammo, repair, cooking) is that system's pass.
 */
export interface MaterialDef extends Def {
  name: string;
  /** Max units per bag stack — per-DEF data, never a global (the OSRS lesson). The design's starting number for
   *  materials is 50; provisions/ammo families will carry their own. Excess never wraps: it opens another stack.
   *  Validated at boot: an integer ≥ 1. */
  stackLimit: number;
  /** The look on the ground — a procedural `draw` key into draw/actorDraws' materialDraws ('pouch' / 'bundle'),
   *  tinted by `color`; 'auto' falls back to the pouch placeholder. Sprite art is the one-line art-day flip. */
  visual: Visual;
}

export const Materials = new Registry<MaterialDef>('Materials', (m) => {
  if (!Number.isInteger(m.stackLimit) || m.stackLimit < 1) return `stackLimit must be an integer ≥ 1 (got ${m.stackLimit})`;
  return visualProblem(m.visual);
});

Materials.registerAll([
  // GUNPOWDER — the charge a musket/cannon round will one day consume (backlog #19 rounds carry effects; the
  // consumer pass wires the count). A dark tied sack. Two 20-piles sit in the village armory house (WorldGen).
  { id: 'material.powder', name: 'Powder', stackLimit: 50, visual: { kind: 'procedural', draw: 'pouch', color: 0x3a3a3a } },
  // PLANK — ship timber, the repair/shipwright currency NAVAL.md's upgrade law prices parts in. A lashed bundle.
  { id: 'material.plank', name: 'Plank', stackLimit: 50, visual: { kind: 'procedural', draw: 'bundle', color: 0xb08050 } },
]);
