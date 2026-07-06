import { describe, expect, it } from 'vitest';
import { equip } from '../src/combat/equip';
import { tryGuard } from '../src/combat/guard';
import { Rng } from '../src/core/Rng';
import type { Entity } from '../src/ecs/components';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { EffectSystem } from '../src/systems/EffectSystem';
import type { StrikeResolver } from '../src/systems/StrikeResolver';

/**
 * COMMITMENT RULE: a roll (a self-impulse dodge) can only cancel a swing during its WINDUP — the same phase
 * gate as the feint (guard.tryGuard). Once the cut is ACTIVE or RECOVER it's committed: the roll is REFUSED
 * (no free "attack, then roll out of the punish"). Windup stays escapable via roll OR feint; nothing escapes
 * a committed swing. Locks in the rule so a later refactor of AbilitySystem.activate can't quietly re-open it.
 */

const sys = (world: World) => new AbilitySystem(world, new EffectSystem(world), {} as StrikeResolver, new Rng(1));

/** A sword-armed hero (real spawn/equip paths — proper atkSpeed/endurance) with a fat stamina pool so cost
 *  never masks the phase gate. Sword swings have a clean windup/active/recover split to advance through. */
function fighter(world: World): Entity {
  const e = new Spawner(world, new Rng(7)).spawnHero(0, 0);
  equip(e, 'weapon', 'weapon.sword');
  e.combatant!.stam = 100;
  return e;
}

/** Advance the in-flight swing to fraction `p` of its duration (drives which phase phaseAt reports). */
function seekSwing(e: Entity, p: number): void {
  const s = e.melee!;
  s.t = s.dur * p;
}

describe('roll cannot cancel a COMMITTED swing (only windup is escapable)', () => {
  it('roll DURING WINDUP cancels the swing (the dodge-abort, like a feint)', () => {
    const world = new World();
    const e = fighter(world);
    const abilities = sys(world);
    expect(abilities.activate(e, 'ability.swordSlash1')).toBe(true);
    seekSwing(e, 0.05); // p ≈ 0.05 — still winding up (sword windup fraction is 0.5)
    expect(abilities.activate(e, 'ability.roll')).toBe(true); // the roll fires…
    expect(e.melee).toBeUndefined(); // …and the swing is cancelled
    expect(e.mover!.dodgeT).toBeGreaterThan(0); // the dodge impulse is live
  });

  it('roll DURING ACTIVE is REFUSED — the cut is committed, the swing survives', () => {
    const world = new World();
    const e = fighter(world);
    const abilities = sys(world);
    abilities.activate(e, 'ability.swordSlash1');
    const stamBefore = e.combatant!.stam;
    seekSwing(e, 0.6); // past windup (0.5) → ACTIVE
    expect(abilities.activate(e, 'ability.roll')).toBe(false); // refused
    expect(e.melee).toBeDefined(); // the committed swing is untouched
    expect(e.mover!.dodgeT).toBe(0); // no impulse fired
    expect(e.combatant!.stam).toBe(stamBefore); // refused early → the roll spent NO stamina
    expect(e.loadout!.cd.get('ability.roll') ?? 0).toBe(0); // …and burned NO cooldown (still ready next window)
  });

  it('roll DURING RECOVER is REFUSED too — you cannot dodge out of your own follow-through', () => {
    const world = new World();
    const e = fighter(world);
    const abilities = sys(world);
    abilities.activate(e, 'ability.swordSlash1');
    seekSwing(e, 0.9); // deep in RECOVER
    expect(abilities.activate(e, 'ability.roll')).toBe(false);
    expect(e.melee).toBeDefined();
  });

  it('the FEINT still cancels a windup (roll is a second early-abort, not a replacement)', () => {
    const world = new World();
    const e = fighter(world);
    const abilities = sys(world);
    abilities.activate(e, 'ability.swordSlash1');
    seekSwing(e, 0.05); // winding up
    expect(tryGuard(e)).toBe(true); // raise guard = feint
    expect(e.melee).toBeUndefined(); // the swing is pulled
  });

  it('a committed swing blocks the feint too — nothing cancels an active cut', () => {
    const world = new World();
    const e = fighter(world);
    const abilities = sys(world);
    abilities.activate(e, 'ability.swordSlash1');
    seekSwing(e, 0.6); // ACTIVE
    expect(tryGuard(e)).toBe(false); // committed — no feint either
    expect(e.melee).toBeDefined();
  });
});
