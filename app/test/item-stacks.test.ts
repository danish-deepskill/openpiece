import { afterEach, describe, expect, it, vi } from 'vitest';
import { equipItem } from '../src/combat/equip';
import { TILE } from '../src/config/constants';
import { Rng } from '../src/core/Rng';
import { countedName, holdLabels, isEquippable, isItemRef, itemName, itemProblem, sameItem, stackLimitOf, type ItemRef } from '../src/defs/items';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import type { DialogueSystem } from '../src/systems/DialogueSystem';
import { InteractionSystem } from '../src/systems/InteractionSystem';
import { Items } from '../src/systems/Items';
import { SpatialQuery } from '../src/world/SpatialQuery';
import { StructureIndex, placeStructure } from '../src/world/StructureIndex';
import { TERRAIN } from '../src/defs/terrains';
import { Collision } from '../src/world/Collision';
import { TileGrid } from '../src/world/TileGrid';
import { deckOf, hatchSpot } from '../src/defs/decks';
import { ShipHulls } from '../src/defs/ships';
import { Materials } from '../src/defs/materials';
import { materialDraws } from '../src/draw/actorDraws';

const POWDER: ItemRef = { cat: 'material', id: 'material.powder' }; // stackLimit 50 (defs/materials)
const PLANK: ItemRef = { cat: 'material', id: 'material.plank' };
const CUTLASS: ItemRef = { cat: 'weapon', id: 'weapon.cutlass' };
const DAGGER: ItemRef = { cat: 'weapon', id: 'weapon.dagger' };
const HAT: ItemRef = { cat: 'accessory', id: 'accessory.strawHat' };

function rig() {
  const world = new World();
  const sp = new Spawner(world, new Rng(1));
  const hero = sp.spawnHero(0, 0); // bag: BAG_SLOTS (10) stack-slots
  const items = new Items(world, sp, new SpatialQuery(world));
  // dialogue is stubbed — takePickup never touches it (safe: {} as T with this note)
  const verbs = new InteractionSystem(world, {} as DialogueSystem, items);
  /** The real E-press path: drop a pile on the hero and interact. */
  const take = (ref: ItemRef, n = 1): void => {
    sp.spawnPickup(ref, hero.transform!.x, hero.transform!.y, n);
    verbs.interact(hero);
  };
  const piles = () => [...world.entities].filter((e) => e.pickup);
  const stacks = () => hero.hold!.stacks.map((s) => s.n);
  return { world, sp, hero, items, take, piles, stacks };
}

afterEach(() => vi.restoreAllMocks());

describe('materials — the first stackable commons family', () => {
  it('resolves through the ItemRef spine: name, validation, not equippable, per-def stack limit', () => {
    expect(itemName(POWDER)).toBe('Powder');
    expect(itemProblem(POWDER)).toBeNull();
    expect(itemProblem({ cat: 'material', id: 'material.nope' })).toMatch(/not in Materials/);
    expect(isEquippable(POWDER)).toBe(false);
    expect(isEquippable(CUTLASS)).toBe(true);
    expect(stackLimitOf(POWDER)).toBe(50); // the def's own number
    expect(stackLimitOf(CUTLASS)).toBe(1); // a weapon is one thing
    expect(countedName(POWDER, 30)).toBe('Powder ×30');
    expect(countedName(POWDER, 1)).toBe('Powder');
    expect(sameItem(POWDER, { cat: 'material', id: 'material.powder' })).toBe(true);
    expect(sameItem(POWDER, PLANK)).toBe(false);
  });

  it('the boundary guard admits only a real category with a resolving id (untrusted intents)', () => {
    expect(isItemRef({ cat: 'material', id: 'material.powder' })).toBe(true);
    expect(isItemRef({ cat: 'gold', id: 'material.powder' })).toBe(false);
    expect(isItemRef({ cat: 'weapon', id: 'weapon.nope' })).toBe(false);
  });

  it('every material with a procedural visual names a glyph the pickup draw has (a dropped pile may be its FIRST draw)', () => {
    for (const m of Materials.all()) {
      if (m.visual.kind === 'procedural') expect(materialDraws[m.visual.draw], `${m.id} → '${m.visual.draw}'`).toBeDefined();
    }
  });

  it('a pile spawns with its count in the pickup and its label', () => {
    const { sp } = rig();
    const p = sp.spawnPickup(POWDER, 0, 0, 20);
    expect(p.pickup!.n).toBe(20);
    expect(p.pickup!.label).toBe('Powder ×20');
    expect(sp.spawnPickup(CUTLASS, 0, 0).pickup!.n).toBe(1); // the default: a single thing
  });
});

