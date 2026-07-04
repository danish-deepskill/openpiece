import type { ContentId } from '../core/Registry';
import type { Entity } from '../ecs/components';
import { Accessories } from '../defs/accessories';
import type { ItemRef } from '../defs/items';
import { itemSlot } from '../defs/items';
import { Fruits, Potentials, Styles, Weapons, type LayerDef } from '../defs/layers';
import { BASE_KIT, GUARD_KIT } from '../defs/units';
import { removeAccessory, wearAccessory } from './apparel';
import { syncDerivedResources } from './attributes';
import { weaponKit } from './phases';

export type LayerKind = 'weapon' | 'fruit' | 'style' | 'potential';

/**
 * Arm a non-player actor (enemy/crew) with a weapon: applies its modifiers + tags + visual and makes its
 * basic attack the weapon's. Simpler than equip() (no player base-kit / fruit composition / refreshLoadout).
 */
export function giveWeapon(e: Entity, weaponId: ContentId): void {
  const d = Weapons.get(weaponId);
  if (!e.equipment) e.equipment = { potentials: [] };
  e.equipment.weapon = weaponId;
  e.attributes?.addAll(d.modifiers);
  if (e.tags) for (const t of d.tags) e.tags.add(t);
  if (e.loadout) {
    for (const a of weaponKit(d)) e.loadout.granted.add(a); // the primary AND its combo steps (the Moat: AI combos too)
    e.loadout.primary = d.primary;
  }
  syncDerivedResources(e); // every modifier write path re-syncs the maxHp/maxStam pools (combat/attributes)
}

function registryFor(kind: LayerKind) {
  return kind === 'weapon' ? Weapons : kind === 'fruit' ? Fruits : kind === 'style' ? Styles : Potentials;
}

function applyMods(e: Entity, d: LayerDef): void {
  e.attributes?.addAll(d.modifiers);
  if (e.tags) for (const t of d.tags) e.tags.add(t);
}

function removeMods(e: Entity, d: LayerDef): void {
  const sources = new Set(d.modifiers.map((m) => m.source));
  for (const s of sources) e.attributes?.removeBySource(s);
  if (e.tags) for (const t of d.tags) e.tags.remove(t);
}

/** Equip a layer: register its modifiers/tags and re-derive the ability loadout from all equipment. */
export function equip(e: Entity, kind: LayerKind, id: ContentId): void {
  const eq = (e.equipment ??= { potentials: [] }); // on demand, like giveWeapon — ANY body can equip (the Moat)
  const def = registryFor(kind).get(id) as LayerDef;
  if (kind === 'potential') {
    if (!eq.potentials.includes(id)) {
      eq.potentials.push(id);
      applyMods(e, def);
    }
  } else {
    const prev = eq[kind];
    if (prev) removeMods(e, registryFor(kind).get(prev) as LayerDef);
    eq[kind] = id;
    applyMods(e, def);
  }
  syncDerivedResources(e); // a layer's maxHp/maxStam modifiers move the pools' ceilings (combat/attributes)
  refreshLoadout(e);
}

export function unequip(e: Entity, kind: LayerKind, id?: ContentId): void {
  const eq = e.equipment;
  if (!eq) return;
  if (kind === 'potential') {
    if (!id) return;
    const i = eq.potentials.indexOf(id);
    if (i < 0) return;
    eq.potentials.splice(i, 1);
    removeMods(e, Potentials.get(id) as LayerDef);
  } else {
    const prev = eq[kind];
    if (!prev) return;
    removeMods(e, registryFor(kind).get(prev) as LayerDef);
    eq[kind] = undefined;
  }
  syncDerivedResources(e); // removing a layer may LOWER maxHp/maxStam — clamp the pools to the new ceiling
  refreshLoadout(e);
}

