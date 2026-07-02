import { describe, expect, it } from 'vitest';
import type { Entity } from '../src/ecs/components';
import { World } from '../src/ecs/World';
import { CombatantSystem } from '../src/systems/CombatantSystem';

function fighter(world: World, over: Record<string, number> = {}): Entity {
  return world.create({ combatant: { stam: 50, maxStam: 100, combo: 0, comboT: 0, ...over } });
}

describe('CombatantSystem — delayed stamina regen + hitstun decay', () => {
  it('does NOT regen while the post-spend delay is active', () => {
    const world = new World();
    const e = fighter(world, { stam: 50, regenT: 1 });
    new CombatantSystem(world).update(0.5);
    expect(e.combatant!.stam).toBe(50); // still inside the delay → no recovery
    expect(e.combatant!.regenT).toBeCloseTo(0.5, 5);
  });

  it('regens once the delay has elapsed (12/s)', () => {
    const world = new World();
    const e = fighter(world, { stam: 50, regenT: 0 });
    new CombatantSystem(world).update(1);
    expect(e.combatant!.stam).toBeCloseTo(62, 5);
  });

  it('caps stamina at max', () => {
    const world = new World();
    const e = fighter(world, { stam: 98, regenT: 0 });
    new CombatantSystem(world).update(1);
    expect(e.combatant!.stam).toBe(100);
  });

  it('decays hitstun toward zero', () => {
    const world = new World();
    const e = fighter(world, { stunT: 0.4 });
    new CombatantSystem(world).update(0.3);
    expect(e.combatant!.stunT).toBeCloseTo(0.1, 5);
  });
});
