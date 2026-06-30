import { describe, expect, it } from 'vitest';
import { equip, unequip } from '../src/combat/equip';
import { StatBlock } from '../src/combat/Stat';
import { TagSet } from '../src/combat/Tags';
import type { Entity } from '../src/ecs/components';

/** A bare combat entity (no Phaser components) — equip() only touches attributes/tags/loadout/equipment. */
function makeFighter(): Entity {
  return {
    id: 1,
    attributes: new StatBlock({ atk: 9, def: 0 }),
    tags: new TagSet(),
    loadout: {
      granted: new Set(['ability.punch', 'ability.dodge']),
      cd: new Map(),
      primary: 'ability.punch',
      dash: 'ability.dodge',
      slots: [],
    },
    equipment: { potentials: [] },
  } as unknown as Entity;
}

describe('four-layer combat composition (data-driven)', () => {
  it('stacks weapon + style + potential + fruit into one StatBlock + loadout + tags', () => {
    const e = makeFighter();
    equip(e, 'weapon', 'weapon.cutlass'); // +6 atk, primary=slash, tag weapon.class.medium
    equip(e, 'style', 'style.flashstep'); // +2 atk, dash=flashDash
    equip(e, 'potential', 'potential.ironbody'); // +15% atk, +10 def
    equip(e, 'fruit', 'fruit.gomu'); // +5 atk, primary=pistol, slots gatling/rocket, tag fruit.type.paramecia

    expect(e.attributes!.get('atk')).toBeCloseTo(25.3, 5); // (9+6+2+5) × 1.15
    expect(e.attributes!.get('def')).toBe(10);
    expect(e.loadout!.primary).toBe('ability.gomuPistol'); // fruit takes over the basic attack
    expect(e.loadout!.dash).toBe('ability.flashDash');
    expect([...e.loadout!.slots]).toEqual(['ability.gomuGatling', 'ability.gomuRocket']);
    expect(e.loadout!.granted.has('ability.gomuGatling')).toBe(true);
    expect(e.tags!.hasPrefix('fruit.type')).toBe(true);
    expect(e.tags!.has('weapon.class.medium')).toBe(true);
  });

  it('unequipping the fruit cleanly reverts stats, abilities, and tags', () => {
    const e = makeFighter();
    equip(e, 'weapon', 'weapon.cutlass');
    equip(e, 'style', 'style.flashstep');
    equip(e, 'potential', 'potential.ironbody');
    equip(e, 'fruit', 'fruit.gomu');

    unequip(e, 'fruit');
    expect(e.attributes!.get('atk')).toBeCloseTo(19.55, 5); // (9+6+2) × 1.15
    expect(e.loadout!.primary).toBe('ability.slash'); // back to the weapon's attack
    expect(e.loadout!.slots).toEqual([]);
    expect(e.tags!.has('fruit.type.paramecia')).toBe(false);
  });
});
