import type { ContentId } from '../core/Registry';
import { Weapons, type WeaponDef, type WeaponClass } from '../defs/layers';
import { Abilities, type AbilityDef } from './Ability';
import type { Entity } from '../ecs/components';

/**
 * THE ATTACK PHASE CLOCK — every attack's duration splits into three named regions (the Deepwoken/Sekiro
 * model: windup ≈ their "windup", recover ≈ their "endlag"):
 *
 *   windup   — cocking back. Hitbox NOT live. The TELL a defender reads (and, later, the feint window).
 *   active   — the strike. Hit volumes without their own window are live exactly here.
 *   recover  — follow-through. Hitbox NOT live. The whiff-punish window (and, later, the cancel window).
 *
 * Phases are TIMING only — mechanism-agnostic. What the active phase *does* (contact volumes, a launch,
 * an effect) stays on the ability's other fields; a punch, a rubber pistol, and a future teleport all ride
 * this one clock. Resolved ONCE at cast (see resolvePhases) and stored on the MeleeSwing instance — the
 * same pattern as `motion` — so the hitbox, the renderer, and a future parry all read one truth.
 */
export interface AttackPhases {
  windup: number; // fraction of the attack duration
  active: number;
  recover: number; // windup + active + recover ≈ 1 (boot-validated)
}

export type AttackPhase = 'windup' | 'active' | 'recover';

/** The weight tier an attack times against. 'unarmed' is deliberately NOT a WeaponClass — no weapon is
 *  "unarmed"; it's the tier of the empty-handed kit (fists, kicks), the twitchiest rung on the ladder. */
export type CombatWeight = WeaponClass | 'unarmed';

/**
 * The weight → phase ladder (data, frozen): heavier = longer windup (more telegraphed, more committed) and
 * longer tail. This is what makes a fist beat an unskilled sword: step in during the rear-back, punish the
 * follow-through. An ability's own `shape.phases` overrides its rung entirely (fruits always author theirs).
 */
export const WEIGHT_PHASES: Record<CombatWeight, AttackPhases> = Object.freeze({
  unarmed: Object.freeze({ windup: 0.12, active: 0.45, recover: 0.43 }), // twitchy — the zero-reach compensation
  light: Object.freeze({ windup: 0.18, active: 0.42, recover: 0.4 }), // knife: fast, low commitment
  medium: Object.freeze({ windup: 0.26, active: 0.4, recover: 0.34 }), // cutlass: balanced
  heavy: Object.freeze({ windup: 0.38, active: 0.34, recover: 0.28 }), // sword: a visible rear-back, punishable tail
  ranged: Object.freeze({ windup: 0.2, active: 0.3, recover: 0.5 }), // placeholder — shots fire instantly today
});

/** A weapon's KIT: its primary attack + the combo chain it links to — memoized (defs are stable after
 *  registry resolution). The class-default rung applies ONLY to these: a kick thrown while a sword is
 *  sheathed is still an unarmed kick, not a heavy attack. */
const kitCache = new WeakMap<WeaponDef, ReadonlySet<ContentId>>();
export function weaponKit(w: WeaponDef): ReadonlySet<ContentId> {
  let kit = kitCache.get(w);
  if (!kit) {
    const ids = new Set<ContentId>();
    let cur: ContentId | undefined = w.primary;
    while (cur && !ids.has(cur)) {
      ids.add(cur);
      cur = Abilities.get(cur).comboNext;
    }
    kitCache.set(w, (kit = ids));
  }
  return kit;
}

/** The equipped weapon IFF `d` is that weapon's own kit — THE gate for every weapon-contributed default
 *  (phases, hitVolumes, blade width). A kick thrown while a sword is sheathed gets NOTHING from the sword. */
export function kitWeapon(e: Entity, d: AbilityDef): WeaponDef | undefined {
  const wid = e.equipment?.weapon;
  if (!wid) return undefined;
  const w = Weapons.get(wid);
  return weaponKit(w).has(d.id) ? w : undefined;
}

/**
 * The phase resolution chain (layered data, arrays-replace style — same precedence idiom as hitVolumes):
 *   ability's own shape.phases                          (fruits and bespoke attacks author these)
 *   ?? the equipped weapon's class rung — IF the ability is that weapon's kit (kitWeapon rule)
 *   ?? the unarmed rung                                  (fists/kicks, armed or not)
 */
export function resolvePhases(e: Entity, d: AbilityDef): AttackPhases {
  if (d.shape?.phases) return d.shape.phases;
  return WEIGHT_PHASES[kitWeapon(e, d)?.weaponClass ?? 'unarmed'];
}

/** Which phase the attack is in at progress p∈[0,1] — the one shared clock read (melee gating, the future
 *  parry check, telegraph tinting, the editor scrubber all call THIS, never their own boundary math). */
export function phaseAt(ph: AttackPhases, p: number): AttackPhase {
  if (p < ph.windup) return 'windup';
  if (p < ph.windup + ph.active) return 'active';
  return 'recover';
}

/** The active phase as a window on swing progress — the default `active` for hit volumes that don't author
 *  their own, and the span jab windows map into. */
export function activeWindow(ph: AttackPhases): readonly [number, number] {
  return [ph.windup, ph.windup + ph.active];
}
