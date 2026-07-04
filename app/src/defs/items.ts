import type { ContentId } from '../core/Registry';
import type { Entity } from '../ecs/components';
import { Accessories, type AccessorySlot } from './accessories';
import { Fruits, Weapons } from './layers';

/**
 * The unifying ITEM REFERENCE — one typed pointer that lets weapons, devil fruits, and accessories (which
 * live in three separate registries with different shapes) flow through ONE generic pipe: pickups, the
 * inventory bag, and equip/unequip. This is the spine (RimWorld ThingDef / OSRS item-id lesson): don't
 * flatten the registries into a mega-table — reference them. Containers are `ItemRef[]`, so loot tables,
 * trading, dropping, stacking and a real grid UI all become list ops later with ZERO new item plumbing.
 *
 * `{ cat, id }` is plain data (ids at rest) → serialization-safe, the canon for cross-registry refs.
 */
export type ItemCategory = 'weapon' | 'fruit' | 'accessory'; // extensible: 'style' | 'potential' | 'material' …

export interface ItemRef {
  cat: ItemCategory;
  id: ContentId;
}

/** Which EQUIP slot an item occupies — a weapon/fruit is its own slot; an accessory maps to its body slot
 *  (hat = 'head', armor = 'chest', …). Drives auto-equip's "displace the occupant" and the HUD readout. */
export type EquipSlot = 'weapon' | 'fruit' | AccessorySlot;

/** Fail loud at load (a bad ref = a content bug): the referenced def must resolve in its category's registry. */
export function itemProblem(ref: ItemRef): string | null {
  switch (ref.cat) {
    case 'weapon':
      return Weapons.has(ref.id) ? null : `weapon '${ref.id}' is not in Weapons`;
    case 'fruit':
      return Fruits.has(ref.id) ? null : `fruit '${ref.id}' is not in Fruits`;
    case 'accessory':
      return Accessories.has(ref.id) ? null : `accessory '${ref.id}' is not in Accessories`;
  }
}

/** Display name — resolved against the ref's own registry (used by pickups, verbs, the HUD lists). */
export function itemName(ref: ItemRef): string {
  switch (ref.cat) {
    case 'weapon':
      return Weapons.get(ref.id).name;
    case 'fruit':
      return Fruits.get(ref.id).name;
    case 'accessory':
      return Accessories.get(ref.id).name;
  }
}

/** The equip slot this item occupies — so auto-equip knows what it displaces and the HUD groups by slot. */
export function itemSlot(ref: ItemRef): EquipSlot {
  switch (ref.cat) {
    case 'weapon':
      return 'weapon';
    case 'fruit':
      return 'fruit';
    case 'accessory':
      return Accessories.get(ref.id).slot;
  }
}

/** The equip readout for a unit, one label per named slot ("Hat: Straw Hat" / "Armor: —"). Presentation-
 *  agnostic (returns plain strings) — the HUD just renders these. Add a slot row here to surface it. */
export function equippedLabels(e: Entity): string[] {
  const acc = (slot: AccessorySlot): string => {
    const id = e.accessories?.slots[slot];
    return id ? Accessories.get(id).name : '—';
  };
  const w = e.equipment?.weapon;
  const f = e.equipment?.fruit;
  return [
    `Hat: ${acc('head')}`,
    `Armor: ${acc('chest')}`,
    `Fruit: ${f ? Fruits.get(f).name : '—'}`,
    `Weapon: ${w ? Weapons.get(w).name : '—'}`,
  ];
}

/** The bag readout — one name per owned-unequipped item, or empty (the HUD shows "Empty" for []). */
export function inventoryLabels(e: Entity): string[] {
  return (e.inventory?.items ?? []).map(itemName);
}
