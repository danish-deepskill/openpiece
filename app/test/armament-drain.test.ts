import { describe, expect, it } from 'vitest';
import type { AIContext } from '../src/ai/Brain';
import { tryUtility } from '../src/ai/brains';
import { Abilities } from '../src/combat/Ability';
import { Effects, TAG_ARMAMENT } from '../src/combat/Effect';
import { Rng } from '../src/core/Rng';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { EffectSystem } from '../src/systems/EffectSystem';
import type { StrikeResolver } from '../src/systems/StrikeResolver';

function rig() {
  const world = new World();
  const sp = new Spawner(world, new Rng(2));
  const effects = new EffectSystem(world);
  const abilities = new AbilitySystem(world, effects, {} as StrikeResolver, new Rng(1));
  const ronin = sp.spawnUnit('unit.ronin', 0, 0);
  return { world, effects, abilities, ronin, ctx: { abilities } as unknown as AIContext };
}
const coated = (e: { tags?: { has(t: string): boolean } }) => e.tags!.has(TAG_ARMAMENT);
const DRAIN = Effects.get('effect.armament').drainWillPerSec!;
const IGNITE = Abilities.get('ability.armament').costWill ?? 0; // no ignition cost: the coating is pure drain

describe('Armament is HELD: switch on, pay WILL per second, drops when dry, switch off', () => {
  it('lighting is free; then the WILL pool drains every tick and its regen stays paused — breath untouched', () => {
    const { effects, abilities, ronin } = rig();
    const c = ronin.combatant!;
    const stam0 = c.will!;
    const breath0 = c.stam;
    expect(abilities.activate(ronin, 'ability.armament')).toBe(true);
    expect(coated(ronin)).toBe(true);
    expect(c.will).toBeCloseTo(stam0 - IGNITE, 6); // nothing taken at the press
    for (let i = 0; i < 60; i++) effects.update(1 / 60); // one second held
    expect(c.will).toBeCloseTo(stam0 - IGNITE - DRAIN, 4);
    expect(c.willRegenT).toBeGreaterThan(0); // the drain re-arms the trickle's pause every tick — it never refills under itself
    expect(c.stam).toBe(breath0); // the coating never touches breath
    expect(coated(ronin)).toBe(true);
  });

  it('the coating drops the moment the bar is empty — the pool is the budget, the 30s only a cap', () => {
    const { effects, abilities, ronin } = rig();
    const c = ronin.combatant!;
    abilities.activate(ronin, 'ability.armament');
    c.will = DRAIN * 0.5; // half a second left in the pool
    for (let i = 0; i < 20; i++) effects.update(1 / 60); // a third of a second
    expect(coated(ronin)).toBe(true);
    for (let i = 0; i < 20; i++) effects.update(1 / 60);
    expect(coated(ronin)).toBe(false); // ended early, well inside the 30s cap
    expect(c.will).toBe(0);
    expect(ronin.effects!.active.some((a) => a.id === 'effect.armament')).toBe(false);
  });

  it('pressing C again while coated switches it OFF for free; the re-ignition waits on the cooldown', () => {
    const { abilities, ronin } = rig();
    const c = ronin.combatant!;
    abilities.activate(ronin, 'ability.armament');
    const will = c.will;
    expect(abilities.activate(ronin, 'ability.armament')).toBe(true); // the off-press
    expect(coated(ronin)).toBe(false);
    expect(c.will).toBe(will); // free
    expect(abilities.activate(ronin, 'ability.armament')).toBe(false); // on cooldown from the ignition — no instant re-light
  });

  it('the brain lights it on engagement, never re-presses it while up, and drops it to regroup', () => {
    const { abilities, ronin, ctx } = rig();
    expect(tryUtility(ronin, ctx)).toBe(true); // beat 1: the coating (C, the loudest layer)
    expect(coated(ronin)).toBe(true);
    expect(tryUtility(ronin, ctx)).toBe(true); // beat 2: the shout (X) — the coating's switch is on, so the walk moves past it
    expect(ronin.tags!.has('buff.kiai')).toBe(true);
    expect(tryUtility(ronin, ctx)).toBe(false); // beat 3: nothing left to press (the coating is held, the shout on cooldown)
    expect(coated(ronin)).toBe(true);
    ronin.ai!.bb.regrouping = true;
    expect(tryUtility(ronin, ctx)).toBe(true); // banking the bar: the coating comes off
    expect(coated(ronin)).toBe(false);
    expect(tryUtility(ronin, ctx)).toBe(false); // and nothing new is lit while regrouping
    void abilities;
  });
});