describe('Hold — every unit and hull is born with one, sized by its def', () => {
  it('a unit gets BAG_SLOTS, fauna get none, a hull gets its holdSlots', () => {
    const { hero, sp } = rig();
    expect(hero.hold).toEqual({ stacks: [], slots: 10 });
    expect(sp.spawnUnit('unit.cow', 50, 50).hold!.slots).toBe(0);
    expect(sp.spawnShip('ship.sloop', 400, 400, 'straw_hat').hold!.slots).toBe(24);
  });
});

describe('Items — the single mutation site (ITEMS.md §4)', () => {
  it('slice-1 acceptance: taking 30 powder makes ONE stack of 30 and consumes the pile', () => {
    const { hero, take, piles } = rig();
    take(POWDER, 30);
    expect(holdLabels(hero)).toEqual(['Powder ×30']);
    expect(piles()).toHaveLength(0);
  });

  it('two piles of the same material MERGE into one stack (20 + 20 = one stack of 40)', () => {
    const { hero, take, items, stacks } = rig();
    take(POWDER, 20);
    take(POWDER, 20);
    expect(stacks()).toEqual([40]);
    expect(items.count(hero, POWDER)).toBe(40);
    expect(holdLabels(hero)).toEqual(['Powder ×40']);
  });

  it('a stack never exceeds its limit — excess opens another stack, nothing is lost (40 + 20 → 50 + 10)', () => {
    const { hero, items, stacks } = rig();
    expect(items.give(hero, POWDER, 40)).toBe(40);
    expect(items.give(hero, POWDER, 20)).toBe(20);
    expect(stacks()).toEqual([50, 10]);
    expect(items.count(hero, POWDER)).toBe(60);
  });

  it('CAPACITY: a full bag refuses a new stack, give reports what fit, and the pile keeps the remainder', () => {
    const { hero, items, take, piles } = rig();
    hero.hold!.slots = 2;
    expect(items.give(hero, POWDER, 120)).toBe(100); // two slots × 50: the third stack never opens
    expect(items.room(hero, POWDER)).toBe(0);
    take(PLANK, 5); // no slot: nothing stowed …
    expect(items.count(hero, PLANK)).toBe(0);
    expect(piles()).toHaveLength(1); // … and the pile is still on the ground, honestly labelled
    expect(piles()[0]!.pickup!.n).toBe(5);
    hero.hold!.slots = 3;
    expect(items.room(hero, POWDER)).toBe(50); // one free slot = one full stack of room
  });

  it('different materials never share a stack', () => {
    const { hero, items } = rig();
    items.give(hero, POWDER, 5);
    items.give(hero, PLANK, 5);
    expect(holdLabels(hero)).toEqual(['Powder ×5', 'Plank ×5']);
  });

  it('take removes up to what is there, drains the newest stack first, and never keeps a zero stack', () => {
    const { hero, items, stacks } = rig();
    items.give(hero, POWDER, 60); // [50, 10]
    expect(items.take(hero, POWDER, 15)).toBe(15); // 10 from the newest, 5 from the full one
    expect(stacks()).toEqual([45]);
    expect(items.take(hero, POWDER, 100)).toBe(45); // asked for more than exists: returns what was removed
    expect(items.count(hero, POWDER)).toBe(0);
    expect(hero.hold!.stacks).toEqual([]); // no phantom "Powder ×0"
    expect(items.take(hero, POWDER, 1)).toBe(0); // take-from-empty is a graceful 0
  });

  it('bad requests move nothing (NaN / zero / negative / fractional floors)', () => {
    const { hero, items } = rig();
    expect(items.give(hero, POWDER, Number.NaN)).toBe(0);
    expect(items.give(hero, POWDER, 0)).toBe(0);
    expect(items.give(hero, POWDER, -5)).toBe(0);
    expect(items.count(hero, POWDER)).toBe(0);
    expect(items.give(hero, POWDER, 2.9)).toBe(2); // whole units only
  });

  it("copies by value on add — the caller's ref object is never aliased into the hold", () => {
    const { hero, items } = rig();
    const ref: ItemRef = { cat: 'material', id: 'material.powder' };
    items.give(hero, ref, 5);
    ref.id = 'material.plank'; // mutate the caller's object afterwards
    expect(hero.hold!.stacks[0]!.ref.id).toBe('material.powder');
  });

  it('non-stackables (limit 1) are one stack each — two displaced cutlasses stay two entries', () => {
    const { hero, take } = rig();
    equipItem(hero, CUTLASS);
    take(DAGGER); // cutlass → bag
    take(CUTLASS); // dagger → bag
    take(DAGGER); // the second cutlass → bag
    expect(holdLabels(hero)).toEqual(['Cutlass', 'Dagger', 'Cutlass']);
    expect(hero.hold!.stacks.every((s) => s.n === 1)).toBe(true);
  });

  it('a stack found ABOVE its limit is corrupt data: clamped and warned loudly, never silently obeyed', () => {
    const { hero, items, stacks } = rig();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    hero.hold!.stacks = [{ ref: { ...POWDER }, n: 99 }]; // a hand-edited save
    expect(items.give(hero, POWDER, 1)).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/truncating .*material\.powder.* 99 .* 50/);
    expect(stacks()).toEqual([50, 1]); // clamped, then the 1 opened a new stack
  });

  it('version bumps on every successful mutation and never on a refused one', () => {
    const { hero, items } = rig();
    const v0 = items.version;
    items.give(hero, POWDER, 5);
    expect(items.version).toBe(v0 + 1);
    items.give(hero, POWDER, 0);
    expect(items.version).toBe(v0 + 1);
    items.take(hero, PLANK, 3); // nothing to take
    expect(items.version).toBe(v0 + 1);
  });
});

