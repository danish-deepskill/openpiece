import { Accessories } from '../defs/accessories';
import { Fruits, Weapons } from '../defs/layers';
import { Manuals } from '../defs/manuals';
import { Materials } from '../defs/materials';
import { ShipHulls } from '../defs/ships';
import { Structures } from '../defs/structures';
import { isEquippable, itemName, itemSlot, stackLimitOf, type EquipSlot, type ItemRef } from '../defs/items';
import type { Entity } from '../ecs/components';

/**
 * The inventory panel's VIEW-MODEL — a pure projection of components to plain data (the plateView pattern), so
 * the DOM panel renders strings/numbers/paths and never touches an entity, and the same shape could go over a
 * wire. Icons are DATA too: a sprite item names its art path (the panel resolves it to a URL); a procedural
 * item names a color + a glyph shape (the "auto placeholder" tier of the Visual seam — art day flips the def,
 * this file doesn't change).
 */
export interface IconView {
  /** Path under src/art (a sprite-visual weapon/accessory) — the panel maps it to a bundled URL. */
  art?: string;
  color: number;
  /** A one-letter fallback drawn on the placeholder shape. */
  glyph: string;
  shape: 'round' | 'square' | 'book' | 'sack' | 'bundle';
}

export interface StackView {
  ref: ItemRef;
  n: number;
  limit: number;
  name: string;
  icon: IconView;
  equippable: boolean;
  /** The doll slot this item would occupy (equippables only) — a drag onto the doll equips only on a match. */
  slot?: EquipSlot;
}

export interface HoldView {
  /** The container ENTITY id — what intents name (the sim re-validates it against reach at apply time). */
  id: number;
  title: string;
  slots: number;
  stacks: StackView[];
}

export interface EquipView {
  slot: EquipSlot;
  label: string;
  ref?: ItemRef;
  name?: string;
  icon?: IconView;
}

export interface InventoryView {
  actorId: number;
  bag: HoldView;
  /** The ONE other reachable container (a chest beside you, the ship you're aboard) — absent ⇒ bag only. */
  other?: HoldView;
  equipment: EquipView[];
  /** Aboard a ship: dropping is refused (a world-frame pile on a moving deck), so the panel hides Drop. */
  aboard: boolean;
}

const FRUIT_COLOR = 0x7a3da8;
const BOOK_COLOR = 0x6b4a2a;
const BLADE_COLOR = 0xcdd3da;
const PLACEHOLDER = 0x8a6a3a;

/** An item's icon as data — sprite art when the def has it, else a color + shape placeholder by category. */
export function iconOf(ref: ItemRef): IconView {
  const glyph = itemName(ref).charAt(0).toUpperCase();
  switch (ref.cat) {
    case 'weapon': {
      const v = Weapons.get(ref.id).visual;
      if (v?.kind === 'sprite') return { art: v.art, color: BLADE_COLOR, glyph, shape: 'square' };
      return { color: v?.color ?? BLADE_COLOR, glyph, shape: 'square' };
    }
    case 'accessory': {
      const v = Accessories.get(ref.id).visual;
      if (v.kind === 'sprite') return { art: v.art, color: PLACEHOLDER, glyph, shape: 'round' };
      return { color: v.kind === 'procedural' && v.color !== undefined ? v.color : PLACEHOLDER, glyph, shape: 'round' };
    }
    case 'fruit':
      return { color: FRUIT_COLOR, glyph, shape: 'round' };
    case 'manual': {
      const v = Manuals.get(ref.id).visual;
      if (v.kind === 'sprite') return { art: v.art, color: BOOK_COLOR, glyph, shape: 'book' };
      return { color: BOOK_COLOR, glyph, shape: 'book' };
    }
    case 'material': {
      const v = Materials.get(ref.id).visual;
      if (v.kind === 'sprite') return { art: v.art, color: PLACEHOLDER, glyph, shape: 'sack' };
      const color = v.kind === 'procedural' && v.color !== undefined ? v.color : PLACEHOLDER;
      return { color, glyph, shape: v.kind === 'procedural' && v.draw === 'bundle' ? 'bundle' : 'sack' };
    }
  }
}

/** A container's title from what it IS: a hull's name, a structure's name, else a unit's name (a corpse), else "Hold". */
function holdTitle(e: Entity): string {
  if (e.ship) return `${ShipHulls.get(e.ship.hull).name} hold`;
  if (e.structure) return Structures.get(e.structure.def).name;
  return e.identity?.name ?? 'Hold';
}

export function holdView(e: Entity, title: string): HoldView {
  const stacks: StackView[] = [];
  for (const s of e.hold?.stacks ?? []) {
    const equippable = isEquippable(s.ref);
    stacks.push({ ref: { cat: s.ref.cat, id: s.ref.id }, n: s.n, limit: stackLimitOf(s.ref), name: itemName(s.ref), icon: iconOf(s.ref), equippable, slot: equippable ? itemSlot(s.ref) : undefined });
  }
  return { id: e.id, title, slots: e.hold?.slots ?? 0, stacks };
}

/** The four named slots the unit plate already reads (equippedLabels) — the paper-doll strip. */
const EQUIP_SLOTS: Array<{ slot: EquipSlot; label: string }> = [
  { slot: 'head', label: 'Hat' },
  { slot: 'chest', label: 'Armor' },
  { slot: 'weapon', label: 'Weapon' },
  { slot: 'fruit', label: 'Fruit' },
];

function wornIn(e: Entity, slot: EquipSlot): ItemRef | undefined {
  if (slot === 'weapon') return e.equipment?.weapon ? { cat: 'weapon', id: e.equipment.weapon } : undefined;
  if (slot === 'fruit') return e.equipment?.fruit ? { cat: 'fruit', id: e.equipment.fruit } : undefined;
  const id = e.accessories?.slots[slot]; // narrowed to AccessorySlot by the two early returns above
  return id ? { cat: 'accessory', id } : undefined;
}

export function inventoryView(actor: Entity, other: Entity | undefined): InventoryView {
  const equipment: EquipView[] = EQUIP_SLOTS.map(({ slot, label }) => {
    const ref = wornIn(actor, slot);
    return ref ? { slot, label, ref, name: itemName(ref), icon: iconOf(ref) } : { slot, label };
  });
  return {
    actorId: actor.id,
    bag: holdView(actor, 'Bag'),
    other: other ? holdView(other, holdTitle(other)) : undefined,
    equipment,
    aboard: !!actor.onDeck,
  };
}

/** The cheap "did the view change" key: the service's mutation version + WHO is shown + WHAT is reachable + the
 *  worn set (equip paths outside the service change the paper-doll). A string compare per frame, no allocation
 *  of a view unless it differs. */
export function inventoryKey(actor: Entity, other: Entity | undefined, version: number): string {
  const worn = `${actor.equipment?.weapon ?? ''}|${actor.equipment?.fruit ?? ''}|${actor.accessories?.slots.head ?? ''}|${actor.accessories?.slots.chest ?? ''}`;
  return `${version}|${actor.id}|${other?.id ?? ''}|${!!actor.onDeck}|${worn}`;
}
