import { describe, expect, it } from 'vitest';
import { StatBlock } from '../src/combat/StatBlock';
import type { AI, Entity } from '../src/ecs/components';
import { World } from '../src/ecs/World';
import { unitPlateView } from '../src/ui/plateView';

/** A minimal inspectable unit — only the components the projection reads. */
function unit(world: World, over: Partial<Entity> = {}): Entity {
  return world.create({
    identity: { name: 'Brute', tier: 'E+' },
    health: { hp: 40.4, maxHp: 78, dead: false, hitFlash: 0, iframes: 0 },
    faction: { id: 'bandits' },
    combatant: { stam: 55, maxStam: 100, combo: 0, comboT: 0 },
    attributes: new StatBlock({ health: 78, endurance: 100, defense: 2, willpower: 0, luck: 0, spiritual: 0, atk: 9, atkSpeed: 0.65, reach: 24 }),
    ...over,
  });
}

describe('unitPlateView — one readout shape for every unit', () => {
  it('projects identity, faction, vitals, the six attributes, and effective combat stats', () => {
    const w = new World();
    const v = unitPlateView(unit(w))!;
    expect(v.name).toBe('Brute');
    expect(v.tier).toBe('E+');
    expect(v.factionName).toBe('Island Bandits'); // display name resolved through FactionDefs
    expect(v.hp).toBeCloseTo(40.4);
    expect(v.maxHp).toBe(78);
    expect(v.stam).toBe(55);
    expect(v.maxStam).toBe(100);
    expect(v.attributes).toEqual({ health: 78, endurance: 100, defense: 2, willpower: 0, luck: 0, spiritual: 0 });
    expect(v.atk).toBe(9);
    expect(v.atkSpeed).toBeCloseTo(0.65);
    expect(v.reach).toBe(24);
  });

  it('shows effective def (attribute-derived + gear), not the raw attribute', () => {
    const w = new World();
    const e = unit(w);
    e.attributes!.add({ stat: 'def', op: 'flat', value: 2, source: 'derived:attributes' });
    e.attributes!.add({ stat: 'def', op: 'flat', value: 3, source: 'weapon:buckler' });
    expect(unitPlateView(e)!.def).toBe(5);
    expect(unitPlateView(e)!.attributes.defense).toBe(2); // the allocation-facing number stays separate
  });

  it('shows squad + FSM state for AI units, but hides the state for the controlled unit', () => {
    const w = new World();
    // stub brain: the projection reads ONLY bb.state, so an empty fn + bare bb is safe here
    const ai = { brain: () => undefined, bb: { state: 'chase' } } as unknown as AI;
    const npc = unit(w, { ai, squad: { id: 1, name: 'Dock Gang' } });
    const vNpc = unitPlateView(npc)!;
    expect(vNpc.squadName).toBe('Dock Gang');
    expect(vNpc.aiState).toBe('chase');

    const hero = unit(w, { ai, control: {} });
    expect(unitPlateView(hero)!.aiState).toBeNull(); // input drives it — the blackboard would lie
  });

  it('returns null for non-units (no identity/health — pickups, bare ships)', () => {
    const w = new World();
    const pickup = w.create({ transform: { x: 0, y: 0, angle: 0, r: 10 } });
    expect(unitPlateView(pickup)).toBeNull();
  });
});