describe('Items.move — an atomic two-hold transfer', () => {
  it('moves what BOTH ends allow: source count and destination room', () => {
    const { hero, sp, items } = rig();
    const chest = sp.spawnShip('ship.rowboat', 300, 300, 'straw_hat'); // any hold will do: 6 slots
    items.give(hero, POWDER, 70); // [50, 20]
    expect(items.move(hero, chest, POWDER, 100)).toBe(70); // capped by what the hero HAS
    expect(items.count(hero, POWDER)).toBe(0);
    expect(items.count(chest, POWDER)).toBe(70);
    chest.hold!.slots = 2; // now full (two stacks)
    items.give(hero, PLANK, 5);
    expect(items.move(hero, chest, PLANK, 5)).toBe(0); // capped by the destination's ROOM: nothing crosses
    expect(items.count(hero, PLANK)).toBe(5); // and nothing was lost on the way
    expect(items.move(hero, hero, PLANK, 5)).toBe(0); // a hold is never its own destination
  });
});

describe('Items.split / drop / equip verbs', () => {
  it('split carves a new stack off (needs a free slot; a whole-stack split is a no-op)', () => {
    const { hero, items, stacks } = rig();
    items.give(hero, POWDER, 40);
    expect(items.split(hero, 0, 15)).toBe(15);
    expect(stacks()).toEqual([25, 15]);
    expect(items.split(hero, 1, 15)).toBe(0); // n ≥ the stack: not a split
    hero.hold!.slots = 2;
    expect(items.split(hero, 0, 5)).toBe(0); // no free slot
  });

  it('drop removes from the hold and lands ONE pile with the count at the feet; refused aboard', () => {
    const { hero, items, piles } = rig();
    items.give(hero, POWDER, 30);
    hero.transform!.angle = 0; // facing +x
    expect(items.drop(hero, POWDER, 12)).toBe(12);
    expect(items.count(hero, POWDER)).toBe(18);
    const p = piles();
    expect(p).toHaveLength(1);
    expect(p[0]!.pickup!.n).toBe(12);
    expect(p[0]!.transform!.x).toBeGreaterThanOrEqual(hero.transform!.r + 12 + 10); // both radii + the gap: the sprites don't overlap
    hero.onDeck = { shipId: 1, lx: 0, ly: 0 }; // aboard: a world-frame pile on a moving deck is the treadmill bug
    expect(items.drop(hero, POWDER, 5)).toBe(0);
    expect(items.count(hero, POWDER)).toBe(18);
  });

  it('a drop lands a body-width AHEAD on open floor, but at the FEET when the spot ahead is a wall', () => {
    const world = new World();
    const sp = new Spawner(world, new Rng(1));
    const g = new TileGrid(20, 20);
    g.tiles = Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => TERRAIN.grass));
    const items = new Items(world, sp, new SpatialQuery(world), new Collision(g));
    const hero = sp.spawnHero(10 * TILE + 16, 10 * TILE + 16); // centered in cell (10, 10)
    hero.transform!.angle = 0; // facing +x: the spot ahead is inside cell (11, 10)
    items.give(hero, POWDER, 10);
    expect(items.drop(hero, POWDER, 5)).toBe(5);
    const ahead = [...world.entities].find((e) => e.pickup)!;
    expect(ahead.transform!.x).toBeGreaterThan(hero.transform!.x + hero.transform!.r); // clear of the body
    placeStructure(world, g.structures, 'structure.wall', 11, 10); // now a wall stands where a drop would go
    expect(items.drop(hero, POWDER, 5)).toBe(5);
    const piles = [...world.entities].filter((e) => e.pickup);
    expect(piles).toHaveLength(2);
    const atFeet = piles.find((e) => e !== ahead)!;
    expect(atFeet.transform!.x).toBe(hero.transform!.x); // fell back to the feet — never inside the wall
    expect(atFeet.transform!.y).toBe(hero.transform!.y);
  });

  it('equipFromHold wears the item and drops the displaced one into the hold; refused whole when the swap would not fit', () => {
    const { hero, items } = rig();
    equipItem(hero, CUTLASS);
    items.give(hero, DAGGER, 1);
    expect(items.equipFromHold(hero, DAGGER)).toBe(true);
    expect(hero.equipment!.weapon).toBe('weapon.dagger');
    expect(holdLabels(hero)).toEqual(['Cutlass']); // the displaced weapon is back in the bag
    expect(items.equipFromHold(hero, POWDER)).toBe(false); // not equippable
    // a full bag where the ONLY free unit is the one we take: the swap-out still needs its own slot
    hero.hold!.stacks = [{ ref: { ...CUTLASS }, n: 1 }];
    hero.hold!.slots = 1;
    items.give(hero, POWDER, 0);
    hero.hold!.stacks.push({ ref: { ...PLANK }, n: 1 }); // corrupt-by-hand overfill is NOT what we test: keep to 1 slot
    hero.hold!.stacks.pop();
    expect(items.equipFromHold(hero, CUTLASS)).toBe(true); // taking the cutlass frees the slot the dagger needs
    expect(hero.equipment!.weapon).toBe('weapon.cutlass');
    expect(holdLabels(hero)).toEqual(['Dagger']);
  });

  it('unequipToHold stows the worn item when a slot is free, refuses otherwise', () => {
    const { hero, items } = rig();
    equipItem(hero, HAT);
    expect(items.unequipToHold(hero, HAT)).toBe(true);
    expect(hero.accessories!.slots.head).toBeUndefined();
    expect(holdLabels(hero)).toEqual(['Straw Hat']);
    expect(items.unequipToHold(hero, HAT)).toBe(false); // nothing worn there now
    equipItem(hero, CUTLASS);
    hero.hold!.slots = 1; // the hat fills the only slot
    expect(items.unequipToHold(hero, CUTLASS)).toBe(false);
    expect(hero.equipment!.weapon).toBe('weapon.cutlass'); // still worn — nothing was lost
  });
});

