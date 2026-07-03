import { describe, expect, it } from 'vitest';
import { Accessories } from '../src/defs/accessories';
import { visualProblem } from '../src/defs/visual';

describe('Visual — substrate is data (auto / proc / sprite)', () => {
  it('accepts all three kinds', () => {
    expect(visualProblem({ kind: 'auto' })).toBeNull();
    expect(visualProblem({ kind: 'procedural', draw: 'greatHelm' })).toBeNull();
    expect(visualProblem({ kind: 'sprite', art: 'accessories/x.png', scale: 1.6 })).toBeNull();
  });

  it('rejects the invisible-content bugs (missing/empty art, zero scale, empty draw key)', () => {
    expect(visualProblem(undefined)).toMatch(/required/);
    expect(visualProblem({ kind: 'sprite', art: '', scale: 1 })).toMatch(/art/);
    expect(visualProblem({ kind: 'sprite', art: 'x.png', scale: 0 })).toMatch(/scale/);
    expect(visualProblem({ kind: 'procedural', draw: '' })).toMatch(/draw/);
  });

  it('a def with a bad visual fails the Accessories registry loudly at boot', () => {
    Accessories.register({ id: 'accessory.testBad', name: 'Bad', slot: 'head', visual: { kind: 'sprite', art: '', scale: 1 } });
    expect(() => Accessories.get('accessory.testBad')).toThrow(/art/);
  });
});
