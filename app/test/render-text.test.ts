import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SRC, simFiles, tsFiles } from './boundary';

/**
 * The render-scale contract (config/render.ts) as an EXECUTABLE rule, in the architecture.test idiom:
 *  1. Phaser text is created ONLY through `ui/text.addText`, which stamps `resolution: RENDER_SCALE`. Without
 *     it a Text rasterizes at 1× and blurs under the scaled cameras — a SILENT failure (nothing throws, the
 *     glyphs are just soft), so the single door is enforced here instead of by review.
 *  2. `config/render.ts` reads the window; sim code (the sim folders AND the non-presentation systems) must
 *     never import it — a headless server would throw at import. The boundary lists are test/boundary.ts.
 */

const TEXT_DOOR = join('ui', 'text.ts');

describe('render scale — text goes through one door, the window read stays out of the sim', () => {
  it('no file but ui/text.ts constructs a Text (scene.add.text / scene.make.text)', () => {
    const offenders = tsFiles(SRC)
      .filter((f) => !f.endsWith(TEXT_DOOR))
      .filter((f) => /\b(add|make)\s*\.\s*text\s*\(/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(SRC.length + 1));
    expect(offenders).toEqual([]);
  });

  it('sim code never imports config/render (it reads the window)', () => {
    const offenders = simFiles()
      .filter((f) => /config\/render'/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(SRC.length + 1));
    expect(offenders).toEqual([]);
  });
});
