import { describe, expect, it } from 'vitest';
import { Abilities, abilityRange } from '../src/combat/Ability';
import { Bodies } from '../src/defs/bodies';

describe('abilityRange — reach = body reach + weapon bonus (melee), fixed (ranged)', () => {
  it('unarmed melee reach comes from the body, scaled by the strike (short punch, long kick)', () => {
    expect(abilityRange(Abilities.get('ability.punch'), Bodies.hero.reach)).toBe(29); // 34 × 0.85 (a short jab)
    expect(abilityRange(Abilities.get('ability.kick'), Bodies.hero.reach)).toBe(49); // 34 × 1.45 (a long kick)
    expect(abilityRange(Abilities.get('ability.banditStrike'), Bodies.grunt.reach)).toBe(34); // no reachMul → body 34
    expect(abilityRange(Abilities.get('ability.captainCleave'), Bodies.captain.reach)).toBe(46); // bigger body reaches further
  });

  it('an armed swing reaches mostly via the weapon (arm stays home: 0.3·reach + length)', () => {
    expect(abilityRange(Abilities.get('ability.cut'), 34)).toBe(40); // round(0.3·34 + 30)
    expect(abilityRange(Abilities.get('ability.cut'), 46)).toBe(44); // longer-limbed wielder reaches a little further
  });

  it('a Gomu stretch reaches its full rubber-arm length, independent of body reach', () => {
    expect(abilityRange(Abilities.get('ability.gomuPistol'), 34)).toBe(118);
    expect(abilityRange(Abilities.get('ability.gomuPistol'), 999)).toBe(118);
  });
});
