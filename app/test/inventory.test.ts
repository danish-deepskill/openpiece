import { describe, expect, it } from 'vitest';
import { equipItem, equippedIn } from '../src/combat/equip';
import { Rng } from '../src/core/Rng';
import { equippedLabels, inventoryLabels, itemName, itemProblem, itemSlot, type ItemRef } from '../src/defs/items';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import type { DialogueSystem } from '../src/systems/DialogueSystem';
import { InteractionSystem } from '../src/systems/InteractionSystem';
import type { ShipSystem } from '../src/systems/ShipSystem';

const HAT: ItemRef = { cat: 'accessory', id: 'accessory.strawHat' };
const CUTLASS: ItemRef = { cat: 'weapon', id: 'weapon.cutlass' };
const DAGGER: ItemRef = { cat: 'weapon', id: 'weapon.dagger' };
const GOMU: ItemRef = { cat: 'fruit', id: 'fruit.gomu' };

/** A take-verb driver: places a pickup on top of the hero and runs the interaction (the real E-press path).
 *  ships/dialogue are stubbed — takePickup touches neither (safe: {} as T with this note). */
function take(world: World, sp: Spawner, hero: ReturnType<Spawner['spawnHero']>, ref: ItemRef): void {
  sp.spawnPickup(ref, hero.transform!.x, hero.transform!.y);
  new InteractionSystem(world, {} as ShipSystem, {} as DialogueSystem).interact(hero);
}

describe('ItemRef — one reference resolves across all three registries', () => {
  it('names, slots, and validates weapon / fruit / accessory refs', () => {
    expect(itemName(HAT)).toBe('Straw Hat');
    expect(itemName(CUTLASS)).toBe('Cutlass');
    expect(itemName(GOMU)).toBe('Gomu Gomu no Mi');
    expect(itemSlot(HAT)).toBe('head'); // accessory → its body slot
    expect(itemSlot(CUTLASS)).toBe('weapon');
    expect(itemSlot(GOMU)).toBe('fruit');
    expect(itemProblem(HAT)).toBeNull();
    expect(itemProblem({ cat: 'weapon', id: 'weapon.nope' })).toMatch(/not in Weapons/);
  });
});

describe('inventory — pickup enters the bag then auto-equips', () => {
  it('taking the hat wears it (not left in the bag) and destroys the world pickup', () => {
    const w = new World();
    const sp = new Spawner(w, new Rng(1));
    const hero = sp.spawnHero(0, 0); // bare-headed now
    expect(equippedIn(hero, HAT)).toBeUndefined();

    take(w, sp, hero, HAT);
    expect(hero.accessories!.slots.head).toBe('accessory.strawHat'); // equipped onto the head
    expect(inventoryLabels(hero)).not.toContain('Straw Hat'); // worn, so NOT sitting in the bag
    expect([...w.entities].some((e) => e.pickup)).toBe(false); // the floor pickup was consumed
  });

  it('taking a second weapon swaps it in and DISPLACES the old one to the bag', () => {
    const w = new World();
    const sp = new Spawner(w, new Rng(1));
    const hero = sp.spawnHero(0, 0);
    equipItem(hero, CUTLASS);
    expect(hero.equipment!.weapon).toBe('weapon.cutlass');

    take(w, sp, hero, DAGGER);
    expect(hero.equipment!.weapon).toBe('weapon.dagger'); // newer gear wins (good UX)
    expect(inventoryLabels(hero)).toContain('Cutlass'); // the displaced weapon dropped to the bag
  });

  it('different slots coexist — a hat and a weapon do not displace each other', () => {
    const w = new World();
    const sp = new Spawner(w, new Rng(1));
    const hero = sp.spawnHero(0, 0);
    take(w, sp, hero, HAT);
    take(w, sp, hero, CUTLASS);
    expect(hero.accessories!.slots.head).toBe('accessory.strawHat');
    expect(hero.equipment!.weapon).toBe('weapon.cutlass');
    expect(inventoryLabels(hero)).toEqual([]); // both worn, bag empty
  });

  it('equippedLabels reports each named slot, filled or empty', () => {
    const w = new World();
    const sp = new Spawner(w, new Rng(1));
    const hero = sp.spawnHero(0, 0);
    take(w, sp, hero, HAT);
    const labels = equippedLabels(hero);
    expect(labels).toContain('Hat: Straw Hat');
    expect(labels).toContain('Armor: —'); // wired but empty (no armor defs yet)
    expect(labels).toContain('Weapon: —');
  });
});
