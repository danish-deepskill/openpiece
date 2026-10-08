import { describe, expect, it } from 'vitest';
import { Abilities } from '../src/combat/Ability';
import { applyEffect, TAG_SLOWED } from '../src/combat/Effect';
import { Rng } from '../src/core/Rng';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { Damage } from '../src/systems/Damage';
import { EffectSystem } from '../src/systems/EffectSystem';
import { MeleeSystem } from '../src/systems/MeleeSystem';
import { StrikeResolver } from '../src/systems/StrikeResolver';

function rig() {
  const world = new World();
  const sp = new Spawner(world, new Rng(1));
  const samurai = sp.spawnUnit('unit.samurai', 0, 0);
  const brute = sp.spawnUnit('unit.brute', 40, 0); // a CUTLASS (medium) — vs the katana (medium) the interrupt roll is certain
  const strikes = new StrikeResolver(new Damage(), new Rng(1));
  const abilities = new AbilitySystem(world, new EffectSystem(world), strikes, new Rng(1));
  const melee = new MeleeSystem(world, strikes);
  /** Put the samurai mid-swing in `ability`, at `frac` of the way through it. */
  const swinging = (ability: string, frac: number): void => {
    expect(abilities.activate(samurai, ability)).toBe(true);
    samurai.melee!.t = samurai.melee!.dur * frac;
  };
  const cut = (): boolean => strikes.hit(brute, samurai, Abilities.get('ability.cut'), 10, 0, 0, 0, 0.4);
  return { samurai, brute, abilities, melee, swinging, cut };
}

describe('a frozen body swings nothing', () => {
  it('a stun ends a swing in flight on the next melee tick; a mere stagger (slowed) does not', () => {
    const { samurai, melee, swinging } = rig();
    swinging('ability.kesa', 0.5);
    applyEffect(samurai, 'effect.staggered', 'test');
    melee.update(1 / 60);
    expect(samurai.melee).toBeDefined(); // slowed feet, the arm still finishes the cut
    applyEffect(samurai, 'effect.stunned', 'test');
    melee.update(1 / 60);
    expect(samurai.melee).toBeUndefined(); // frozen → the swing is gone (and with it a channel's remaining cuts + volleys)
  });
});

describe('a channel is breakable through its whole swing; an ordinary swing still trades', () => {
  it('a landed hit in Kamaitachi\'s ACTIVE phase cancels it and staggers him', () => {
    const { samurai, swinging, cut } = rig();
    swinging('ability.kamaitachi', 0.5); // deep in the five-second cutting phase
    expect(Abilities.get('ability.kamaitachi').channel).toBe(true);
    expect(cut()).toBe(true);
    expect(samurai.melee).toBeUndefined(); // the channel is broken
    expect(samurai.tags!.has(TAG_SLOWED)).toBe(true); // and he's staggered
  });

  it('the same hit in a plain kesa\'s ACTIVE phase does NOT cancel it (commitment — you trade)', () => {
    const { samurai, swinging, cut } = rig();
    swinging('ability.kesa', 0.7); // past the windup
    expect(cut()).toBe(true);
    expect(samurai.melee).toBeDefined(); // the cut plays out
    expect(samurai.melee!.ability).toBe('ability.kesa');
    expect(samurai.tags!.has(TAG_SLOWED)).toBe(false); // no stun either — the trade rule untouched
  });

  it('the kesa IS still interruptible in its WINDUP (the pre-existing rule)', () => {
    const { samurai, swinging, cut } = rig();
    swinging('ability.kesa', 0.1); // inside the 0.5 windup fraction
    expect(cut()).toBe(true);
    expect(samurai.melee).toBeUndefined();
  });
});