/** Re-derive granted abilities + primary/dash/slots from current equipment (base kit always present). */
export function refreshLoadout(e: Entity): void {
  const eq = e.equipment;
  const lo = e.loadout;
  if (!eq || !lo) return;

  // Base kit everyone has: a fist (light), a kick (heavy), a dodge, and the GUARD verbs (block/parry — a
  // fundamental capability, COMBAT.md). (Haki/Armament is A-tier+ — granted later.)
  const granted = new Set<ContentId>([BASE_KIT.primary, BASE_KIT.heavy, BASE_KIT.dash, ...GUARD_KIT]);
  let primary: ContentId = BASE_KIT.primary;
  let heavy: ContentId = BASE_KIT.heavy; // base heavy; a fruit (or later a weapon/style) may override this
  let dash: ContentId = BASE_KIT.dash;
  let slots: ContentId[] = [];

  if (eq.weapon) {
    const d = Weapons.get(eq.weapon);
    // the ONE kit walker (combat/phases.weaponKit) — if granting used a second walk, "granted" and
    // "in kit" (phases/volumes resolution) could disagree mid-combo
    for (const a of weaponKit(d)) granted.add(a);
    primary = d.primary;
  }
  if (eq.style) {
    const d = Styles.get(eq.style);
    granted.add(d.dash);
    dash = d.dash;
  }
  if (eq.fruit) {
    const d = Fruits.get(eq.fruit);
    granted.add(d.primary);
    if (d.heavy) granted.add(d.heavy);
    for (const s of d.slots) granted.add(s);
    primary = d.primary; // the fruit's power takes over the LIGHT attack while held…
    if (d.heavy) heavy = d.heavy; // …and the HEAVY (toggle back to fist/kick with R)
    slots = [...d.slots];
  }

  lo.granted = granted;
  lo.primary = primary;
  lo.heavy = heavy;
  lo.dash = dash;
  lo.slots = slots;
}

/**
 * What ItemRef currently occupies the equip slot `ref` targets — so auto-equip can DISPLACE it back to the
 * bag before equipping the new one. Undefined if the slot is empty. Reads the existing equipment/accessories
 * components; the slot mapping is the single source (itemSlot).
 */
export function equippedIn(e: Entity, ref: ItemRef): ItemRef | undefined {
  const slot = itemSlot(ref);
  if (slot === 'weapon') return e.equipment?.weapon ? { cat: 'weapon', id: e.equipment.weapon } : undefined;
  if (slot === 'fruit') return e.equipment?.fruit ? { cat: 'fruit', id: e.equipment.fruit } : undefined;
  const worn = e.accessories?.slots[slot]; // an accessory body slot ('head'/'chest'/…)
  return worn ? { cat: 'accessory', id: worn } : undefined;
}

/** Equip any ItemRef by dispatching to the right existing path (weapon/fruit → equip(); accessory →
 *  wearAccessory). The ONE generic entry point pickups + a future inventory-equip verb call. */
export function equipItem(e: Entity, ref: ItemRef): void {
  if (ref.cat === 'accessory') wearAccessory(e, ref.id);
  else equip(e, ref.cat, ref.id); // 'weapon' | 'fruit'
}

/** Unequip whatever holds the slot `ref` targets, returning it as an ItemRef (for the bag) or undefined.
 *  Mirror of equipItem — the reverse dispatch. */
export function unequipToBag(e: Entity, ref: ItemRef): ItemRef | undefined {
  const cur = equippedIn(e, ref);
  if (!cur) return undefined;
  if (cur.cat === 'accessory') removeAccessory(e, Accessories.get(cur.id).slot);
  else unequip(e, cur.cat, cur.id);
  return cur;
}

/** Player toggle: switch fighting stance between BARE (Punch + Kick) and FRUIT (its light + heavy). No-op unarmed. */
export function toggleAttackMode(e: Entity): void {
  const eq = e.equipment;
  const lo = e.loadout;
  if (!eq?.fruit || !lo) return;
  const fruit = Fruits.get(eq.fruit);
  const fistMode = lo.primary === BASE_KIT.primary;
  lo.primary = fistMode ? fruit.primary : BASE_KIT.primary;
  lo.heavy = fistMode ? fruit.heavy ?? BASE_KIT.heavy : BASE_KIT.heavy;
}
