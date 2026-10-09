import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/Rng';
import type { Entity } from '../src/ecs/components';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { EffectSystem } from '../src/systems/EffectSystem';
import type { StrikeResolver } from '../src/systems/StrikeResolver';

function fists(world: World, ability: string): Entity {
  return world.create({
    transform: { x: 0, y: 0, angle: 0, r: 10 },
    combatant: { stam: 100, maxStam: 100, combo: 0, comboT: 0, posture: 0, maxPosture: 20 },
    loadout: { granted: new Set([ability]), cd: new Map(), cdMax: new Map(), utilities: [], primary: ability, heavy: '', dash: '', slots: [] },
  });
}

/** Drive N activations, harvesting which side each swing threw from. */
function swingSides(abilities: AbilitySystem, e: Entity, ability: string, n: number): number[] {
  const sides: number[] = [];
  for (let i = 0; i < n; i++) {
    expect(abilities.activate(e, ability)).toBe(true);
    sides.push(e.melee!.side);
    delete e.melee; // swing finished
    e.loadout!.cd.clear(); // cooldown elapsed
  }
  return sides;
}

describe('AbilitySystem — swing sides alternate, never random', () => {
  it('consecutive punches throw right → left → right → left', () => {
    const world = new World();
    // strikes stubbed: a bare punch is a melee swing — StrikeResolver is only consulted by pistol/AoE paths
    const abilities = new AbilitySystem(world, new EffectSystem(world), {} as StrikeResolver, new Rng(7));
    const e = fists(world, 'ability.punch');
    // +1 = the lead/weapon (right) hand — the same convention armed swings use
    expect(swingSides(abilities, e, 'ability.punch', 4)).toEqual([1, -1, 1, -1]);
  });

  it('consecutive kicks mirror the same way (the existing foot axis)', () => {
    const world = new World();
    const abilities = new AbilitySystem(world, new EffectSystem(world), {} as StrikeResolver, new Rng(7));
    const e = fists(world, 'ability.kick');
    expect(swingSides(abilities, e, 'ability.kick', 4)).toEqual([1, -1, 1, -1]);
  });
});
