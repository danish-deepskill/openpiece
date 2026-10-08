import { describe, expect, it } from 'vitest';
import { swingDuration, WEIGHT_PHASES } from '../src/combat/phases';
import { SWING_SPEED_FLOOR, TELL_FLOOR } from '../src/config/constants';
import { Rng } from '../src/core/Rng';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { EffectSystem } from '../src/systems/EffectSystem';
import type { StrikeResolver } from '../src/systems/StrikeResolver';

const medium = WEIGHT_PHASES.medium; // windup 0.5
const light = WEIGHT_PHASES.light; // windup 0.4

describe('swingDuration — attack speed shortens the swing, the tell stays readable', () => {
  it('scales the authored time by attack speed above 1', () => {
    expect(swingDuration(0.9, 1.2, { windup: 0.55, active: 0.15, recover: 0.3 })).toBeCloseTo(0.75, 6); // 0.9 / 1.2
  });

  it('never SLOWS a swing: attack speed under the floor leaves the authored time alone', () => {
    expect(SWING_SPEED_FLOOR).toBe(1);
    expect(swingDuration(0.55, 0.45, medium)).toBe(0.55); // an F- unit still swings at the authored pace
    expect(swingDuration(0.55, 1, medium)).toBe(0.55);
  });

  it('a readable tell is compressed no further than TELL_FLOOR seconds of windup', () => {
    // at an absurd attack speed the raw scaling would leave a sub-floor tell → the duration is held where the
    // windup equals the floor (expected values derive from the knob, so a retuned floor can't break this)
    expect(swingDuration(0.55, 20, medium)).toBeCloseTo(TELL_FLOOR / medium.windup, 6);
    expect(swingDuration(0.9, 20, { windup: 0.55, active: 0.15, recover: 0.3 })).toBeCloseTo(TELL_FLOOR / 0.55, 6);
    expect(swingDuration(0.55, 20, medium) * medium.windup).toBeCloseTo(TELL_FLOOR, 6);
  });

  it('a jab whose authored tell is ALREADY under the floor scales freely (fists are not immune)', () => {
    expect(0.18 * light.windup).toBeLessThan(TELL_FLOOR); // the fist: a 0.072s "tell"
    expect(swingDuration(0.18, 2, light)).toBeCloseTo(0.09, 6);
  });
});

describe('a cast swing carries the scaled duration', () => {
  it('the samurai (attack speed 1.45) cuts faster than the authored 0.55s, never under the tell floor', () => {
    const world = new World();
    const e = new Spawner(world, new Rng(1)).spawnUnit('unit.samurai', 0, 0);
    expect(e.attributes!.get('atkSpeed')).toBeCloseTo(1.45, 6); // tier C
    const abilities = new AbilitySystem(world, new EffectSystem(world), {} as StrikeResolver, new Rng(1)); // no contact is resolved here
    expect(abilities.activate(e, 'ability.kesa')).toBe(true);
    const expected = Math.max(0.55 / 1.45, TELL_FLOOR / medium.windup); // the rule, in the knob's terms
    expect(e.melee!.dur).toBeCloseTo(expected, 6);
    expect(e.melee!.dur).toBeLessThan(0.55);
    expect(e.melee!.dur * e.melee!.phases.windup).toBeGreaterThanOrEqual(TELL_FLOOR - 1e-9);
  });
});
