import { describe, expect, it } from 'vitest';
import { Abilities } from '../src/combat/Ability';
import { Rng } from '../src/core/Rng';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { Units } from '../src/defs/units';

/**
 * Locks the "every unit, same system" contract: AI actors attack through the SAME ability path as the
 * player — a registered AbilityDef whose damage scales off the `atk` attribute (not a bespoke flat number).
 */
describe('unified combat — AI fights via attribute-scaled abilities', () => {
  it('every spawned unit RESOLVES to a registered primary attack (weapon ?? fruit ?? attackAbility ?? fist)', () => {
    // attackAbility is now the UNARMED fallback (optional) — the real primary is resolved at spawn (a
    // weapon/fruit wins). Assert the RESOLVED loadout.primary, not the raw def field.
    const sp = new Spawner(new World(), new Rng(1));
    for (const u of Units.all()) {
      const e = sp.spawnUnit(u.id, 0, 0);
      expect(e.loadout!.primary, `${u.id} resolved primary`).toBeTruthy();
      expect(Abilities.has(e.loadout!.primary), `${e.loadout!.primary} should be registered`).toBe(true);
    }
  });

  it('hero and enemy basic attacks share one resolution contract (damage from atk)', () => {
    const heroPunch = Abilities.get('ability.punch');
    const gruntStrike = Abilities.get('ability.banditStrike');
    const bossStrike = Abilities.get('ability.brawlerStrike');
    expect(heroPunch.damageStat).toBe('atk');
    expect(gruntStrike.damageStat).toBe('atk');
    expect(bossStrike.damageStat).toBe('atk');
    // all are melee cone attacks resolved by the same AbilitySystem.resolveHit path
    expect(heroPunch.shape?.swing).toBe('melee');
    expect(gruntStrike.shape?.swing).toBe('melee');
  });
});
