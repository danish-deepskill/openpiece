import { describe, expect, it } from 'vitest';
import { factions } from '../src/defs/factions';
import { Rng } from '../src/core/Rng';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { Units } from '../src/defs/units';

describe('Factions — two sides: {straw_hat, civilians} ⚔ {bandits}', () => {
  it('the player crew and townsfolk are allies, never hostile to each other', () => {
    expect(factions.isHostile('straw_hat', 'civilians')).toBe(false);
    expect(factions.isHostile('civilians', 'straw_hat')).toBe(false);
    expect(factions.isAlly('straw_hat', 'civilians')).toBe(true);
  });

  it('both allied factions are hostile to the bandits (player AND townsfolk fight them)', () => {
    expect(factions.isHostile('straw_hat', 'bandits')).toBe(true);
    expect(factions.isHostile('civilians', 'bandits')).toBe(true);
  });

  it('the bandits are hostile to both (so they attack townsfolk too)', () => {
    expect(factions.isHostile('bandits', 'civilians')).toBe(true);
    expect(factions.isHostile('bandits', 'straw_hat')).toBe(true);
  });

  it('a faction is always allied with itself', () => {
    expect(factions.isAlly('bandits', 'bandits')).toBe(true);
  });
});

describe('Villager — a full unit on the same stack (the Moat)', () => {
  it('is a real UnitDef: civilians, tier F, townsfolk AI, fists, conversable', () => {
    const v = Units.get('unit.villager');
    expect(v.faction).toBe('civilians');
    expect(v.tier).toBe('F');
    expect(v.aiProfile).toBe('ai.townsfolk');
    expect((v.dialogue ?? []).length).toBeGreaterThan(0);
    // "fists" — no weapon, no style, so its primary resolves to the base-kit fist at spawn
    const spawned = new Spawner(new World(), new Rng(1)).spawnUnit('unit.villager', 0, 0);
    expect(spawned.loadout!.primary).toBe('ability.punch');
  });
});
