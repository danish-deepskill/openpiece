import type { ContentId } from '../core/Registry';
import type { Entity } from '../ecs/components';
import { Accessories, type AccessorySlot } from './accessories';
import { Fruits, Weapons } from './layers';
import { Manuals } from './manuals';
import { Materials } from './materials';

/**
 * The unifying ITEM REFERENCE — one typed pointer that lets weapons, devil fruits, and accessories (which
 * live in three separate registries with different shapes) flow through ONE generic pipe: pickups, the
 * inventory bag, and equip/unequip. This is the spine (RimWorld ThingDef / OSRS item-id lesson): don't
 * flatten the registries into a mega-table — reference them. Containers hold `ItemStack`s (a ref + a count),
 * so loot tables, trading, dropping and a real grid UI all become list ops later with ZERO new item plumbing.
 *
 * `{ cat, id }` is plain data (ids at rest) → serialization-safe, the canon for cross-registry refs.
 */
/** The closed category list — ONE source: the type is derived from it, so the boundary guard (isItemRef) and the
 *  compiler can never disagree about what a category is. Extensible: 'style' | 'potential' … */
export const ITEM_CATEGORIES = ['weapon', 'fruit', 'accessory', 'manual', 'material'] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

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
    case 'manual':
      return Manuals.has(ref.id) ? null : `manual '${ref.id}' is not in Manuals`;
    case 'material':
      return Materials.has(ref.id) ? null : `material '${ref.id}' is not in Materials`;
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
    case 'manual':
      return Manuals.get(ref.id).name;
    case 'material':
      return Materials.get(ref.id).name;
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
    case 'manual':
      // a manual is CONSUMED on read (grants an ability), never equipped — so it has no slot. The equip/displace
      // path (equippedIn/unequipToBag) must never reach here; takePickup routes 'manual' to the learn branch first.
      throw new Error(`itemSlot: '${ref.id}' is a manual (consumed on read) — it has no equip slot`);
    case 'material':
      // commons are STOWED, never worn — the take verb routes them through isEquippable() before any slot ask
      throw new Error(`itemSlot: '${ref.id}' is a material (stowed in the bag) — it has no equip slot`);
  }
}

/** Whether taking this item means WEARING it (weapon/fruit/accessory — it has an equip slot) or STOWING it (a
 *  material: commons that only ever live in a bag). A manual is neither (read on take). The take verb
 *  dispatches on this — a category rule in ONE place, never a per-id branch. */
export function isEquippable(ref: ItemRef): boolean {
  return ref.cat === 'weapon' || ref.cat === 'fruit' || ref.cat === 'accessory';
}

/** A COMMONS quantity — the bag's unit (ITEMS.md §1): a ref + a count, perfectly fungible, no history. Stacks
 *  merge iff `sameItem`; a stack never exceeds `stackLimitOf(ref)` (excess opens another stack — never a wrap,
 *  never a silent loss). Instances (per-item state) are NOT stacks — they're entities (ITEMS.md slice 2). */
export interface ItemStack {
  ref: ItemRef;
  n: number;
}

export const sameItem = (a: ItemRef, b: ItemRef): boolean => a.cat === b.cat && a.id === b.id;

/** Max units per stack — per-DEF data, never a global (the OSRS lesson). Only materials stack today; every other
 *  category answers 1 (non-stackable by design: a weapon/fruit/hat/manual is one thing). A family that gains a
 *  `stackLimit` field adds its case here — the one place the rule lives. */
export function stackLimitOf(ref: ItemRef): number {
  return ref.cat === 'material' ? Materials.get(ref.id).stackLimit : 1;
}

/** "Powder ×30" / "Cutlass" — the counted display name shared by pickups, the take prompt, and the bag readout. */
export function countedName(ref: ItemRef, n: number): string {
  return n > 1 ? `${itemName(ref)} ×${n}` : itemName(ref);
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

/** The bag readout — one counted name per stack ("Powder ×40", "Cutlass"), or empty (the HUD shows "—" for []). */
export function holdLabels(e: Entity): string[] {
  return (e.hold?.stacks ?? []).map((s) => countedName(s.ref, s.n));
}

/** BOUNDARY GUARD for an UNTRUSTED ref (an item intent from the panel, a net packet later): a real category AND
 *  an id that resolves in it. Never let a client-supplied shape reach the registries un-narrowed. */
export function isItemRef(x: { cat: string; id: string }): x is ItemRef {
  return (ITEM_CATEGORIES as readonly string[]).includes(x.cat) && itemProblem(x as ItemRef) === null; // narrowing at the untrusted boundary: the includes() proves cat
}
