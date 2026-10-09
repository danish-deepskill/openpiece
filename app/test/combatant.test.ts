import { stamCap } from '../src/combat/stamina';
import { describe, expect, it } from 'vitest';
import { applyEffect, TAG_SLOWED } from '../src/combat/Effect';
import { TagSet } from '../src/combat/TagSet';
import { STAM_REGEN } from '../src/config/constants';
import type { Entity } from '../src/ecs/components';
import { World } from '../src/ecs/World';
import { CombatantSystem } from '../src/systems/CombatantSystem';
import { EffectSystem } from '../src/systems/EffectSystem';

function fighter(world: World, over: Record<string, number> = {}): Entity {
  return world.create({ combatant: { stam: 50, maxStam: 100, combo: 0, comboT: 0, posture: 0, maxPosture: 20, ...over } });
}

describe('CombatantSystem — delayed stamina regen + hitstun decay', () => {
  it('does NOT regen while the post-spend delay is active', () => {
    const world = new World();
    const e = fighter(world, { stam: 50, regenT: 1 });
    new CombatantSystem(world).update(0.5);
    expect(e.combatant!.stam).toBe(50); // still inside the delay → no recovery
    expect(e.combatant!.regenT).toBeCloseTo(0.5, 5);
  });

  it('regens once the delay has elapsed (STAM_REGEN/s)', () => {
    const world = new World();
    const e = fighter(world, { stam: 50, regenT: 0 });
    new CombatantSystem(world).update(1);
    expect(e.combatant!.stam).toBeCloseTo(50 + STAM_REGEN, 5); // one second of regen at the tuned rate
  });

  it('caps stamina at today\'s ceiling (the refill itself costs the day a hair — never past maxStam)', () => {
    const world = new World();
    const e = fighter(world, { stam: 98, regenT: 0 });
    new CombatantSystem(world).update(1);
    expect(e.combatant!.stam).toBeLessThanOrEqual(100);
    expect(e.combatant!.stam).toBeCloseTo(stamCap(e.combatant!), 6); // the two refilled points wore the ceiling to ~99.7 (combat/stamina)
  });

  it('hitstun is an EFFECT clock now — EffectSystem ticks it down and the tag lifts on expiry', () => {
    // CC moved off Combatant timer fields onto effect rows (backlog #16: statuses are GAS-lite effects) — the
    // stagger applies effect.staggered (tag state.slowed), EffectSystem ticks it, expiry removes the tag.
    const world = new World();
    const e = fighter(world);
    e.tags = new TagSet();
    e.effects = { active: [], seq: 0 };
    applyEffect(e, 'effect.staggered', 'test', 0.4);
    expect(e.tags.has(TAG_SLOWED)).toBe(true); // staggered → slowed-class CC
    const fx = new EffectSystem(world);
    fx.update(0.3);
    expect(e.effects.active.find((a) => a.id === 'effect.staggered')?.remaining).toBeCloseTo(0.1, 5);
    fx.update(0.2); // past the end — expired
    expect(e.effects.active.length).toBe(0);
    expect(e.tags.has(TAG_SLOWED)).toBe(false); // the tag lifted with the effect
  });
});
