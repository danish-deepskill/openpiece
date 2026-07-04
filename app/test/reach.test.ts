import { describe, expect, it } from 'vitest';
import { Abilities, abilityRange } from '../src/combat/Ability';

// reach now = race baseline × race.reachMul × size (resolved at spawn); abilityRange stays a pure fn of the
// resolved reach, so these pass a resolved reach directly (34 = a human's, 46 = a giant's — the old figures)
describe('abilityRange — reach = body reach + weapon bonus (melee), fixed (ranged)', () => {
  it('unarmed melee reach comes from the body, scaled by the strike (short punch, long kick)', () => {
    expect(abilityRange(Abilities.get('ability.punch'), 34)).toBe(29); // 34 × 0.85 (a short jab)
    expect(abilityRange(Abilities.get('ability.kick'), 34)).toBe(49); // 34 × 1.45 (a long kick)
    expect(abilityRange(Abilities.get('ability.banditStrike'), 34)).toBe(34); // no reachMul → body 34
    expect(abilityRange(Abilities.get('ability.brawlerStrike'), 46)).toBe(46); // a giant reaches further
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
