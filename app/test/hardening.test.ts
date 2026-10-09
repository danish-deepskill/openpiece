import { describe, expect, it } from 'vitest';
import { applyEffect, Effects } from '../src/combat/Effect';
import { DAMAGE_TAKEN_STAT } from '../src/combat/stats';
import { Rng } from '../src/core/Rng';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { Damage } from '../src/systems/Damage';

/**
 * HARDENING — Armament's armor half as a MULTIPLIER on damage taken (stats.DAMAGE_TAKEN_STAT), read by Damage.apply before
 * the flat def. The old "+30% def" was ~2 points a hit against 40-damage cuts: present in the code, absent in play.
 */
const dmg = new Damage();
const rig = () => {
  const sp = new Spawner(new World(), new Rng(2));
  return sp.spawnUnit('unit.ronin', 0, 0);
};
const lossFrom = (e: ReturnType<typeof rig>, hit: number, ignoreDef = false): number => {
  const before = e.health!.hp;
  dmg.apply(e, hit, 0, 0, false, ignoreDef);
  return before - e.health!.hp;
};

describe('the coating takes half the blow', () => {
  it('every spawned body seeds the multiplier at 1 (uncoated = the full hit less def); coated = half the hit less def', () => {
    const e = rig();
    expect(e.attributes!.get(DAMAGE_TAKEN_STAT)).toBe(1);
    const def = e.attributes!.get('def');
    expect(lossFrom(e, 40)).toBeCloseTo(40 - def, 6);
    applyEffect(e, 'effect.armament', 'test');
    expect(e.attributes!.get(DAMAGE_TAKEN_STAT)).toBeCloseTo(0.5, 9);
    expect(lossFrom(e, 40)).toBeCloseTo(40 * 0.5 - def, 6); // the multiplier bites BEFORE the flat def
  });

  it('TRUE damage (drowning) ignores hardening the way it ignores def', () => {
    const e = rig();
    applyEffect(e, 'effect.armament', 'test');
    expect(lossFrom(e, 40, true)).toBe(40);
  });

  it('the Armament row carries the hardening stat and no longer a percent on flat def', () => {
    const mods = Effects.get('effect.armament').modifiers!;
    expect(mods.some((m) => m.stat === DAMAGE_TAKEN_STAT && m.op === 'mulPct' && m.value === -0.5)).toBe(true);
    expect(mods.some((m) => m.stat === 'def')).toBe(false);
  });

  it('a body with no attributes at all takes the whole hit (the read falls back to 1, never 0)', () => {
    const w = new World();
    const bare = w.create({ transform: { x: 0, y: 0, angle: 0, r: 10 }, health: { hp: 50, maxHp: 50, dead: false, hitFlash: 0, iframes: 0 } });
    dmg.apply(bare, 20, 0, 0);
    expect(bare.health!.hp).toBe(30);
  });
});
