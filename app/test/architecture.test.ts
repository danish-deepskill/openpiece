import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The sim/presentation boundary as an EXECUTABLE contract (DESIGN_PATTERNS §3/§5): the simulation must run
 * headless (Node server, Workers, these very tests), so sim code may never import Phaser — not even type-only,
 * so sim data can't quietly grow engine-object fields again. If this test fails, the fix is to move the code
 * or route through an event/side-table, NOT to extend the allowlist.
 */

const SRC = join(__dirname, '..', 'src');

/** Folders that are 100% simulation — zero 'phaser' imports allowed. */
const SIM_DIRS = ['ai', 'combat', 'core', 'defs', 'ecs', 'world'];

/** The only systems/ files allowed to import Phaser (they take `scene` first — the presentation marker). */
const PRESENTATION_SYSTEMS = new Set([
  'AccessorySystem.ts',
  'AimReticle.ts',
  'DebugOverlay.ts',
  'FxSystem.ts',
  'InputSystem.ts',
  'InspectSystem.ts',
  'NameplateSystem.ts',
  'ProjectileRenderer.ts',
  'RenderSystem.ts',
  'WeaponSpriteSystem.ts',
]);

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (name.endsWith('.ts')) out.push(p);
  }
  return out;
}

const importsPhaser = (file: string): boolean => /from 'phaser'/.test(readFileSync(file, 'utf8'));

describe('architecture — the sim/presentation boundary holds', () => {
  for (const dir of SIM_DIRS) {
    it(`src/${dir} is engine-agnostic (no phaser import, runtime or type)`, () => {
      const offenders = tsFiles(join(SRC, dir)).filter(importsPhaser);
      expect(offenders).toEqual([]);
    });
  }

  it('only the allowlisted presentation systems import phaser', () => {
    const offenders = tsFiles(join(SRC, 'systems'))
      .filter(importsPhaser)
      .map((p) => p.split(/[\\/]/).pop() ?? p)
      .filter((name) => !PRESENTATION_SYSTEMS.has(name));
    expect(offenders).toEqual([]);
  });

  it('sim code never reads the wall clock (Date.now/performance.now) — determinism (§8)', () => {
    const offenders: string[] = [];
    for (const dir of SIM_DIRS) {
      for (const f of tsFiles(join(SRC, dir))) {
        if (/Date\.now|performance\.now|new Date\(/.test(readFileSync(f, 'utf8'))) offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('components hold no live Entity refs — cross-entity refs are IDS at rest (ecs-hot-loop canon)', () => {
    // A component field typed `Entity` is a live pointer that survives ticks: it dangles after destroy()
    // and blocks the snapshot/save layer. Store the id, resolve via world.byId() at point of use.
    // Strip the Entity DECLARATION (defined in this file) and all comments, then ANY bare `Entity` token
    // left is a leak — `: Entity` alone missed generic positions (Set<Entity>, Map<n, Entity>, () => Entity).
    const src = readFileSync(join(SRC, 'ecs', 'components.ts'), 'utf8');
    const body = src
      .replace(/export type Entity = [^;]*;/, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(body.match(/\bEntity\b/g) ?? []).toEqual([]);
  });
});
