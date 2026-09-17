import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The sim/presentation boundary as DATA shared by the boundary tests (architecture.test, render-text.test) —
 * one allowlist, so the two contracts can't drift apart (a system added to one list but not the other would
 * pass one test and fail the headless server).
 */

export const SRC = join(__dirname, '..', 'src');

/** Folders that are 100% simulation — zero 'phaser' imports, zero window reads. */
export const SIM_DIRS = ['ai', 'combat', 'core', 'defs', 'ecs', 'world'];

/** The only systems/ files allowed to import Phaser (they take `scene` first — the presentation marker). */
export const PRESENTATION_SYSTEMS = new Set([
  'AccessorySystem.ts',
  'AimReticle.ts',
  'DebugOverlay.ts',
  'FxSystem.ts',
  'InputSystem.ts',
  'InspectSystem.ts',
  'NameplateSystem.ts',
  'PossessButton.ts',
  'ProjectileRenderer.ts',
  'RenderSystem.ts',
  'StunIndicator.ts',
  'WeaponSpriteSystem.ts',
]);

export function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (name.endsWith('.ts')) out.push(p);
  }
  return out;
}

export const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p;

/** Every sim .ts file: the SIM_DIRS plus the systems/ files NOT on the presentation allowlist. */
export function simFiles(): string[] {
  const out: string[] = [];
  for (const dir of SIM_DIRS) out.push(...tsFiles(join(SRC, dir)));
  for (const f of tsFiles(join(SRC, 'systems'))) if (!PRESENTATION_SYSTEMS.has(baseName(f))) out.push(f);
  return out;
}
