import { describe, expect, it } from 'vitest';
import type { AIContext } from '../src/ai/Brain';
import { pickAttack } from '../src/ai/brains';
import { Abilities } from '../src/combat/Ability';
import { dominance } from '../src/combat/dominance';
import { applyEffect } from '../src/combat/Effect';
import { tryGuard } from '../src/combat/guard';
import { swingWeight } from '../src/combat/phases';
import { letters, type PowerTier } from '../src/combat/PowerTier';
import { Rng } from '../src/core/Rng';
import { AIProfiles, aiProfileProblem } from '../src/defs/aiProfiles';
import type { Entity } from '../src/ecs/components';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { Damage } from '../src/systems/Damage';
import { EffectSystem } from '../src/systems/EffectSystem';
import { StrikeResolver } from '../src/systems/StrikeResolver';

/** A seeded rng that also COUNTS its draws — the proof that a 0 knob costs no roll (determinism of the stream). */
function countingRng(seed: number): { rng: Rng; draws: () => number } {
  const rng = new Rng(seed);
  let n = 0;
  const next = rng.next.bind(rng);
  rng.next = () => { n++; return next(); };
  return { rng, draws: () => n };
}

function rig(seed = 1) {
  const world = new World();
  const sp = new Spawner(world, new Rng(seed));
  const abilities = new AbilitySystem(world, new EffectSystem(world), {} as StrikeResolver, new Rng(1));
  const { rng, draws } = countingRng(seed);
  const ctx = { abilities, rng } as unknown as AIContext; // pickAttack reads only abilities + rng
  return { sp, ctx, draws };
}

describe('punishChance — the riposte: a staggered foe in the heavy\'s reach gets the heavy', () => {
  it('the ronin answers a stagger with the dash-thrust far more often than the rotation would', () => {
    const { sp, ctx } = rig(3);
    const ronin = sp.spawnUnit('unit.ronin', 30, 0);
    const foe = sp.spawnUnit('unit.samurai', 0, 0);
    const count = (): number => { let n = 0; for (let i = 0; i < 40; i++) if (pickAttack(ronin, ctx, 30, foe) === 'ability.shukuchiZuki') n++; return n; };
    const baseline = count();
    applyEffect(foe, 'effect.staggered', 'test', 10);
    const punished = count();
    expect(punished).toBeGreaterThan(baseline);
    expect(punished).toBeGreaterThanOrEqual(30); // ~0.9 of 40
  });

  it('unaffordable, or out of the heavy\'s reach, the riposte never fires', () => {
    const { sp, ctx } = rig(3);
    const ronin = sp.spawnUnit('unit.ronin', 30, 0);
    const foe = sp.spawnUnit('unit.samurai', 0, 0);
    applyEffect(foe, 'effect.staggered', 'test', 10);
    ronin.combatant!.stam = 0;
    expect(pickAttack(ronin, ctx, 30, foe)).toBe('ability.shukuchiGiri');
    ronin.combatant!.stam = 100;
    expect(pickAttack(ronin, ctx, 600, foe)).toBe('ability.shukuchiGiri');
  });

  it('a profile without the knob spends NO roll on it — fodder\'s rng stream is untouched by the seam', () => {
    const { sp, ctx, draws } = rig(5);
    const thug = sp.spawnUnit('unit.thug', 30, 0); // ai.rusher: specialChance 0, punishChance unset
    const foe = sp.spawnUnit('unit.soldier', 0, 0);
    applyEffect(foe, 'effect.staggered', 'test', 10);
    expect(pickAttack(thug, ctx, 20, foe)).toBe(thug.loadout!.primary);
    expect(draws()).toBe(0);
  });
});

describe('parryByWeight — validated so one roll still splits parry | block | neither', () => {
  const base = AIProfiles.get('ai.ronin');
  it('rejects an override that, with blockChance, exceeds 1; accepts the Ronin\'s own row', () => {
    expect(aiProfileProblem(base)).toBeNull();
    expect(aiProfileProblem({ ...base, blockChance: 0.5, dodgeByWeight: undefined, parryByWeight: { heavy: 0.9 } })).toMatch(/parryByWeight\.heavy \+ blockChance/);
  });
  it('rejects a punishChance outside [0, 1]', () => {
    expect(aiProfileProblem({ ...base, punishChance: 1.5 })).toMatch(/punishChance must be in/);
  });
});

describe('swingWeight — the ONE classifier the parry read and the posture table share', () => {
  it('a kick thrown with a katana sheathed is light; the katana\'s own cut is medium', () => {
    const e = new Spawner(new World(), new Rng(1)).spawnUnit('unit.ronin', 0, 0);
    expect(swingWeight(e, Abilities.get('ability.kick'))).toBe('light');
    expect(swingWeight(e, Abilities.get('ability.shukuchiGiri'))).toBe('medium');
  });
});

describe('parryShift — "unparryable" is tier-relative: beats equals, not masters', () => {
  /** Kokutō from a COATED ronin (it needs the coating) against a sworded defender at `tier`, coated or not. */
  function kokuto(tier: PowerTier, coated: boolean) {
    const world = new World();
    const sp = new Spawner(world, new Rng(3));
    const ronin = sp.spawnUnit('unit.ronin', 30, 0);
    const foe = sp.spawnUnit('unit.samurai', 0, 0);
    foe.identity!.tier = tier;
    foe.transform!.angle = 0; // faces him
    foe.combatant!.maxPosture = 500; // so a block holds and we read the outcome, not the break
    applyEffect(ronin, 'effect.armament', 'test');
    if (coated) applyEffect(foe, 'effect.armament', 'test');
    ronin.melee = { ability: 'ability.kokutoIai', t: 0.1, dur: 0.9, motion: 'arc', phases: { windup: 0.55, active: 0.15, recover: 0.3 }, side: 1, angle: Math.PI, hitByVolume: [] };
    expect(tryGuard(foe, true)).toBe(true);
    const strikes = new StrikeResolver(new Damage(), new Rng(1));
    strikes.hit(ronin, foe, Abilities.get('ability.kokutoIai'), 10, -100, 0, 0, 1.2);
    return { parried: ronin.melee === undefined, foe, ronin };
  }
  it('an uncoated equal (A-) cannot parry it — their window blocks; a COATED equal turns it', () => {
    expect(kokuto('A-', false).parried).toBe(false);
    expect(kokuto('A-', true).parried).toBe(true);
  });
  it('a D- hero cannot, coated or not; a master a letter above (S-) can even uncoated', () => {
    expect(kokuto('D-', true).parried).toBe(false);
    expect(kokuto('S-', false).parried).toBe(true);
  });
  it('the shift asks ONLY the parry question — the rest of the rung is unshifted', () => {
    const { foe, ronin } = kokuto('A-', false);
    expect(dominance(ronin, foe).parryDeflects).toBe(true); // the plain rung (one letter: coated A- vs A-) would have allowed it…
    expect(dominance(ronin, foe, letters(1)).parryDeflects).toBe(false); // …the shifted question says no
  });
});
