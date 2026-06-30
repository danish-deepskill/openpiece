import { describe, expect, it } from 'vitest';
import { AIProfiles, combatStance } from '../src/defs/aiProfiles';

const rusher = AIProfiles.get('ai.rusher');
const kiter = AIProfiles.get('ai.kiter');
const guard = AIProfiles.get('ai.guard');
const coward = AIProfiles.get('ai.coward');

describe('combatStance (AI decision)', () => {
  it('rusher: approach when out of reach, attack when in reach', () => {
    expect(combatStance(rusher, 100, 40, 1, 0)).toEqual({ move: 'approach', attack: false });
    expect(combatStance(rusher, 30, 40, 1, 0)).toEqual({ move: 'hold', attack: true });
  });

  it('kiter: backs off when closer than its preferred range', () => {
    expect(combatStance(kiter, 50, 40, 1, 0).move).toBe('away'); // < preferredRange 170
    expect(combatStance(kiter, 250, 40, 1, 0).move).toBe('approach'); // beyond preferred range
  });

  it('guard: returns home when the target leaves its post, engages within it', () => {
    expect(combatStance(guard, 30, 40, 1, 999).move).toBe('home'); // target far from post
    expect(combatStance(guard, 30, 40, 1, 50)).toEqual({ move: 'hold', attack: true }); // inside post + in reach
  });

  it('coward: always flees', () => {
    expect(combatStance(coward, 300, 40, 1, 0).move).toBe('away');
    expect(combatStance(coward, 30, 40, 1, 0).move).toBe('away');
  });
});
