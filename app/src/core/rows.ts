import type { Def } from './Registry';

/**
 * Structural narrowing for EXTERNAL content rows (ARCHITECTURE_SCALE §11 pillar 1). Hardcoded .ts rows are
 * shape-checked by the compiler; JSON rows arrive as `unknown`, and this reader is the compile-time net's
 * runtime replacement — the ConfigErrors discipline at the shape level. Three guarantees, all fail-loud at
 * MODULE LOAD (before any game exists):
 *  1. Every accessor throws naming the FAMILY, ROW ID, and FIELD ("Terrains row 'terrain.sand': field
 *     'speedMul' must be a finite number") — a typo'd data file names the exact cell to fix.
 *  2. UNKNOWN fields throw too: the reader tracks what the parser read, and a leftover key is a misspelled
 *     optional ("colour") that would otherwise silently default — the silent-failure class, closed.
 *  3. Colors are authored as '#rrggbb' strings (JSON has no hex literals; raw ints are unreadable) and
 *     parsed to the numbers the defs carry.
 * Semantic checks (ranges, cross-field rules) stay on each Registry's Validator — this kit proves SHAPE.
 */
export class RowReader {
  private readonly seen = new Set<string>();
  private readonly nested: RowReader[] = []; // child readers (obj fields) — swept by assertNoUnknown too

  constructor(
    private readonly row: Record<string, unknown>,
    private readonly where: string, // "Terrains row 'terrain.sand'" — every throw names the cell
  ) {}

  private get(field: string): unknown {
    this.seen.add(field);
    return this.row[field];
  }

  private fail(field: string, wanted: string): never {
    throw new Error(`${this.where}: field '${field}' must be ${wanted} (got ${JSON.stringify(this.row[field])})`);
  }

  str(field: string): string {
    const v = this.get(field);
    if (typeof v !== 'string' || v === '') this.fail(field, 'a non-empty string');
    return v;
  }

  num(field: string): number {
    const v = this.get(field);
    if (typeof v !== 'number' || !Number.isFinite(v)) this.fail(field, 'a finite number');
    return v;
  }

  bool(field: string): boolean {
    const v = this.get(field);
    if (typeof v !== 'boolean') this.fail(field, 'a boolean');
    return v;
  }

  /** '#rrggbb' → the 0xrrggbb number the defs carry. */
  color(field: string): number {
    const v = this.str(field);
    if (!/^#[0-9a-fA-F]{6}$/.test(v)) this.fail(field, "a '#rrggbb' color string");
    return parseInt(v.slice(1), 16);
  }

  /** One of a closed set — the runtime form of a string-literal-union field. */
  oneOf<T extends string>(field: string, allowed: readonly T[]): T {
    const v = this.str(field);
    if (!(allowed as readonly string[]).includes(v)) this.fail(field, `one of ${allowed.join(' | ')}`);
    return v as T; // proven by the includes() check — TS can't narrow through Array.includes
  }

  /** Nested object → its own reader (unknown-field tracking applies inside it too). */
  obj(field: string): RowReader {
    const v = this.get(field);
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      const nested = new RowReader(v as Record<string, unknown>, `${this.where}.${field}`); // narrowing at the untyped boundary
      this.nested.push(nested);
      return nested;
    }
    this.fail(field, 'an object');
  }

  /** A LIST of nested objects → one reader each (unknown-field tracking applies inside every element). */
  objs(field: string): RowReader[] {
    const v = this.get(field);
    if (!Array.isArray(v)) this.fail(field, 'an array of objects');
    return v.map((el, i) => {
      if (typeof el !== 'object' || el === null || Array.isArray(el)) this.fail(field, `an array of objects (element ${i} is not one)`);
      const nested = new RowReader(el as Record<string, unknown>, `${this.where}.${field}[${i}]`); // narrowing at the untyped boundary
      this.nested.push(nested);
      return nested;
    });
  }

  // optional variants: ABSENT stays undefined; PRESENT must parse (a present-but-wrong value is a typo, not a default)
  optStr(field: string): string | undefined {
    return this.get(field) === undefined ? undefined : this.str(field);
  }

  optNum(field: string): number | undefined {
    return this.get(field) === undefined ? undefined : this.num(field);
  }

  optBool(field: string): boolean | undefined {
    return this.get(field) === undefined ? undefined : this.bool(field);
  }

  optColor(field: string): number | undefined {
    return this.get(field) === undefined ? undefined : this.color(field);
  }

  optObjs(field: string): RowReader[] | undefined {
    return this.get(field) === undefined ? undefined : this.objs(field);
  }

  optOneOf<T extends string>(field: string, allowed: readonly T[]): T | undefined {
    return this.get(field) === undefined ? undefined : this.oneOf(field, allowed);
  }

  /** After the parser ran: any key it never read is a misspelled field — throw, naming it. */
  assertNoUnknown(): void {
    for (const key of Object.keys(this.row)) {
      if (!this.seen.has(key)) throw new Error(`${this.where}: unknown field '${key}' — misspelled, or missing from the parser`);
    }
    for (const n of this.nested) n.assertNoUnknown();
  }
}

/** Parse an external JSON payload (an ARRAY of row objects) through a per-family parser, then reject any
 *  field the parser didn't read. The result feeds Registry.registerAll — id grammar, duplicates, parent
 *  chains, and the family Validator all still apply on top; this only replaces what tsc used to prove. */
export function parseRows<T extends Def>(family: string, payload: unknown, parse: (r: RowReader) => T): T[] {
  if (!Array.isArray(payload)) throw new Error(`${family}: external data must be an ARRAY of rows`);
  return payload.map((row, i) => {
    if (typeof row === 'object' && row !== null && !Array.isArray(row)) {
      const rec = row as Record<string, unknown>; // narrowing at the untyped boundary (JSON.parse output)
      const id = typeof rec.id === 'string' ? rec.id : `#${i}`;
      const reader = new RowReader(rec, `${family} row '${id}'`);
      const def = parse(reader);
      reader.assertNoUnknown();
      return def;
    }
    throw new Error(`${family}: row #${i} is not an object`);
  });
}
