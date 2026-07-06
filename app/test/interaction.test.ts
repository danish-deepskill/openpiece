import { describe, expect, it } from 'vitest';
import type { Entity } from '../src/ecs/components';
import { World } from '../src/ecs/World';
import { DialogueSystem } from '../src/systems/DialogueSystem';
import { InteractionSystem } from '../src/systems/InteractionSystem';
import type { ShipSystem } from '../src/systems/ShipSystem';

// prompt()/best() only read components; ShipSystem/DialogueSystem are touched solely by a verb's run().
const stubShips = {} as ShipSystem;
const sysFor = (world: World, dlg = new DialogueSystem()) => new InteractionSystem(world, stubShips, dlg);

function actorAt(world: World, x: number, y: number): Entity {
  return world.create({ transform: { x, y, angle: 0, r: 12 } });
}

describe('InteractionSystem — generic verbs (the Moat for interaction)', () => {
  it('offers Equip/Take for a nearby pickup, by its components alone', () => {
    const world = new World();
    const a = actorAt(world, 0, 0);
    world.create({ transform: { x: 10, y: 0, angle: 0, r: 10 }, pickup: { item: { cat: 'weapon', id: 'weapon.cutlass' }, label: 'Cutlass' } });
    expect(sysFor(world).prompt(a)).toBe('[E] Take Cutlass'); // generic take label (only a fruit reads 'Eat')
  });

  it('offers nothing when the pickup is out of reach', () => {
    const world = new World();
    const a = actorAt(world, 0, 0);
    world.create({ transform: { x: 200, y: 0, angle: 0, r: 10 }, pickup: { item: { cat: 'fruit', id: 'fruit.gomu' }, label: 'Gomu Gomu no Mi' } });
    expect(sysFor(world).prompt(a)).toBe('');
  });

  it('a self-verb (Disembark) wins over a nearby target while riding', () => {
    const world = new World();
    const a = actorAt(world, 0, 0);
    a.riding = { ship: world.create({ transform: { x: 0, y: 0, angle: 0, r: 30 } }) };
    world.create({ transform: { x: 5, y: 0, angle: 0, r: 10 }, pickup: { item: { cat: 'weapon', id: 'weapon.cutlass' }, label: 'Cutlass' } });
    expect(sysFor(world).prompt(a)).toBe('[E] Disembark');
  });

  it('offers Board near a ship when on foot (radius-aware reach reads the big hull from afar)', () => {
    const world = new World();
    const a = actorAt(world, 0, 0);
    world.create({ transform: { x: 40, y: 0, angle: 0, r: 30 }, ship: { hull: 'ship.sloop', mode: 'exploration', anchored: true, speed: 0 } });
    expect(sysFor(world).prompt(a)).toMatch(/^\[E\] Board the /);
  });

  it('Talk opens a dialogue session; E advances it, then closes after the last line', () => {
    const world = new World();
    const a = actorAt(world, 0, 0);
    world.create({ transform: { x: 10, y: 0, angle: 0, r: 11 }, npc: { dialogue: ['hi', 'bye'] } });
    const dlg = new DialogueSystem();
    const sys = sysFor(world, dlg);
    expect(sys.prompt(a)).toMatch(/^\[E\] Talk to /);
    sys.interact(a); // opens the session
    dlg.update(10); // let the typewriter fully reveal
    expect(dlg.view()?.text).toBe('hi');
    expect(dlg.view()?.last).toBe(false);
    dlg.advance();
    dlg.update(10);
    expect(dlg.view()?.text).toBe('bye');
    expect(dlg.view()?.last).toBe(true);
    dlg.advance();
    expect(dlg.view()).toBeNull(); // conversation over
  });

  it("doesn't offer Take while riding (can() gates on !riding)", () => {
    const world = new World();
    const a = actorAt(world, 0, 0);
    a.riding = { ship: world.create({ transform: { x: 999, y: 999, angle: 0, r: 30 } }) };
    world.create({ transform: { x: 5, y: 0, angle: 0, r: 10 }, pickup: { item: { cat: 'weapon', id: 'weapon.cutlass' }, label: 'Cutlass' } });
    expect(sysFor(world).prompt(a)).toBe('[E] Disembark'); // disembark (self) wins; Take is gated out anyway
  });
});