describe('Items.apply — the intent seam re-validates everything and names every refusal', () => {
  it('refuses a stale/unreachable hold, an un-held ref, an unknown ref, and never silently', () => {
    const { hero, sp, items } = rig();
    const far = sp.spawnShip('ship.rowboat', 900, 900, 'straw_hat'); // a real hold — but not reachable from here
    items.give(hero, POWDER, 10);
    expect(items.apply(hero, { kind: 'move', from: hero.id, to: far.id, ref: POWDER, n: 10 })).toBe('Out of reach.');
    expect(items.count(hero, POWDER)).toBe(10); // nothing moved
    expect(items.apply(hero, { kind: 'move', from: hero.id, to: hero.id, ref: POWDER, n: 10 })).toBeNull(); // same hold: a no-op
    expect(items.apply(hero, { kind: 'drop', ref: PLANK, n: 1 })).toBe('No Plank to drop.');
    expect(items.apply(hero, { kind: 'drop', ref: { cat: 'material', id: 'material.nope' }, n: 1 })).toBe('Unknown item.');
    expect(items.apply(hero, { kind: 'equip', ref: POWDER })).toBe("Powder can't be worn.");
    expect(items.apply(hero, { kind: 'equip', ref: CUTLASS })).toBe('No Cutlass in the bag.');
    expect(items.apply(hero, { kind: 'unequip', ref: HAT })).toBe('Nothing worn there.');
    hero.hold!.slots = 1;
    expect(items.apply(hero, { kind: 'split', hold: hero.id, index: 0, n: 5 })).toBe('No free slot to split into.');
    hero.onDeck = { shipId: far.id, lx: 0, ly: 0 };
    expect(items.apply(hero, { kind: 'drop', ref: POWDER, n: 1 })).toBe("Can't drop aboard — stow it in the hold.");
  });

  it('applies a valid intent through the verbs: move to the reachable ship hold, then equip and unequip', () => {
    const { hero, sp, items } = rig();
    const ship = sp.spawnShip('ship.sloop', 900, 900, 'straw_hat');
    hero.onDeck = { shipId: ship.id, ...hatchSpot(deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck)) }; // ON the hatch: the hold is reachable
    items.give(hero, POWDER, 10);
    expect(items.apply(hero, { kind: 'move', from: hero.id, to: ship.id, ref: POWDER, n: 10 })).toBeNull();
    expect(items.count(ship, POWDER)).toBe(10);
    items.give(hero, HAT, 1);
    expect(items.apply(hero, { kind: 'equip', ref: HAT })).toBeNull();
    expect(hero.accessories!.slots.head).toBe('accessory.strawHat');
    expect(items.apply(hero, { kind: 'unequip', ref: HAT })).toBeNull();
    expect(holdLabels(hero)).toEqual(['Straw Hat']);
  });

  it('takeFromPile stows what fits and leaves an honestly labelled remainder', () => {
    const { hero, sp, items, piles } = rig();
    hero.hold!.slots = 1;
    const pile = sp.spawnPickup(POWDER, 0, 0, 70); // one slot = 50 of room
    expect(items.takeFromPile(hero, pile)).toBe(50);
    expect(piles()).toHaveLength(1);
    expect(pile.pickup!.n).toBe(20);
    expect(pile.pickup!.label).toBe('Powder ×20');
    hero.hold!.slots = 2;
    expect(items.takeFromPile(hero, pile)).toBe(20);
    expect(piles()).toHaveLength(0); // emptied → destroyed
  });

  it('split clamps a corrupt over-limit stack before splitting it (never two corrupt stacks)', () => {
    const { hero, items, stacks } = rig();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    hero.hold!.stacks = [{ ref: { ...POWDER }, n: 99 }];
    expect(items.split(hero, 0, 20)).toBe(20);
    expect(stacks()).toEqual([30, 20]); // 99 → clamped to 50 → 30 + 20
  });
});

