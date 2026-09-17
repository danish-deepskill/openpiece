import { Abilities } from '../combat/Ability';
import { Effects } from '../combat/Effect';
import { hitVolumeProblem } from '../combat/hitVolume';
import { Registry, type ContentId } from '../core/Registry';
import { Accessories } from './accessories';
import { AIProfiles } from './aiProfiles';
import { Fruits, Styles, Weapons } from './layers';
import { Manuals } from './manuals';
import { Traits } from './traits';
import { BASE_KIT, Units } from './units';
// side-effect imports: these families have no cross-ref fields pulled in above, so without these lines
// they're INVISIBLE to Registry.instances when the sweep runs standalone (CI). A new def module either
// gets imported for phase 2 or listed here; content.test.ts machine-checks completeness.
import './ships';
import './bodies';
import './races';
import './sizes';
import './terrains';
import './structures';
import './materials';

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
 * unit.faction / unit.race / unit.size are compile-time unions — tsc already guards those; bare
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
    check(u.id, 'weapon', u.weapon, Weapons);
    check(u.id, 'style', u.style, Styles); // the fighting style (grants the unarmed attack) must resolve
    for (const a of u.accessories ?? []) check(u.id, 'accessories', a, Accessories);
    for (const tr of u.traits ?? []) check(u.id, 'traits', tr, Traits); // a typo'd trait id would silently grant nothing
  }
  // a trait's granted abilities must be registered (a typo'd grant would silently unlock nothing)
  for (const tr of Traits.all()) for (const a of tr.grants ?? []) check(tr.id, 'grants', a, Abilities);
  // a style's granted abilities (primary/heavy/dash) must be registered
  for (const s of Styles.all()) {
    check(s.id, 'primary', s.primary, Abilities);
    check(s.id, 'heavy', s.heavy, Abilities);
    check(s.id, 'dash', s.dash, Abilities);
  }
  for (const a of Abilities.all()) {
    check(a.id, 'grantEffect', a.grantEffect, Effects);
    check(a.id, 'comboNext', a.comboNext, Abilities); // a broken chain link would dead-end a combo mid-fight
    const hv = hitVolumeProblem(a.shape?.hitVolumes); // a typo'd window/span = a swing that silently never hits
    if (hv) problems.push(`${a.id}: ${hv}`);
  }
  for (const w of Weapons.all()) {
    check(w.id, 'primary', w.primary, Abilities);
    const hv = hitVolumeProblem(w.hitVolumes);
    if (hv) problems.push(`${w.id}: ${hv}`);
    if (w.grip && !((w.grip.spacing ?? 0) >= 0)) problems.push(`${w.id}: grip.spacing must be ≥ 0`);
    if (w.visual?.kind === 'sprite') {
      if (!(w.visual.length > 0)) problems.push(`${w.id}: visual.length must be > 0`);
      const gripAt = w.visual.gripAt ?? 0;
      if (!(gripAt >= 0 && gripAt < 1)) problems.push(`${w.id}: visual.gripAt must be in [0, 1) — 1 would put the hand at the tip`);
    }
  }
  for (const f of Fruits.all()) {
    check(f.id, 'primary', f.primary, Abilities);
    check(f.id, 'heavy', f.heavy, Abilities);
    for (const s of f.slots) check(f.id, 'slots', s, Abilities);
  }
  for (const s of Styles.all()) check(s.id, 'dash', s.dash, Abilities);
  // a manual (skill book) must teach a REGISTERED ability (a typo'd `teaches` would grant a dead id on read)
  for (const m of Manuals.all()) check(m.id, 'teaches', m.teaches, Abilities);
  // engine-referenced well-known ids (the DefOf idiom): code holds these strings, so the sweep guards them
  check('BASE_KIT', 'primary', BASE_KIT.primary, Abilities);
  check('BASE_KIT', 'heavy', BASE_KIT.heavy, Abilities);
  check('BASE_KIT', 'dash', BASE_KIT.dash, Abilities);

  if (problems.length) throw new Error(`Content validation failed:\n- ${problems.join('\n- ')}`);
}
