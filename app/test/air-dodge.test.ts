import { describe, expect, it } from 'vitest';
import { Abilities } from '../src/combat/Ability';
import type { Rng } from '../src/core/Rng';
import type { Entity } from '../src/ecs/components';
import { Damage } from '../src/systems/Damage';
import { StrikeResolver } from '../src/systems/StrikeResolver';

/**
 * AIRBORNE DODGE (docs/design/MOVEMENT_AIR.md): a JUMP fully (100%) evades a GROUNDED attacker by default — a
 * deterministic, readable dodge. The EXCEPTION is an ANTI-AIR attack: `airCatch` (0..1) is ITS chance to catch
 * the jumper. So any randomness lives on the specific counter-move, never on baseline melee.
 */

const SLASH = Abilities.get('ability.swordSlash1'); // a normal ground attack (no airCatch)

function pair(targetLayer: 'ground' | 'air') {
  const mk = (x: number, layer: 'ground' | 'air'): Entity =>
    ({
      transform: { x, y: 0, angle: 0, r: 11 },
      mover: { vx: 0, vy: 0, speed: 0, mass: 1, mode: 'foot', dodgeT: 0, dvx: 0, dvy: 0, layer },
      health: { hp: 100, maxHp: 100, dead: false, hitFlash: 0, iframes: 0 },
    }) as unknown as Entity;
  return { attacker: mk(20, 'ground'), target: mk(0, targetLayer) };
}

/** A stub Rng whose `next()` returns a fixed value — controls an anti-air's airCatch roll. */
const fixedRng = (v: number): Rng => ({ next: () => v }) as unknown as Rng;

describe('airborne dodge (StrikeResolver)', () => {
  it('a normal ground attack ALWAYS whiffs on an airborne target (100% dodge, no roll)', () => {
    const { attacker, target } = pair('air');
    // even a roll that WOULD catch (0.0) can't — a normal attack has no airCatch, so it always whiffs.
    const strikes = new StrikeResolver(new Damage(), fixedRng(0));
    const hp = target.health!.hp;
    expect(strikes.hit(attacker, target, SLASH, 10, 0, 0)).toBe(false);
    expect(target.health!.hp).toBe(hp); // fully evaded, deterministically
  });

  it('a GROUNDED target is unaffected — a ground-vs-ground hit always lands', () => {
    const { attacker, target } = pair('ground');
    const strikes = new StrikeResolver(new Damage(), fixedRng(0));
    const hp = target.health!.hp;
    strikes.hit(attacker, target, SLASH, 10, 0, 0);
    expect(target.health!.hp).toBeLessThan(hp); // no air mismatch → normal hit
  });

  it('a HARD anti-air (airCatch: 1) always catches a jumper', () => {
    const { attacker, target } = pair('air');
    const antiAir = { ...SLASH, airCatch: 1 };
    const strikes = new StrikeResolver(new Damage(), fixedRng(0.99)); // any roll < 1 catches
    const hp = target.health!.hp;
    strikes.hit(attacker, target, antiAir, 10, 0, 0);
    expect(target.health!.hp).toBeLessThan(hp); // caught mid-air
  });

  it('a GAMBLE anti-air (airCatch: 0.5): catches when the roll succeeds, whiffs when it fails', () => {
    const gamble = { ...SLASH, airCatch: 0.5 };

    const caught = pair('air');
    const hit = new StrikeResolver(new Damage(), fixedRng(0.1)); // 0.1 < 0.5 → catches
    const hpA = caught.target.health!.hp;
    hit.hit(caught.attacker, caught.target, gamble, 10, 0, 0);
    expect(caught.target.health!.hp).toBeLessThan(hpA);

    const missed = pair('air');
    const whiff = new StrikeResolver(new Damage(), fixedRng(0.9)); // 0.9 ≥ 0.5 → whiffs
    const hpB = missed.target.health!.hp;
    expect(whiff.hit(missed.attacker, missed.target, gamble, 10, 0, 0)).toBe(false);
    expect(missed.target.health!.hp).toBe(hpB);
  });
});
