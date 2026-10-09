import { describe, expect, it } from 'vitest';
import { Abilities } from '../src/combat/Ability';
import { applyEffect } from '../src/combat/Effect';
import { KNOCKBACK_STAT, SHOT_SCALE_STAT } from '../src/combat/stats';
import { Rng } from '../src/core/Rng';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { Damage } from '../src/systems/Damage';
import { EffectSystem } from '../src/systems/EffectSystem';
import { StrikeResolver } from '../src/systems/StrikeResolver';

/** THE PUMP ON THE BLOW: Ni Gorilla's two multiplier stats — the shove every hit lands and the size of every slash loosed. */
const SIM = 1 / 60;
function rig(seed = 4) {
  const world = new World();
  const sp = new Spawner(world, new Rng(seed));
  const strikes = new StrikeResolver(new Damage(), new Rng(1));
  const abilities = new AbilitySystem(world, new EffectSystem(world), strikes, new Rng(1));
  return { world, sp, strikes, abilities, zoro: sp.spawnUnit('unit.zoroAdvanced', 0, 0) };
}

describe('every spawned body seeds both at 1', () => {
  it('a plain body shoves and shoots as authored', () => {
    const { zoro } = rig();
    expect(zoro.attributes!.get(KNOCKBACK_STAT)).toBe(1);
    expect(zoro.attributes!.get(SHOT_SCALE_STAT)).toBe(1);
    applyEffect(zoro, 'effect.niGorilla', 'test');
    expect(zoro.attributes!.get(KNOCKBACK_STAT)).toBeCloseTo(1.35, 9);
    expect(zoro.attributes!.get(SHOT_SCALE_STAT)).toBeCloseTo(1.35, 9);
  });
});

describe('the shove', () => {
  it('a pumped hit shoves the same target 1.35× farther; the pump also lengthens a ragdoll\'s fling', () => {
    const r = rig();
    const toro = Abilities.get('ability.toro');
    const plain = r.sp.spawnUnit('unit.dummy', 60, 0);
    r.strikes.hit(r.zoro, plain, toro, 10, 110, 0, 0, 0);
    const shovePlain = plain.mover!.dvx;
    expect(shovePlain).toBeGreaterThan(0);
    applyEffect(r.zoro, 'effect.niGorilla', 'test');
    const pumped = r.sp.spawnUnit('unit.dummy', 60, 100);
    r.strikes.hit(r.zoro, pumped, toro, 10, 110, 0, 0, 0);
    expect(pumped.mover!.dvx).toBeCloseTo(shovePlain * 1.35, 6);
    // a ragdolling blow flies farther too
    const zake = Abilities.get('ability.nigoriZake');
    const flung = r.sp.spawnUnit('unit.dummy', 60, 200);
    r.strikes.hit(r.zoro, flung, zake, 10, 360, 0, 0, 0);
    expect(Math.hypot(flung.mover!.dvx, flung.mover!.dvy)).toBeGreaterThan(zake.ragdoll!.force * 1.3); // × the rung (a D- dummy flies farther still) × the pump
  });
});

describe('the slash', () => {
  it('a pumped 72 Pound looses slashes 1.35× larger — hit radius AND drawn scale together', () => {
    const { world, abilities, zoro } = rig();
    const fire = () => {
      const before = world.with('projectile').length;
      expect(abilities.activate(zoro, 'ability.nanajuniPound')).toBe(true);
      const m = zoro.melee!;
      m.t = m.dur * 0.6;
      abilities.update(SIM);
      delete zoro.melee;
      zoro.loadout!.cd.clear();
      return world.with('projectile', 'transform').slice(before);
    };
    const plain = fire();
    expect(plain).toHaveLength(2);
    const r0 = plain[0]!.transform.r;
    const life0 = plain[0]!.projectile.life;
    expect(plain[0]!.projectile.scale).toBe(1);
    applyEffect(zoro, 'effect.niGorilla', 'test');
    const pumped = fire();
    expect(pumped).toHaveLength(2);
    for (const p of pumped) {
      expect(p.projectile.scale).toBeCloseTo(1.35, 9);
      expect(p.transform.r).toBeCloseTo(r0 * 1.35, 6); // what hits grew with what is drawn
      expect(p.projectile.life).toBeCloseTo(life0 * 1.15, 6); // and it flies a touch farther (same speed → longer aloft)
      expect(Math.hypot(p.projectile.vx, p.projectile.vy)).toBeCloseTo(Math.hypot(plain[0]!.projectile.vx, plain[0]!.projectile.vy), 6); // speed untouched
    }
    expect(Abilities.get('ability.poundSlash').shape!.shotRadius).toBe(r0); // the authored radius, unpumped
  });
});
