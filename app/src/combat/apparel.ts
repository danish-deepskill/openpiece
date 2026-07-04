import type { ContentId } from '../core/Registry';
import { Accessories, type AccessorySlot } from '../defs/accessories';
import type { Entity } from '../ecs/components';
import { syncDerivedResources } from './attributes';

/**
 * Put on an accessory: occupy its body slot and apply any stat modifiers/tags it carries (source-tracked,
 * so removeAccessory can cleanly strip them). Cosmetic accessories simply occupy the slot.
 */
export function wearAccessory(e: Entity, id: ContentId): void {
  const d = Accessories.get(id);
  if (!e.accessories) e.accessories = { slots: {} };
  // an occupied slot is VACATED first — overwriting the id alone would leak the old accessory's
  // modifiers/tags forever (the one-item-per-slot rule, enforced here so every caller is swap-safe)
  if (e.accessories.slots[d.slot]) removeAccessory(e, d.slot);
  e.accessories.slots[d.slot] = id;
  if (d.modifiers) e.attributes?.addAll(d.modifiers);
  if (d.tags && e.tags) for (const t of d.tags) e.tags.add(t);
  syncDerivedResources(e); // an accessory may carry maxHp/maxStam modifiers (every write path re-syncs)
}

/** Take off the accessory in a body slot — strips its modifiers/tags (mirror of wearAccessory). No-op if
 *  the slot is empty. Returns the removed accessory id (so the bag can reclaim it), or undefined. */
export function removeAccessory(e: Entity, slot: AccessorySlot): ContentId | undefined {
  const id = e.accessories?.slots[slot];
  if (!id) return undefined;
  const d = Accessories.get(id);
  const sources = new Set((d.modifiers ?? []).map((m) => m.source));
  for (const s of sources) e.attributes?.removeBySource(s);
  if (d.tags && e.tags) for (const t of d.tags) e.tags.remove(t);
  delete e.accessories!.slots[slot]; // `!` safe: the slot lookup above already early-returned if absent
  syncDerivedResources(e);
  return id;
}
