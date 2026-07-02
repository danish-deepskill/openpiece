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
    world.create({ transform: { x: 10, y: 0, angle: 0, r: 10 }, pickup: { kind: 'weapon', defId: 'weapon.cutlass', label: 'Cutlass' } });
    expect(sysFor(world).prompt(a)).toBe('[E] Equip Cutlass');
  });

  it('offers nothing when the pickup is out of reach', () => {
    const world = new World();
    const a = actorAt(world, 0, 0);
    world.create({ transform: { x: 200, y: 0, angle: 0, r: 10 }, pickup: { kind: 'fruit', defId: 'fruit.gomu', label: 'Gomu Gomu no Mi' } });
    expect(sysFor(world).prompt(a)).toBe('');
  });

  it('a self-verb (Disembark) wins over a nearby target while riding', () => {
    const world = new World();
    const a = actorAt(world, 0, 0);
    a.riding = { ship: world.create({ transform: { x: 0, y: 0, angle: 0, r: 30 } }) };
    world.create({ transform: { x: 5, y: 0, angle: 0, r: 10 }, pickup: { kind: 'weapon', defId: 'weapon.cutlass', label: 'Cutlass' } });
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
    world.create({ transform: { x: 5, y: 0, angle: 0, r: 10 }, pickup: { kind: 'weapon', defId: 'weapon.cutlass', label: 'Cutlass' } });
    expect(sysFor(world).prompt(a)).toBe('[E] Disembark'); // disembark (self) wins; Take is gated out anyway
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
