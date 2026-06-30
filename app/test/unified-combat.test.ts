import { describe, expect, it } from 'vitest';
import { Abilities } from '../src/combat/Ability';
import { Units } from '../src/defs/units';

/**
 * Locks the "every unit, same system" contract: AI actors attack through the SAME ability path as the
 * player — a registered AbilityDef whose damage scales off the `atk` attribute (not a bespoke flat number).
 */
describe('unified combat — AI fights via attribute-scaled abilities', () => {
  it('every UnitDef points at a registered attack ability', () => {
    for (const u of Units.all()) {
      expect(u.attackAbility, `${u.id} should define an attackAbility`).toBeTruthy();
      expect(Abilities.has(u.attackAbility), `${u.attackAbility} should be registered`).toBe(true);
    }
  });

  it('hero and enemy basic attacks share one resolution contract (damage from atk)', () => {
    const heroPunch = Abilities.get('ability.punch');
    const gruntStrike = Abilities.get('ability.banditStrike');
    const captainCleave = Abilities.get('ability.captainCleave');
    expect(heroPunch.damageStat).toBe('atk');
    expect(gruntStrike.damageStat).toBe('atk');
    expect(captainCleave.damageStat).toBe('atk');
    // all are melee cone attacks resolved by the same AbilitySystem.resolveHit path
    expect(heroPunch.shape?.swing).toBe('melee');
    expect(gruntStrike.shape?.swing).toBe('melee');
  });
});
