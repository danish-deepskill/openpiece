import type { ContentId } from '../core/Registry';
import { Accessories } from '../defs/accessories';
import type { Entity } from '../ecs/components';
import { syncDerivedResources } from './attributes';

/**
 * Put on an accessory: occupy its body slot and apply any stat modifiers/tags it carries (source-tracked,
 * so a future removeAccessory can cleanly strip them). Cosmetic accessories simply occupy the slot.
 */
export function wearAccessory(e: Entity, id: ContentId): void {
  const d = Accessories.get(id);
  if (!e.accessories) e.accessories = { slots: {} };
  e.accessories.slots[d.slot] = id;
  if (d.modifiers) e.attributes?.addAll(d.modifiers);
  if (d.tags && e.tags) for (const t of d.tags) e.tags.add(t);
  syncDerivedResources(e); // an accessory may carry maxHp/maxStam modifiers (every write path re-syncs)
}