describe('recruit — talk offers a join-crew choice; Y flips faction + follows', () => {
  it('a recruitable NPC ends dialogue with a choice; choosing YES joins the crew', () => {
    const world = new World();
    const a = actorAt(world, 0, 0);
    a.faction = { id: 'straw_hat' };
    const npc = world.create({
      transform: { x: 10, y: 0, angle: 0, r: 11 },
      identity: { name: 'Soldier' },
      faction: { id: 'bandits' },
      npc: { dialogue: ['for hire'], recruitable: true },
      ai: { brain: (() => undefined) as never, bb: { state: 'wander', home: { x: 10, y: 0 } } as never },
    });
    const dlg = new DialogueSystem();
    const sys = sysFor(world, dlg);
    sys.interact(a); // opens the session with a recruit choice
    dlg.update(10); // reveal the (last) line
    expect(dlg.view()?.choice).toMatch(/Recruit Soldier/); // the prompt shows once the line is revealed
    expect(dlg.choosing).toBe(true);
    dlg.choose(true); // YES
    expect(dlg.active).toBe(false); // dialogue closed
    expect(npc.faction!.id).toBe('straw_hat'); // joined your crew (matrix ally now)
    expect(npc.ai!.bb.followId).toBe(a.id); // and set to FOLLOW you
    expect(npc.npc!.recruitable).toBe(false); // can't be recruited again
  });

  it('choosing NO leaves the NPC unchanged', () => {
    const world = new World();
    const a = actorAt(world, 0, 0);
    a.faction = { id: 'straw_hat' };
    const npc = world.create({
      transform: { x: 10, y: 0, angle: 0, r: 11 },
      identity: { name: 'Soldier' },
      faction: { id: 'bandits' },
      npc: { dialogue: ['for hire'], recruitable: true },
      ai: { brain: (() => undefined) as never, bb: { state: 'wander', home: { x: 10, y: 0 } } as never },
    });
    const dlg = new DialogueSystem();
    sysFor(world, dlg).interact(a);
    dlg.update(10);
    dlg.choose(false); // NO
    expect(npc.faction!.id).toBe('bandits'); // unchanged
    expect(npc.ai!.bb.followId).toBeUndefined();
    expect(npc.npc!.recruitable).toBe(true); // still recruitable
  });

  it('a non-recruitable NPC has no choice (plain talk closes on the last line)', () => {
    const world = new World();
    const a = actorAt(world, 0, 0);
    const npc = world.create({ transform: { x: 10, y: 0, angle: 0, r: 11 }, identity: { name: 'Villager' }, npc: { dialogue: ['hello'] } });
    const dlg = new DialogueSystem();
    sysFor(world, dlg).interact(a);
    dlg.update(10);
    expect(dlg.view()?.choice).toBeUndefined();
    expect(dlg.choosing).toBe(false);
    dlg.advance(); // last line + no choice → closes
    expect(dlg.active).toBe(false);
    void npc;
  });
});

describe('DialogueSystem — typewriter', () => {
  it('reveals progressively, and E skips to the full line (without advancing it)', () => {
    const dlg = new DialogueSystem();
    dlg.open('Bob', ['hello'], 0xe0a070, 0x2e5a35);
    expect(dlg.view()?.text).toBe(''); // nothing revealed at t=0
    dlg.update(0.05); // ~2 chars at 42 cps
    const partial = dlg.view()!.text;
    expect(partial.length).toBeGreaterThan(0);
    expect(partial.length).toBeLessThan('hello'.length);
    dlg.advance(); // mid-type → reveal the rest, don't step the line
    expect(dlg.view()?.text).toBe('hello');
    expect(dlg.view()?.done).toBe(true);
  });

  it('opening with no lines stays inactive', () => {
    const dlg = new DialogueSystem();
    dlg.open('Bob', [], 0, 0);
    expect(dlg.active).toBe(false);
    expect(dlg.view()).toBeNull();
  });
});
