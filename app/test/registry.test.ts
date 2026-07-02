import { describe, expect, it } from 'vitest';
import { Registry, type Def } from '../src/core/Registry';

interface W extends Def {
  name?: string;
  dmg?: number;
  tags?: string[];
}

describe('Registry — def inheritance', () => {
  it('a child inherits the parent fields and overrides its own', () => {
    const r = new Registry<W>('W');
    r.register({ id: 'weapon.cutlass', name: 'Cutlass', dmg: 6, tags: ['medium'] });
    r.register({ id: 'weapon.goldCutlass', parent: 'weapon.cutlass', dmg: 9 }); // only the delta
    const g = r.get('weapon.goldCutlass');
    expect(g.name).toBe('Cutlass'); // inherited
    expect(g.dmg).toBe(9); // overridden
    expect(g.tags).toEqual(['medium']); // inherited array
    expect((g as { parent?: string }).parent).toBeUndefined(); // lineage marker stripped from the resolved def
  });

  it('child arrays REPLACE the parent array (not deep-merge)', () => {
    const r = new Registry<W>('W');
    r.register({ id: 'test.base', tags: ['a', 'b'] });
    r.register({ id: 'test.kid', parent: 'test.base', tags: ['c'] });
    expect(r.get('test.kid').tags).toEqual(['c']);
  });

  it('chains through grandparents', () => {
    const r = new Registry<W>('W');
    r.register({ id: 'test.a', name: 'A', dmg: 1 });
    r.register({ id: 'test.b', parent: 'test.a', dmg: 2 });
    r.register({ id: 'test.c', parent: 'test.b', name: 'C' });
    const c = r.get('test.c');
    expect(c.name).toBe('C'); // own
    expect(c.dmg).toBe(2); // from b
  });

  it('is registration-order independent (child before parent still resolves)', () => {
    const r = new Registry<W>('W');
    r.register({ id: 'test.kid', parent: 'test.base', dmg: 5 });
    r.register({ id: 'test.base', name: 'Base', dmg: 1 });
    expect(r.get('test.kid').name).toBe('Base');
    expect(r.get('test.kid').dmg).toBe(5);
  });

  it('throws loud on an unknown parent', () => {
    const r = new Registry<W>('W');
    r.register({ id: 'test.x', parent: 'test.ghost' });
    expect(() => r.get('test.x')).toThrow(/extends unknown parent 'test.ghost'/);
  });

  it('throws loud on a cyclic parent chain', () => {
    const r = new Registry<W>('W');
    r.register({ id: 'test.a', parent: 'test.b' });
    r.register({ id: 'test.b', parent: 'test.a' });
    expect(() => r.get('test.a')).toThrow(/cyclic/);
  });

  it('still rejects duplicate ids', () => {
    const r = new Registry<W>('W');
    r.register({ id: 'test.dup' });
    expect(() => r.register({ id: 'test.dup' })).toThrow(/duplicate id 'test.dup'/);
  });
});

describe('Registry — boot validation', () => {
  const noNegDmg = (d: W) => (d.dmg !== undefined && d.dmg < 0 ? 'dmg must be ≥ 0' : null);

  it('rejects an invalid def on first access (fail loud)', () => {
    const r = new Registry<W>('W', noNegDmg);
    r.register({ id: 'test.ok', dmg: 5 });
    r.register({ id: 'test.bad', dmg: -1 });
    expect(() => r.all()).toThrow(/invalid def 'test.bad': dmg must be ≥ 0/);
  });

  it('validates the RESOLVED def (after parent + child merge)', () => {
    const r = new Registry<W>('W', noNegDmg);
    r.register({ id: 'test.base', dmg: 5 });
    r.register({ id: 'test.kid', parent: 'test.base', dmg: -3 }); // the override is what makes it invalid
    expect(() => r.get('test.kid')).toThrow(/invalid def 'test.kid'/);
  });

  it('passes valid defs through untouched', () => {
    const r = new Registry<W>('W', noNegDmg);
    r.register({ id: 'test.ok', dmg: 5 });
    expect(r.get('test.ok').dmg).toBe(5);
  });
  it('rejects ids that violate the <family>.<camelCaseSlug> grammar at registration', () => {
    const r = new Registry<Def>('Grammar');
    expect(() => r.register({ id: 'noNamespace' })).toThrow(/grammar/);
    expect(() => r.register({ id: 'acc.snake_case' })).toThrow(/grammar/);
    expect(() => r.register({ id: 'Family.Upper' })).toThrow(/grammar/);
    expect(() => r.register({ id: 'weapon.goldCutlass2' })).not.toThrow();
  });
});
