import { describe, expect, it } from 'vitest';
import { applyEffect } from '../src/combat/Effect';
import { fxThemeOf } from '../src/combat/fxTheme';
import { Rng } from '../src/core/Rng';
import { events } from '../src/core/EventBus';
import { shotProcKey } from '../src/draw/projectileProc';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { EffectSystem } from '../src/systems/EffectSystem';
import type { StrikeResolver } from '../src/systems/StrikeResolver';

function rig() {
  const world = new World();
  const sp = new Spawner(world, new Rng(2));
  const abilities = new AbilitySystem(world, new EffectSystem(world), {} as StrikeResolver, new Rng(1));
  const ronin = sp.spawnUnit('unit.ronin', 300, 300);
  return { world, abilities, ronin };
}

describe('FX theme — a body STATE re-themes everything it does (no per-ability flag)', () => {
  it('uncoated: no theme; coated: haki — for any body, by the tag', () => {
    const { ronin } = rig();
    expect(fxThemeOf(ronin)).toBeUndefined();
    applyEffect(ronin, 'effect.armament', 'test');
    expect(fxThemeOf(ronin)).toBe('haki');
    const thug = new Spawner(new World(), new Rng(1)).spawnUnit('unit.thug', 0, 0);
    applyEffect(thug, 'effect.armament', 'test');
    expect(fxThemeOf(thug)).toBe('haki'); // the Moat: whoever carries the state carries the look
  });

  it('every swing crescent the coated body emits carries the theme; the same swing uncoated does not', () => {
    const { abilities, ronin } = rig();
    const themes: (string | undefined)[] = [];
    const off = events.on('fx:swing', (o) => themes.push(o.theme));
    expect(abilities.activate(ronin, 'ability.senpu')).toBe(true); // an ordinary RMB finisher — nothing on its row says haki
    expect(themes.length).toBeGreaterThan(0);
    expect(themes.every((t) => t === undefined)).toBe(true);
    delete ronin.melee;
    ronin.loadout!.cd.clear();
    themes.length = 0;
    applyEffect(ronin, 'effect.armament', 'test');
    expect(abilities.activate(ronin, 'ability.senpu')).toBe(true);
    off();
    expect(themes.length).toBeGreaterThan(0);
    expect(themes.every((t) => t === 'haki')).toBe(true);
  });

  it('a shot is stamped with the shooter\'s theme at FIRE time and keys the themed bake', () => {
    const { world, abilities, ronin } = rig();
    applyEffect(ronin, 'effect.armament', 'test');
    ronin.loadout!.granted.add('ability.shippuSlash'); // in play Shippū's swing looses it as a volley; here fire the row directly
    expect(abilities.activate(ronin, 'ability.shippuSlash')).toBe(true);
    ronin.melee!.t = ronin.melee!.dur; // the ball leaves the barrel when the swing crosses its windup (AbilitySystem.update)
    abilities.update(1 / 60);
    const shot = [...world.with('projectile')][0]!;
    expect(shot.projectile!.theme).toBe('haki');
    expect(shotProcKey('slash', undefined, shot.projectile!.theme)).toBe('shotproc:slash:haki');
    expect(shotProcKey('slash', 0xabcdef, undefined)).toBe('shotproc:slash:abcdef'); // a charge color still keys the charged bake
    expect(shotProcKey('ball')).toBe('shotproc:ball');
  });
});
