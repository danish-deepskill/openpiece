import { describe, expect, it } from 'vitest';
import { Effects } from '../src/combat/Effect';
import { StatBlock } from '../src/combat/StatBlock';
import { deriveAttributeStats } from '../src/combat/attributes';
import { TagSet } from '../src/combat/TagSet';
import { equip, unequip } from '../src/combat/equip';
import { Potentials } from '../src/defs/layers';
import type { Entity } from '../src/ecs/components';
import { World } from '../src/ecs/World';
import { EffectSystem } from '../src/systems/EffectSystem';

// test-only rows (vitest isolates module state per file, so these never leak into other suites)
Effects.registerAll([
  { id: 'effect.testBuff', name: 'Test Buff', durationSec: 2, modifiers: [{ stat: 'atk', op: 'flat', value: 5, source: 'x' }] },
  { id: 'effect.testStack', name: 'Test Stack', durationSec: 1, stackRule: 'stack', grantTags: ['test.tag'], modifiers: [{ stat: 'atk', op: 'flat', value: 5, source: 'x' }] },
  { id: 'effect.testVigor', name: 'Test Vigor', durationSec: 1, modifiers: [{ stat: 'maxHp', op: 'mulPct', value: 0.5, source: 'x' }] },
  { id: 'effect.testTonic', name: 'Test Tonic', durationSec: 1, modifiers: [{ stat: 'health', op: 'flat', value: 20, source: 'x' }] },
]);
Potentials.register({ id: 'potential.testVigor', name: 'Test Vigor', modifiers: [{ stat: 'maxHp', op: 'flat', value: 20, source: 'potential:potential.testVigor' }], tags: [] });

function combatEntity(world: World, over: Partial<Entity> = {}): Entity {
  return world.create({
    attributes: new StatBlock({ atk: 10, maxHp: 100, maxStam: 50 }),
    tags: new TagSet(),
    effects: { active: [], seq: 0 },
    health: { hp: 100, maxHp: 100, dead: false, hitFlash: 0, iframes: 0 },
    combatant: { stam: 50, maxStam: 50, combo: 0, comboT: 0, posture: 0, maxPosture: 20 },
    ...over,
  });
}

describe('effect stack rules (merge-rules-as-data)', () => {
  it("'refresh' (default): reapplying resets the clock, never duplicates the modifiers", () => {
    const world = new World();
    const fx = new EffectSystem(world);
    const e = combatEntity(world);
    fx.apply(e, 'effect.testBuff', 'test');
    fx.update(1); // 1s of the 2s duration elapses
    fx.apply(e, 'effect.testBuff', 'test'); // reapply → same instance, clock reset
    expect(e.effects!.active).toHaveLength(1);
    expect(e.effects!.active[0].remaining).toBe(2);
    expect(e.attributes!.get('atk')).toBe(15); // +5 once, not twice
  });

  it("'stack': the first expiry never strips a surviving instance's modifiers (the source-collision bug)", () => {
    const world = new World();
    const fx = new EffectSystem(world);
    const e = combatEntity(world);
    fx.apply(e, 'effect.testStack', 'a');
    fx.update(0.5);
    fx.apply(e, 'effect.testStack', 'b'); // second instance while the first still runs
    expect(e.effects!.active).toHaveLength(2);
    expect(e.attributes!.get('atk')).toBe(20); // both instances contribute
    fx.update(0.6); // first (1s) expires; second has 0.4s left
    expect(e.effects!.active).toHaveLength(1);
    expect(e.attributes!.get('atk')).toBe(15); // survivor's +5 INTACT — pre-fix this read 10
    expect(e.tags!.has('test.tag')).toBe(true); // tag survives while any instance grants it
    fx.update(0.5); // second expires too
    expect(e.attributes!.get('atk')).toBe(10);
    expect(e.tags!.has('test.tag')).toBe(false);
  });
});

describe('derived resource sync (maxHp/maxStam ceilings follow the StatBlock)', () => {
  it('an effect that raises maxHp moves the ceiling immediately — and does NOT heal', () => {
    const world = new World();
    const fx = new EffectSystem(world);
    const e = combatEntity(world);
    fx.apply(e, 'effect.testVigor', 'test'); // maxHp ×1.5
    expect(e.health!.maxHp).toBe(150);
    expect(e.health!.hp).toBe(100); // raised ceiling, unchanged pool
    e.health!.hp = 140; // heal up into the buffed headroom…
    fx.update(1.1); // …then the buff expires
    expect(e.health!.maxHp).toBe(100);
    expect(e.health!.hp).toBe(100); // pool clamps down to the restored ceiling
  });

  it('equipping/unequipping a maxHp layer re-syncs the ceiling (spawn snapshot no longer sticks)', () => {
    const world = new World();
    const e = combatEntity(world);
    equip(e, 'potential', 'potential.testVigor');
    expect(e.health!.maxHp).toBe(120);
    unequip(e, 'potential', 'potential.testVigor');
    expect(e.health!.maxHp).toBe(100);
  });

  it("a modifier targeting the ATTRIBUTE ('health') re-derives into maxHp — not silently inert", () => {
    const world = new World();
    const fx = new EffectSystem(world);
    const sb = new StatBlock({ atk: 10, health: 100, endurance: 50 });
    deriveAttributeStats(sb); // maxHp flows FROM health, as at spawn
    const e = world.create({
      attributes: sb,
      tags: new TagSet(),
      effects: { active: [], seq: 0 },
      health: { hp: 100, maxHp: 100, dead: false, hitFlash: 0, iframes: 0 },
      combatant: { stam: 50, maxStam: 50, combo: 0, comboT: 0, posture: 0, maxPosture: 20 },
    });
    fx.apply(e, 'effect.testTonic', 'test'); // +20 health (the attribute, not maxHp directly)
    expect(e.health!.maxHp).toBe(120); // pre-fix: stayed 100 — the derive step never re-ran
    fx.update(1.1);
    expect(e.health!.maxHp).toBe(100);
  });
});
