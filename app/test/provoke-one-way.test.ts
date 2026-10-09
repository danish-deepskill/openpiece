import { afterAll, describe, expect, it } from 'vitest';
import { Abilities } from '../src/combat/Ability';
import { entityHostile, grudges } from '../src/combat/targeting';
import { Rng } from '../src/core/Rng';
import { FactionDefs, factions } from '../src/defs/factions';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { Damage } from '../src/systems/Damage';
import { StrikeResolver } from '../src/systems/StrikeResolver';
import { SpatialQuery } from '../src/world/SpatialQuery';

/**
 * THE PROVOKE RULE across a ONE-WAY stance. The faction matrix is directional; the "already enemies, no grudge needed"
 * short-circuit must be judged from the VICTIM's side, or a one-way hater's victim never turns on it (the bug that left
 * the Ronin standing while Zoro cut him, before the arena pair was made mutual). No shipped pair is one-way any more, so
 * this file builds one: the ronin's stance toward challengers is dropped for the file (vitest isolates modules per file;
 * restored after anyway) — a documented matrix mutation, the one place it is allowed.
 */
const saved = FactionDefs.ronin.stances;
FactionDefs.ronin.stances = undefined; // challengers → ronin stays hostile; ronin → challengers is now neutral: one-way
afterAll(() => {
  FactionDefs.ronin.stances = saved;
});

describe('provokeTerritorial — judged from the victim\'s side', () => {
  it('the one-way hater lands a cut → the struck neutral holds a grudge and its brain finds the attacker', () => {
    expect(factions.isHostile('challengers', 'ronin')).toBe(true);
    expect(factions.isHostile('ronin', 'challengers')).toBe(false); // the one-way premise
    const world = new World();
    const sp = new Spawner(world, new Rng(4));
    const zoro = sp.spawnUnit('unit.zoroAdvanced', 0, 0);
    const ronin = sp.spawnUnit('unit.ronin', 40, 0);
    const query = new SpatialQuery(world);
    expect(entityHostile(ronin, zoro)).toBe(false);
    expect(query.nearestHostile(ronin, 500)).toBeUndefined(); // he hunts nobody…
    new StrikeResolver(new Damage(), new Rng(1)).hit(zoro, ronin, Abilities.get('ability.toro'), 10, 0, 0);
    expect(grudges(ronin, zoro)).toBe(true); // …until struck — the attacker's own hostility must not pre-empt the grudge
    expect(entityHostile(ronin, zoro)).toBe(true);
    expect(query.nearestHostile(ronin, 500)).toBe(zoro);
  });

  it('a MUTUAL enemy striking you forms no grudge (the matrix already covers it — the rule stays the neutral case)', () => {
    const sp = new Spawner(new World(), new Rng(4));
    const bandit = sp.spawnUnit('unit.thug', 0, 0); // bandits: hostile to all
    const marine = sp.spawnUnit('unit.marineOfficer', 40, 0); // marine: hostile to bandits
    new StrikeResolver(new Damage(), new Rng(1)).hit(bandit, marine, Abilities.get('ability.punch'), 5, 0, 0);
    expect(grudges(marine, bandit)).toBe(false);
  });
});
