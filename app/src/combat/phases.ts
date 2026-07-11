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

/** The weight tier an attack times against — the four weapon classes. A WEAPONLESS attack (fist/kick/bare
 *  strike) has no weapon class, so it falls back to 'light' (the twitchiest rung); most bare attacks author
 *  their OWN shape.phases anyway, so the fallback only sets the default for an unauthored one. */
export type CombatWeight = WeaponClass;

/**
 * The weight → phase ladder (data, frozen): heavier = longer windup (more telegraphed, more committed) and
 * longer tail. This is what makes a fist beat an unskilled sword: step in during the rear-back, punish the
 * follow-through. An ability's own `shape.phases` overrides its rung entirely (fruits always author theirs).
 */
// The windup FRACTIONS below combine with each ability's swingTime to hit the windup-TIME ladder (readable-tell
// floor ~0.2s for light/fists, ~0.3s medium, ~0.4s heavy): heavier weapons telegraph LONGER, matching their
// higher damage/reach/commitment — so a light fast fist vs a slow punishable sword is a real choice.
export const WEIGHT_PHASES: Record<CombatWeight, AttackPhases> = Object.freeze({
  light: Object.freeze({ windup: 0.4, active: 0.3, recover: 0.3 }), // dagger / bare fists: ~0.2s tell at their ~0.5 swingTime — the floor
  medium: Object.freeze({ windup: 0.5, active: 0.25, recover: 0.25 }), // cutlass: ~0.3s tell — clearly slower
  heavy: Object.freeze({ windup: 0.5, active: 0.25, recover: 0.25 }), // sword: ~0.4s tell at its ~0.8 swingTime — a big rear-back, very punishable
  ranged: Object.freeze({ windup: 0.2, active: 0.3, recover: 0.5 }), // placeholder — shots fire instantly today
});

/** Weight rank for the INTERRUPT ladder (heavier = higher). Ranged sits at light (a quick shot, not a committed
 *  heavy blow). Used to size the chance a hit CANCELS a target's WINDUP (see INTERRUPT_CHANCE / interruptChance). */
const WEIGHT_RANK: Record<CombatWeight, number> = Object.freeze({ ranged: 1, light: 1, medium: 2, heavy: 3 });

/**
 * PROBABILISTIC interrupt (Model D): a hit landing during a target's WINDUP cancels the swing with THIS chance,
 * by how much lighter the attacker is than the swing. Equal-or-heavier is a sure thing; each tier lighter halves
 * it — so a light fist has only a slim shot at cancelling a heavy sword's windup (a lucky clip of the swing-arm),
 * while it reliably interrupts another light. Deliberate RNG in the TACTICAL layer: a light attacker can't just
 * SPAM through a heavy's windup, but isn't fully locked out. (windup-only still gates it — active swings commit.)
 *   diff = swingerRank − attackerRank (how many tiers heavier the swing is)
 */
export const INTERRUPT_CHANCE: readonly number[] = [1, 0.5, 0.25]; // diff 0 → 100%, 1 → 50%, 2 → 25%

/** Chance a hit of `attacker` weight cancels a swing of `swinger` weight during its windup (0..1). */
export function interruptChance(attacker: CombatWeight, swinger: CombatWeight): number {
  const diff = WEIGHT_RANK[swinger] - WEIGHT_RANK[attacker];
  if (diff <= 0) return 1; // equal or heavier → always
  return INTERRUPT_CHANCE[Math.min(diff, INTERRUPT_CHANCE.length - 1)];
}

/** A weapon's KIT: its primary attack + the combo chain it links to — memoized (defs are stable after
 *  registry resolution). The class-default rung applies ONLY to these: a kick thrown while a sword is
 *  sheathed is still an unarmed kick, not a heavy attack. */
const kitCache = new WeakMap<WeaponDef, ReadonlySet<ContentId>>();
export function weaponKit(w: WeaponDef): ReadonlySet<ContentId> {
  let kit = kitCache.get(w);
  if (!kit) {
    const ids = new Set<ContentId>();
    // walk the primary + heavy (musket bash) + signature SLOT (Buckshot/Shock Kick) chains — the ONE kit walk;
    // equip grants FROM this set, so "granted" and "in kit" (posture/interrupt weights) can never disagree
    for (const root of [w.primary, w.heavy, ...(w.slots ?? [])]) {
      let cur: ContentId | undefined = root;
      while (cur && !ids.has(cur)) {
        ids.add(cur);
        cur = Abilities.get(cur).comboNext;
      }
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
 *   ?? the 'light' rung                                  (weaponless fists/kicks fall back here)
 */
export function resolvePhases(e: Entity, d: AbilityDef): AttackPhases {
  if (d.shape?.phases) return d.shape.phases;
  return WEIGHT_PHASES[kitWeapon(e, d)?.weaponClass ?? 'light'];
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
