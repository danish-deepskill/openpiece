import { Abilities } from '../combat/Ability';
import { Effects } from '../combat/Effect';
import { Registry, type ContentId } from '../core/Registry';
import { Accessories } from './accessories';
import { AIProfiles } from './aiProfiles';
import { Fruits, Styles, Weapons } from './layers';
import { BASE_KIT, Units } from './units';
// side-effect import: ShipHulls has no cross-ref fields, so nothing above pulls its module in — without
// this line the family is INVISIBLE to Registry.instances when the sweep runs standalone (CI). A new def
// module either gets imported for phase 2 or listed here; content.test.ts machine-checks completeness.
import './ships';

/** The minimal registry surface a cross-ref check needs (any Registry<T> satisfies it structurally). */
interface AnyRegistry {
  readonly name: string;
  has(id: ContentId): boolean;
}

/**
 * Boot-time whole-graph content validation — RimWorld's cross-reference pass, TS-sized. Two phases:
 *  1. Force-resolve EVERY registry (runs parent-chain flattening + each family's Validator) so lazy
 *     resolution can't defer a bad def to its first mid-game lookup.
 *  2. Check every cross-registry ContentId field points at a real def, so a typo'd id fails at BOOT with
 *     every problem listed — not at first spawn/equip (the fail-loud-at-boot canon, made a runtime fact).
 * unit.faction / unit.body are compile-time unions (FactionId/BodyKey) — tsc already guards those; bare
 * ContentId strings are what this sweep exists for, and it becomes the ONLY net once defs move to external
 * JSON (ARCHITECTURE_SCALE §11 pillar 1). Call once at world start; the content sweep test runs it in CI.
 */
export function validateAllContent(): void {
  const problems: string[] = [];

  // phase 1 — resolve + per-family validators over EVERY constructed registry (Registry.instances, so a
  // new family is swept the moment its module loads — no hand-list to forget); collect, don't stop early
  for (const reg of Registry.instances) {
    try {
      reg.all();
    } catch (err) {
      problems.push(err instanceof Error ? err.message : String(err));
    }
  }
  // a family that failed to RESOLVE can't be cross-ref checked — report what's known and stop here
  if (problems.length) throw new Error(`Content validation failed:\n- ${problems.join('\n- ')}`);

  // phase 2 — every ContentId field resolves in its target registry
  const check = (owner: string, field: string, id: ContentId | undefined, reg: AnyRegistry): void => {
    if (id !== undefined && !reg.has(id)) problems.push(`${owner}: ${field} → '${id}' is not in ${reg.name}`);
  };
  for (const u of Units.all()) {
    check(u.id, 'aiProfile', u.aiProfile, AIProfiles);
    check(u.id, 'attackAbility', u.attackAbility, Abilities);
    check(u.id, 'weapon', u.weapon, Weapons);
    for (const a of u.accessories ?? []) check(u.id, 'accessories', a, Accessories);
  }
  for (const a of Abilities.all()) check(a.id, 'grantEffect', a.grantEffect, Effects);
  for (const w of Weapons.all()) check(w.id, 'primary', w.primary, Abilities);
  for (const f of Fruits.all()) {
    check(f.id, 'primary', f.primary, Abilities);
    check(f.id, 'heavy', f.heavy, Abilities);
    for (const s of f.slots) check(f.id, 'slots', s, Abilities);
  }
  for (const s of Styles.all()) check(s.id, 'dash', s.dash, Abilities);
  // engine-referenced well-known ids (the DefOf idiom): code holds these strings, so the sweep guards them
  check('BASE_KIT', 'primary', BASE_KIT.primary, Abilities);
  check('BASE_KIT', 'heavy', BASE_KIT.heavy, Abilities);
  check('BASE_KIT', 'dash', BASE_KIT.dash, Abilities);

  if (problems.length) throw new Error(`Content validation failed:\n- ${problems.join('\n- ')}`);
}
