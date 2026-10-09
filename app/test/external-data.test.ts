import { describe, expect, it } from 'vitest';
import type { Def } from '../src/core/Registry';
import { parseRows, type RowReader } from '../src/core/rows';
import { Structures } from '../src/defs/structures';
import { TERRAIN, Terrains, terrainByOrdinal } from '../src/defs/terrains';

/** A toy family for exercising the reader's failure modes without touching the real registries. */
interface ToyDef extends Def {
  n: number;
  c?: number;
}
const parseToy = (r: RowReader): ToyDef => ({ id: r.str('id'), n: r.num('n'), c: r.optColor('c') });

describe('external data (pillar-1 pilot: terrains + structures load from data/*.json)', () => {
  it('both families load with parsed values — colors decoded, nested size intact, unions narrowed', () => {
    expect(Terrains.size).toBe(6);
    expect(Structures.size).toBe(9); // wall, door, stoneWall, tree, windmill, chest, waystone, duelGong, trainingPost
    expect(Terrains.get('terrain.grass').color).toBe(0x4f8a45); // '#4f8a45' string → the number defs carry
    expect(Terrains.get('terrain.water').aiFootAvoid).toBe(true);
    expect(Structures.get('structure.windmill').size).toEqual({ w: 3, h: 2 }); // nested object field
    expect(terrainByOrdinal(TERRAIN.shallowWater).water).toBe('shallow'); // union narrowed via oneOf
  });

  it('a malformed field fails LOUD, naming family + row + field (the tsc net, rebuilt at runtime)', () => {
    expect(() => parseRows('Toys', [{ id: 'toy.a', n: 'not-a-number' }], parseToy)).toThrow(
      /Toys row 'toy\.a'.*'n' must be a finite number/,
    );
  });

  it("a MISSPELLED optional field throws instead of silently defaulting (the 'colour' trap)", () => {
    // pre-reader, a typo'd optional field silently vanished — the row loaded, the field defaulted,
    // and nothing anywhere said why the tuning "didn't work"
    expect(() => parseRows('Toys', [{ id: 'toy.a', n: 1, see: 123 }], parseToy)).toThrow(/unknown field 'see'/);
  });

  it("colors must be '#rrggbb' strings; anything else is refused, valid ones decode", () => {
    expect(() => parseRows('Toys', [{ id: 'toy.a', n: 1, c: '#12z' }], parseToy)).toThrow(/'#rrggbb'/);
    expect(parseRows('Toys', [{ id: 'toy.a', n: 1, c: '#0A0b0C' }], parseToy)[0].c).toBe(0x0a0b0c);
  });

  it('non-array payloads and non-object rows are refused at load', () => {
    expect(() => parseRows('Toys', { id: 'toy.a' }, parseToy)).toThrow(/ARRAY of rows/);
    expect(() => parseRows('Toys', [42], parseToy)).toThrow(/row #0 is not an object/);
  });
});
