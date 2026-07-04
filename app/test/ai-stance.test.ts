import { describe, expect, it } from 'vitest';
import { AIProfiles, combatStance } from '../src/defs/aiProfiles';

const rusher = AIProfiles.get('ai.rusher');
const kiter = AIProfiles.get('ai.kiter');
const guard = AIProfiles.get('ai.guard');
const coward = AIProfiles.get('ai.coward');
const master = AIProfiles.get('ai.master'); // has regroupBelowStam 0.3 / reengageStam 0.75

describe('combatStance (AI decision)', () => {
  it('rusher: approach when out of reach, attack when in reach', () => {
    const out = combatStance(rusher, 100, 40, 1, 0);
    expect(out.move).toBe('approach');
    expect(out.attack).toBe(false);
    const inR = combatStance(rusher, 30, 40, 1, 0);
    expect(inR.move).toBe('hold');
    expect(inR.attack).toBe(true);
  });

  it('kiter: backs off when closer than its preferred range', () => {
    expect(combatStance(kiter, 50, 40, 1, 0).move).toBe('away'); // < preferredRange 170
    expect(combatStance(kiter, 250, 40, 1, 0).move).toBe('approach'); // beyond preferred range
  });

  it('guard: returns home when the target leaves its post, engages within it', () => {
    expect(combatStance(guard, 30, 40, 1, 999).move).toBe('home'); // target far from post
    const inPost = combatStance(guard, 30, 40, 1, 50);
    expect(inPost.move).toBe('hold');
    expect(inPost.attack).toBe(true);
  });

  it('coward: always flees', () => {
    expect(combatStance(coward, 300, 40, 1, 0).move).toBe('away');
    expect(combatStance(coward, 30, 40, 1, 0).move).toBe('away');
  });
});

describe('combatStance — tactical stamina retreat (hysteresis)', () => {
  const home = 50; // inside the master's guardRadius so the post-check doesn't preempt

  it('full stamina: fights normally (no regroup)', () => {
    const s = combatStance(master, 30, 40, 1, home, 1.0, false);
    expect(s.attack).toBe(true);
    expect(s.regroup).toBe(false);
  });

  it('drops below regroupBelowStam → breaks off, backs to spacing, stops attacking', () => {
    const s = combatStance(master, 30, 40, 1, home, 0.25, false); // 0.25 ≤ 0.3
    expect(s.regroup).toBe(true);
    expect(s.attack).toBe(false);
    expect(s.move).toBe('away'); // too close → retreat to regen
  });

  it('HYSTERESIS: still regrouping in the mid-band (does not re-engage until reengageStam)', () => {
    // 0.5 is above regroupBelowStam(0.3) but below reengageStam(0.75): a memoryless check would re-engage;
    // the band keeps it out until fully recovered.
    const s = combatStance(master, 30, 40, 1, home, 0.5, true);
    expect(s.regroup).toBe(true);
    expect(s.attack).toBe(false);
  });

  it('recovers to reengageStam → re-engages fresh, attacks again', () => {
    const s = combatStance(master, 30, 40, 1, home, 0.8, true); // 0.8 ≥ 0.75
    expect(s.regroup).toBe(false);
    expect(s.attack).toBe(true);
  });

  it('while regrouping at range, HOLDS spacing (does not creep back in early)', () => {
    const s = combatStance(master, 250, 40, 1, home, 0.25, true); // already far, low stam
    expect(s.move).toBe('hold');
    expect(s.attack).toBe(false);
  });

  it('a profile without the knobs never regroups (fodder fights to exhaustion)', () => {
    expect(combatStance(rusher, 30, 40, 1, 0, 0.01, false).attack).toBe(true); // empty bar, still swinging
    expect(combatStance(rusher, 30, 40, 1, 0, 0.01, false).regroup).toBe(false);
  });
});
