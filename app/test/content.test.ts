import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Registry } from '../src/core/Registry';
import { validateAllContent } from '../src/defs/validateContent';

/**
 * The whole-content sweep the game runs at boot (WorldScene.create), executed in CI: every def resolves
 * through its family Validator AND every cross-registry ContentId points at a real def. Registry families
 * are discovered via Registry.instances (importing validateAllContent loads every def module), so a new
 * family is covered here with zero test edits — only its CROSS-REF fields need adding in validateContent.
 */
describe('content graph', () => {
  it('every def validates and every cross-registry id resolves', () => {
    expect(() => validateAllContent()).not.toThrow();
  });

  it('the sweep sees EVERY registry constructed anywhere in src (no invisible families)', () => {
    // auto-discovery's one hole: a def module nothing imports never constructs its registry. Count the
    // `new Registry(` sites in src and demand the live instance list matches — a forgotten module fails here.
    const files = (function walk(dir: string): string[] {
      const out: string[] = [];
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) out.push(...walk(p));
        else if (name.endsWith('.ts')) out.push(p);
      }
      return out;
    })(join(__dirname, '..', 'src'));
    let constructed = 0;
    for (const f of files) {
      if (f.replace(/\\/g, '/').endsWith('core/Registry.ts')) continue; // the class itself, not a family
      constructed += (readFileSync(f, 'utf8').match(/new Registry[<(]/g) ?? []).length;
    }
    expect(Registry.instances.length, 'a `new Registry(` site is not loaded by validateContent — add its module as a side-effect import there').toBe(constructed);
    for (const reg of Registry.instances) {
      expect(reg.size, `${reg.name} registered no defs — deliberately empty families must opt out here`).toBeGreaterThan(0);
    }
  });
});
