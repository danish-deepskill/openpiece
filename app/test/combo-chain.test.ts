import { describe, expect, it } from 'vitest';
import { equip } from '../src/combat/equip';
import { Rng } from '../src/core/Rng';
import type { Entity } from '../src/ecs/components';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { EffectSystem } from '../src/systems/EffectSystem';
import type { StrikeResolver } from '../src/systems/StrikeResolver';

/** A sword-armed fighter through the REAL spawn + equip paths — hand-rolled stat blocks kept diverging from
 *  Spawner's seeding (missing endurance zeroed the stamina pool; missing atkSpeed decupled cooldowns). */
function swordsman(world: World): Entity {
  const hero = new Spawner(world, new Rng(7)).spawnHero(0, 0); // E- stats: atkSpeed 0.75, endurance 100
  equip(hero, 'weapon', 'weapon.sword');
  return hero;
}

/** Finish the current swing so the next press is a fresh input (the window persists past the swing). */
function endSwing(e: Entity): void {
  delete e.melee;
}

describe('combo chain — press, press, press: three swings, then the lockout', () => {
  // strikes stubbed: chain logic never consults it for melee swings (contact resolves in MeleeSystem)
  const sys = (world: World) => new AbilitySystem(world, new EffectSystem(world), {} as StrikeResolver, new Rng(1));

  it('equipping the sword grants the WHOLE chain, not just the entry', () => {
    const world = new World();
    const e = swordsman(world);
    expect(e.loadout!.primary).toBe('ability.swordSlash1');
    expect(e.loadout!.granted.has('ability.swordSlash2')).toBe(true);
    expect(e.loadout!.granted.has('ability.swordFinisher')).toBe(true);
  });

  it('repeat presses inside the window walk slash1 → slash2 → finisher, then lock the ROOT', () => {
    const world = new World();
    const e = swordsman(world);
    const abilities = sys(world);
    const root = 'ability.swordSlash1';

    expect(abilities.activate(e, root)).toBe(true);
    expect(e.melee!.ability).toBe('ability.swordSlash1');
    endSwing(e);
    expect(abilities.activate(e, root)).toBe(true); // same button…
    expect(e.melee!.ability).toBe('ability.swordSlash2'); // …chains to the second cut
    expect(e.melee!.side).toBe(-1); // the mirrored backslash cuts from the off side
    endSwing(e);
    expect(abilities.activate(e, root)).toBe(true);
    expect(e.melee!.ability).toBe('ability.swordFinisher'); // the big third hit
    endSwing(e);

    expect(e.loadout!.chain).toBeUndefined(); // chain consumed
    expect(e.loadout!.cd.get(root)).toBeGreaterThan(2); // the ROOT carries the finisher's cooldown — the post-combo recovery
    // cdMax mirrors the DURATION actually set (the finisher's cd, atkSpeed-scaled), NOT slash1's base 0.85 — this
    // is what the HUD fill divides by, so the amber fills over the WHOLE post-combo recovery (the bug: dividing by
    // 0.85 clamped the fill to empty for the first ~1.5s, so it only appeared in the last moment).
    expect(e.loadout!.cdMax.get(root)).toBe(e.loadout!.cd.get(root)); // at t=0 remaining == duration
    expect(e.loadout!.cdMax.get(root)).toBeGreaterThan(2); // = the finisher's recovery, well above slash1's 0.85 base
    expect(abilities.activate(e, root)).toBe(false); // locked out until it elapses
  });

  it('a press MID-SWING does nothing — one click can never machine-gun the chain', () => {
    const world = new World();
    const e = swordsman(world);
    const abilities = sys(world);
    const root = 'ability.swordSlash1';

    expect(abilities.activate(e, root)).toBe(true); // swing 1 in flight…
    expect(abilities.activate(e, root)).toBe(false); // …a held/re-pressed button is refused
    expect(e.melee!.ability).toBe('ability.swordSlash1'); // the swing was NOT replaced by step 2
    endSwing(e);
    expect(abilities.activate(e, root)).toBe(true); // the press AFTER the swing chains normally
    expect(e.melee!.ability).toBe('ability.swordSlash2');
  });

  it('letting the window expire resets the chain to the first cut', () => {
    const world = new World();
    const e = swordsman(world);
    const abilities = sys(world);
    const root = 'ability.swordSlash1';

    abilities.activate(e, root);
    endSwing(e);
    abilities.update(1.0); // window (0.9s default) expires; also clears slash1's own 0.5s cooldown
    expect(e.loadout!.chain).toBeUndefined();
    expect(abilities.activate(e, root)).toBe(true);
    expect(e.melee!.ability).toBe('ability.swordSlash1'); // back to the start, not slash2
  });
});
