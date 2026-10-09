import { describe, expect, it } from 'vitest';
import { Abilities, abilityProblem, type AbilityDef } from '../src/combat/Ability';
import { StatBlock } from '../src/combat/StatBlock';
import { abilityRange, abilityReach, weaponLenOf } from '../src/combat/swing';
import { weaponProblem, Weapons, type WeaponDef } from '../src/defs/layers';
import type { Entity } from '../src/ecs/components';

// reach = race baseline × race.reachMul × size (resolved at spawn: 34 = a human's, 46 = a giant's); the weapon's
// length is the EQUIPPED weapon row's drawn length — never a number on the ability row (the old second source).
const human = (weapon?: string): Entity =>
  ({ id: 1, attributes: new StatBlock({ reach: 34 }), equipment: weapon ? { weapon, potentials: [] } : undefined }) as unknown as Entity;

describe('abilityRange — reach = body reach + the held weapon (melee), fixed (ranged)', () => {
  it('unarmed melee reach comes from the body, scaled by the strike (short punch, long kick)', () => {
    expect(abilityRange(Abilities.get('ability.punch'), 34)).toBe(29); // 34 × 0.85 (a short jab)
    expect(abilityRange(Abilities.get('ability.kick'), 34)).toBe(37); // 34 × 1.1 (a medium-reach kick)
    expect(abilityRange(Abilities.get('ability.banditStrike'), 34)).toBe(34); // no reachMul → body 34
    expect(abilityRange(Abilities.get('ability.brawlerStrike'), 46)).toBe(46); // a giant reaches further
  });

  it('an armed swing reaches mostly via the weapon (arm stays home: 0.3·reach + length)', () => {
    expect(abilityRange(Abilities.get('ability.cut'), 34, 30)).toBe(40); // round(0.3·34 + 30) — the swung cutlass tip measures 39.7
    expect(abilityRange(Abilities.get('ability.cut'), 46, 30)).toBe(44); // longer-limbed wielder reaches a little further
    expect(abilityRange(Abilities.get('ability.swordSlash1'), 34, 38)).toBe(48); // the sword's tip measures 47.6
  });

  it('a foot strike is the LEG whatever the hand holds (swingPose zeroes the weapon for limb: foot)', () => {
    expect(abilityRange(Abilities.get('ability.kick'), 34, 38)).toBe(37);
  });

  it('a Gomu stretch reaches its full rubber-arm length, independent of body reach or a held weapon', () => {
    expect(abilityRange(Abilities.get('ability.gomuPistol'), 34)).toBe(118);
    expect(abilityRange(Abilities.get('ability.gomuPistol'), 999, 38)).toBe(118);
  });
});

describe('abilityReach — the wielder decides: swap the weapon and the reach follows, no row edited', () => {
  it('reads the equipped weapon row, bare = 0', () => {
    expect(weaponLenOf(human())).toBe(0);
    expect(weaponLenOf(human('weapon.sword'))).toBe(38);
    expect(weaponLenOf(human('weapon.dagger'))).toBe(22);
  });

  it('the same row reaches 48 with a sword in hand and 32 with a dagger', () => {
    const slash = Abilities.get('ability.swordSlash1');
    expect(abilityReach(human('weapon.sword'), slash)).toBe(48);
    expect(abilityReach(human('weapon.dagger'), slash)).toBe(32);
    expect(abilityReach(human(), slash)).toBe(34); // disarmed → a bare-handed swing's arm length
  });

  it('every melee weapon row in content engages at its own drawn tip (none at fist reach)', () => {
    for (const w of ['weapon.cutlass', 'weapon.sword', 'weapon.dagger', 'weapon.katana']) {
      const e = human(w);
      expect(abilityReach(e, Abilities.get(Weapons.get(w).primary))).toBe(Math.round(0.3 * 34 + weaponLenOf(e)));
    }
  });
});

describe('the weapon validator refuses a melee row without a visual (it would fight as a fist)', () => {
  it('rejects a visual-less melee weapon, accepts a ranged one and a drawn blade', () => {
    const base = { id: 'weapon.testBare', name: 'x', weaponClass: 'medium', primary: 'ability.cut', modifiers: [], tags: [] } as WeaponDef;
    expect(weaponProblem(base)).toMatch(/must author `visual`/);
    expect(weaponProblem({ ...base, visual: { kind: 'blade', length: 30, width: 5, color: 0 } })).toBeNull();
    expect(weaponProblem({ ...base, weaponClass: 'ranged', primary: 'ability.musketShot' })).toBeNull();
  });
});

describe('the ability validator keeps the one source', () => {
  const base = { id: 'ability.testReach', name: 'x', cooldown: 1, damageStat: 'atk' } as AbilityDef;

  it('rejects a melee swing that authors shape.range', () => {
    expect(abilityProblem({ ...base, shape: { range: 36, arc: 0.5, swing: 'melee', pattern: 'arc' } })).toMatch(/don't author shape\.range/);
    expect(abilityProblem({ ...base, shape: { arc: 0.5, swing: 'melee', pattern: 'arc' } })).toBeNull();
  });

  it('requires a fixed range on a pistol cone, a shot and a stretch', () => {
    expect(abilityProblem({ ...base, shape: { arc: 0.3, swing: 'pistol' } })).toMatch(/'pistol' ability needs range > 0/);
    expect(abilityProblem({ ...base, shape: { arc: 0.3, swing: 'shot', shotSpeed: 400 } })).toMatch(/'shot' ability needs range > 0/);
    expect(abilityProblem({ ...base, shape: { arc: 0.3, swing: 'melee', pattern: 'stretch' } })).toMatch(/stretch ability needs range > 0/);
  });
});
