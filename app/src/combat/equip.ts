import type { ContentId } from '../core/Registry';
import type { Entity } from '../ecs/components';
import { Accessories } from '../defs/accessories';
import type { ItemRef } from '../defs/items';
import { itemSlot } from '../defs/items';
import { Fruits, Potentials, Styles, Weapons, type LayerDef } from '../defs/layers';
import { BASE_KIT } from '../defs/units';
import { removeAccessory, wearAccessory } from './apparel';
import { syncDerivedResources } from './attributes';
import { weaponKit } from './phases';

export type LayerKind = 'weapon' | 'fruit' | 'style' | 'potential';

// NOTE: the old giveWeapon/giveStyle "simpler AI paths" are GONE — they hand-patched the loadout beside
// refreshLoadout and the two drifted repeatedly (missing heavy, missing slots, styles granting a dash ability
// but never setting the dash slot). Every actor — player, AI, spawn-time or mid-game — equips through the ONE
// path: equip() → refreshLoadout() (the Moat: the AI isn't special, and neither is the spawn).

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

/** Re-derive granted abilities + primary/heavy/dash/slots from the unit's INNATE kit + current equipment.
 *  `loadout.innate` (seeded by the Spawner: base verbs by tier/noGuard + trait grants) is the non-equipment
 *  half, so a rebuild can never strip an innate capability — no per-ability preserve special-cases. */
export function refreshLoadout(e: Entity): void {
  const eq = e.equipment;
  const lo = e.loadout;
  if (!lo) return; // equipment may be absent (a bare unit) — the innate kit alone still derives below

  const granted = new Set<ContentId>(lo.innate);
  let primary: ContentId = BASE_KIT.primary; // the fist — every innate kit includes it
  // base heavy/dash only if this unit's innate kit actually has them (the Spawner gates roll by tier; a unit
  // without the base kick keeps heavy '') — the old unconditional BASE_KIT fallbacks silently re-granted
  // abilities the spawn had deliberately withheld the moment any equip() ran.
  let heavy: ContentId = granted.has(BASE_KIT.heavy) ? BASE_KIT.heavy : '';
  let dash: ContentId = granted.has(BASE_KIT.dash) ? BASE_KIT.dash : '';
  let slots: ContentId[] = [];

  if (eq?.weapon) {
    const d = Weapons.get(eq.weapon);
    // the ONE kit walker (combat/phases.weaponKit) — if granting used a second walk, "granted" and
    // "in kit" (phases/volumes resolution) could disagree mid-combo
    for (const a of weaponKit(d)) granted.add(a);
    primary = d.primary;
    if (d.heavy) heavy = d.heavy; // a weapon can grant its own HEAVY (the musket's butt-stroke bash) over the base kick
    if (d.slots) slots = [...d.slots]; // slot HOTKEY order only — the abilities came in via the kit walk above; a FRUIT (below) still overrides if also held
  }
  if (eq?.style) {
    const d = Styles.get(eq.style);
    granted.add(d.dash);
    dash = d.dash;
    // a style's unarmed strikes are always GRANTED (so R can toggle to them), but only take over the
    // primary/heavy when no WEAPON is held — a drawn weapon out-prioritises bare martial arts.
    if (d.primary) {
      granted.add(d.primary);
      if (!eq.weapon) primary = d.primary;
    }
    if (d.heavy) {
      granted.add(d.heavy);
      if (!eq.weapon) heavy = d.heavy;
    }
  }
  if (eq?.fruit) {
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

/** Does the entity hold a RANGED weapon (a musket)? The one place input, AI, and draw ask "can this actor
 *  aim + fire a shot" — keyed on the weapon's class (data), never an id. */
export function isRanged(e: Entity): boolean {
  return e.equipment?.weapon !== undefined && Weapons.get(e.equipment.weapon).weaponClass === 'ranged';
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
 *  wearAccessory). The ONE generic entry point pickups + a future inventory-equip verb call. A 'manual' (consumed
 *  on read) and a 'material' (stowed, never worn) are NOT equippable — takePickup routes on isEquippable() first,
 *  so they must never reach here (the POSITIVE narrow below is what keeps a new category from leaking into equip). */
export function equipItem(e: Entity, ref: ItemRef): void {
  if (ref.cat === 'accessory') wearAccessory(e, ref.id);
  else if (ref.cat === 'weapon' || ref.cat === 'fruit') equip(e, ref.cat, ref.id);
  else throw new Error(`equipItem: '${ref.id}' is a ${ref.cat} — not equippable (takePickup routes by isEquippable() first)`);
}

/** Unequip whatever holds the slot `ref` targets, returning it as an ItemRef (for the bag) or undefined.
 *  Mirror of equipItem — the reverse dispatch. */
export function unequipToBag(e: Entity, ref: ItemRef): ItemRef | undefined {
  const cur = equippedIn(e, ref);
  if (!cur) return undefined;
  if (cur.cat === 'accessory') removeAccessory(e, Accessories.get(cur.id).slot);
  else if (cur.cat === 'weapon' || cur.cat === 'fruit') unequip(e, cur.cat, cur.id); // equippedIn only returns a WORN kind (never manual/material); the positive narrow is for TS
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
