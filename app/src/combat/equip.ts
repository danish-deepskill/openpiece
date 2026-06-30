import type { ContentId } from '../core/Registry';
import type { Entity } from '../ecs/components';
import { Fruits, Potentials, Styles, Weapons, type LayerDef } from '../defs/layers';

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
    e.loadout.granted.add(d.primary);
    e.loadout.primary = d.primary;
  }
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
  const eq = e.equipment;
  if (!eq) return;
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
  refreshLoadout(e);
}

/** Re-derive granted abilities + primary/dash/slots from current equipment (base kit always present). */
export function refreshLoadout(e: Entity): void {
  const eq = e.equipment;
  const lo = e.loadout;
  if (!eq || !lo) return;

  // Base kit everyone has: a fist and a dodge. (Haki/Armament is A-tier+ content — granted later, not here.)
  const granted = new Set<ContentId>(['ability.punch', 'ability.dodge']);
  let primary: ContentId = 'ability.punch';
  let dash: ContentId = 'ability.dodge';
  let slots: ContentId[] = [];

  if (eq.weapon) {
    const d = Weapons.get(eq.weapon);
    granted.add(d.primary);
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
    for (const s of d.slots) granted.add(s);
    primary = d.primary; // a fruit's power takes over the basic attack while held
    slots = [...d.slots];
  }

  lo.granted = granted;
  lo.primary = primary;
  lo.dash = dash;
  lo.slots = slots;
}
