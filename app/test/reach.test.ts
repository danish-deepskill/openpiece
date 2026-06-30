import { describe, expect, it } from 'vitest';
import { Abilities, abilityRange } from '../src/combat/Ability';
import { Bodies } from '../src/defs/actors';

describe('abilityRange — reach = body reach + weapon bonus (melee), fixed (ranged)', () => {
  it('unarmed melee reach comes from the body (humans are equal)', () => {
    expect(abilityRange(Abilities.get('ability.punch'), Bodies.hero.reach)).toBe(34); // hero body 34
    expect(abilityRange(Abilities.get('ability.banditStrike'), Bodies.grunt.reach)).toBe(34); // grunt body 34 — equal
    expect(abilityRange(Abilities.get('ability.captainCleave'), Bodies.captain.reach)).toBe(46); // bigger body reaches further
  });

  it('a weapon adds its length on top of body reach', () => {
    expect(abilityRange(Abilities.get('ability.slash'), 34)).toBe(64); // 34 body + 30 cutlass thrust
    expect(abilityRange(Abilities.get('ability.slash'), 46)).toBe(76); // same sword, longer-limbed wielder reaches further
  });

  it('ranged abilities are a fixed range (body reach does not apply)', () => {
    expect(abilityRange(Abilities.get('ability.gomuPistol'), 34)).toBe(300);
    expect(abilityRange(Abilities.get('ability.gomuPistol'), 999)).toBe(300);
  });
});
