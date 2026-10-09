import { describe, expect, it } from 'vitest';
import { Registry } from '../src/core/Registry';
import { StatBlock } from '../src/combat/StatBlock';
import { TagSet } from '../src/combat/TagSet';
import { TIER_CURVE, tierFromScore, tierIndex, tierStats } from '../src/combat/PowerTier';

describe('StatBlock', () => {
  it('applies flat → addPct → mulPct in order', () => {
    const s = new StatBlock({ atk: 100 });
    s.add({ stat: 'atk', op: 'flat', value: 50, source: 'weapon:cutlass' }); // 150
    s.add({ stat: 'atk', op: 'addPct', value: 0.2, source: 'potential:rage' }); // ×1.2 = 180
    s.add({ stat: 'atk', op: 'mulPct', value: 0.5, source: 'haki:armament' }); // ×1.5 = 270
    expect(s.get('atk')).toBe(270);
  });

  it('removeBySource removes only that source and recomputes', () => {
    const s = new StatBlock({ atk: 100 });
    s.add({ stat: 'atk', op: 'flat', value: 50, source: 'weapon:cutlass' });
    s.add({ stat: 'atk', op: 'flat', value: 30, source: 'buff:rage' });
    expect(s.get('atk')).toBe(180);
    s.removeBySource('buff:rage');
    expect(s.get('atk')).toBe(150);
  });

  it('override wins regardless of other mods', () => {
    const s = new StatBlock({ hp: 100 });
    s.add({ stat: 'hp', op: 'flat', value: 9999, source: 'x' });
    s.add({ stat: 'hp', op: 'override', value: 1, source: 'execute' });
    expect(s.get('hp')).toBe(1);
  });

  it('unmodified stats fall through to base', () => {
    const s = new StatBlock({ def: 10 });
    expect(s.get('def')).toBe(10);
    expect(s.get('missing')).toBe(0);
  });
});

describe('TagSet', () => {
  it('supports hierarchical prefix matching', () => {
    const t = new TagSet();
    t.add('fruit.type.zoan');
    expect(t.has('fruit.type.zoan')).toBe(true);
    expect(t.hasPrefix('fruit.type')).toBe(true);
    expect(t.hasPrefix('fruit')).toBe(true);
    expect(t.hasPrefix('haki')).toBe(false);
    t.remove('fruit.type.zoan');
    expect(t.hasPrefix('fruit')).toBe(false);
  });
});

describe('Registry', () => {
  it('registers, looks up, and fails fast on dup/unknown', () => {
    const r = new Registry<{ id: string; v: number }>('Test');
    r.register({ id: 'test.a', v: 1 });
    expect(r.get('test.a').v).toBe(1);
    expect(r.size).toBe(1);
    expect(() => r.register({ id: 'test.a', v: 2 })).toThrow();
    expect(() => r.get('nope')).toThrow();
  });
});

describe('PowerTier', () => {
  it('orders and clamps tiers across the F-…X+ bands', () => {
    expect(tierIndex('F-')).toBe(0); // weakest band
    expect(tierIndex('F')).toBe(1);
    expect(tierIndex('F+')).toBe(2);
    expect(tierIndex('E-')).toBe(3); // captain / hero tier
    expect(tierIndex('X+')).toBe(29); // the apex band (beyond-Imu endgame)
    expect(tierFromScore(0)).toBe('F-');
    expect(tierFromScore(999)).toBe('X+'); // clamps to the top of the extended ladder
    expect(tierIndex(tierFromScore(5))).toBe(5);
  });

  it('derives rising combat stats per tier band', () => {
    const fMinus = tierStats('F-');
    const ePlus = tierStats('E-');
    expect(ePlus.hp).toBeGreaterThan(fMinus.hp); // higher tier = more hp
    expect(ePlus.atk).toBeGreaterThan(fMinus.atk);
    expect(ePlus.atkSpeed).toBeGreaterThan(fMinus.atkSpeed); // and faster recovery
    expect(fMinus.atkSpeed).toBeCloseTo(TIER_CURVE.atkSpeedBase); // fodder swings at the curve's floor
  });
});