describe('Items.reachableHold — what you can reach into', () => {
  it('aboard: the ship ONLY from its hatch tile; ashore: a chest within reach; never a living body', () => {
    const { world, hero, sp, items } = rig();
    const ship = sp.spawnShip('ship.sloop', 900, 900, 'straw_hat');
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    hero.onDeck = { shipId: ship.id, lx: 0, ly: 0 }; // amidships, off the hatch: the cargo is NOT at hand
    expect(items.reachableHold(hero)).toBeUndefined();
    hero.onDeck = { shipId: ship.id, ...hatchSpot(grid) }; // standing on the trapdoor
    expect(items.reachableHold(hero)).toBe(ship);
    delete hero.onDeck;
    const index = new StructureIndex(4, 4);
    const chest = placeStructure(world, index, 'structure.chest', 1, 0); // centered at (48, 16)
    expect(chest.hold).toEqual({ stacks: [], slots: 12 });
    hero.transform!.x = 48;
    hero.transform!.y = 16 + TILE; // one tile below the chest: within arm's reach
    expect(items.reachableHold(hero)).toBe(chest);
    hero.transform!.y = 16 + TILE * 4; // too far
    expect(items.reachableHold(hero)).toBeUndefined();
    const villager = sp.spawnUnit('unit.villager', 48, 40); // a living body beside you is never a reach-in
    hero.transform!.y = 40;
    expect(items.reachableHold(hero)).not.toBe(villager);
  });
});
