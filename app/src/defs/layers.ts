import { Registry, type ContentId, type Def, type Validator } from '../core/Registry';
import type { HitVolume } from '../combat/hitVolume';
import { modifierProblem, type Modifier } from '../combat/Modifier';

/**
 * The four combat layers, each pure data. Equipping one registers its Modifiers (by source) onto the
 * wearer's StatBlock, adds its Tags, and grants its Abilities — so the layers compose without any
 * layer-specific code. Add a fruit/weapon/style/potential = add a registry entry.
 */
export interface LayerDef extends Def {
  name: string;
  modifiers: Modifier[];
  tags: string[];
}
/** A weapon's in-hand look. `length` is SIM data either way (reach + hitbox span, measured hand→tip); the
 *  substrate is per-item: procedural kinds draw primitives, 'sprite' renders the weapon's own texture
 *  pinned to the grip (WeaponSpriteSystem). Sprite orientation is DATA, not a convention artists must obey:
 *  `tipAt` says which canvas end is the striking tip (default 'top'); `gripAt` is where the hand holds, as
 *  a fraction of the art from the POMMEL end (0 = the very end; the pommel overhangs behind the hand). */
export type WeaponVisual =
  | { kind: 'blade' | 'club'; length: number; width: number; color: number }
  | { kind: 'sprite'; art: string; length: number; width: number; tipAt?: 'top' | 'bottom'; gripAt?: number };

/** Weapon weight/archetype tier — drives the phase ladder (combat/phases.WEIGHT_PHASES: heavier = longer
 *  windup) and posture damage. The four classes ARE the full weight ladder now (CombatWeight = WeaponClass);
 *  a weaponless attack (fist/kick/gore) has no class and falls back to 'light'. */
export type WeaponClass = 'light' | 'medium' | 'heavy' | 'ranged';

export interface WeaponDef extends LayerDef {
  weaponClass: WeaponClass;
  primary: ContentId; // basic-attack ability
  visual?: WeaponVisual; // drawn in-hand
  /** How the weapon is HELD — per-weapon, so every weapon's hold can differ. `hands: 2` puts the off-hand on
   *  the handle `spacing` px above the lead hand (a two-handed grip) instead of at its rest position. */
  grip?: { hands: 1 | 2; spacing?: number };
  /** The weapon's default damaging volumes (combat/hitVolume) — e.g. a hammer that only hurts with its head:
   *  [{ kind: 'weaponSegment', from: 0.85 }]. An ability's own hitVolumes overrides this wholesale.
   *  Unset ⇒ the whole drawn weapon damages (a blade). */
  hitVolumes?: HitVolume[];
}
export interface FruitDef extends LayerDef {
  fruitType: 'paramecia' | 'zoan' | 'logia';
  primary: ContentId; // overrides the LIGHT attack while held
  heavy?: ContentId; // overrides the HEAVY attack while held (e.g. Gomu Stamp); falls back to the kick
  slots: ContentId[]; // extra abilities (U, I)
}
export interface StyleDef extends LayerDef {
  dash: ContentId;
  /** A fighting style's basic UNARMED attack (Black Leg kick, Rokushiki strike, a brawler's haymaker) —
   *  grants + becomes the LIGHT primary when no weapon is held (a weapon still wins). This is where a bare-
   *  handed unit's bespoke strike comes from: a martial art, not a per-unit field. Unset ⇒ the base fist. */
  primary?: ContentId;
  /** The style's HEAVY unarmed attack (a committed kick/haymaker), like FruitDef.heavy. Unset ⇒ the base kick. */
  heavy?: ContentId;
}
export type PotentialDef = LayerDef;

// one boot validator for all four layer families: a NaN modifier silently computes as 0 mid-game otherwise
// (their ContentId refs — primary/heavy/slots/dash → Abilities — are checked by defs/validateContent.ts)
const layerValid: Validator<LayerDef> = (d) => modifierProblem(d.modifiers);

export const Weapons = new Registry<WeaponDef>('Weapons', layerValid);
export const Fruits = new Registry<FruitDef>('Fruits', layerValid);
export const Styles = new Registry<StyleDef>('Styles', layerValid);
export const Potentials = new Registry<PotentialDef>('Potentials', layerValid);

Weapons.register({
  id: 'weapon.cutlass',
  name: 'Cutlass',
  weaponClass: 'medium',
  primary: 'ability.cut',
  visual: { kind: 'sprite', art: 'weapon/cutlass_1.png', length: 30, width: 6, tipAt: 'bottom', gripAt: 0.28 }, // curved sabre art points DOWN; hand holds the grip near the top
  modifiers: [{ stat: 'atk', op: 'flat', value: 6, source: 'weapon:weapon.cutlass' }],
  tags: ['weapon.class.medium'],
});

Weapons.register({
  id: 'weapon.sword',
  name: 'Sword',
  weaponClass: 'heavy', // the committed blade: longest windup (a readable rear-back) + punishable tail
  primary: 'ability.swordSlash1', // entry of the 3-hit chain (slash1 → slash2 → finisher, then lockout)
  visual: { kind: 'sprite', art: 'weapon/sword_1.png', length: 38, width: 6, tipAt: 'bottom', gripAt: 0.27 }, // art points DOWN; hand holds mid-handle
  grip: { hands: 2, spacing: 7 }, // a two-handed hold — the off-hand joins the handle above the lead hand
  // DEAD ZONE: the inner 30% of the blade doesn't cut — stand chest-to-chest and the sword whiffs OVER you.
  // This is what makes reach two-sided: the blade owns the mid-range, fists own the inside.
  hitVolumes: [{ kind: 'weaponSegment', from: 0.3 }],
  modifiers: [{ stat: 'atk', op: 'flat', value: 9, source: 'weapon:weapon.sword' }], // heavier steel than the cutlass (+6)
  tags: ['weapon.class.heavy'],
});

Weapons.register({
  id: 'weapon.dagger',
  name: 'Dagger',
  weaponClass: 'light',
  primary: 'ability.daggerSlice', // chain ROOT: Slice (swing) → Stab (finisher); see the dagger combo in Ability.ts
  visual: { kind: 'sprite', art: 'weapon/dagger_1.png', length: 22, width: 5, tipAt: 'bottom', gripAt: 0.3 }, // dagger art points DOWN; hand holds the grip near the top. length 22 = the blade's own reach (hitbox matches the drawn blade)
  modifiers: [{ stat: 'atk', op: 'flat', value: 3, source: 'weapon:weapon.dagger' }], // light = modest bonus (cutlass is +6)
  tags: ['weapon.class.light'],
});

Fruits.register({
  id: 'fruit.gomu',
  name: 'Gomu Gomu no Mi',
  fruitType: 'paramecia',
  primary: 'ability.gomuPistol',
  heavy: 'ability.gomuStamp',
  slots: ['ability.gomuGatling', 'ability.gomuRocket', 'ability.gomuOno'],
  modifiers: [{ stat: 'atk', op: 'flat', value: 5, source: 'fruit:fruit.gomu' }],
  tags: ['fruit.type.paramecia', 'fruit.gomu.rubber'],
});

Styles.register({
  id: 'style.flashstep',
  name: 'Flash Step',
  dash: 'ability.flashDash',
  modifiers: [{ stat: 'atk', op: 'flat', value: 2, source: 'style:style.flashstep' }],
  tags: ['style.flashstep'],
});
// STRIKING styles — a bare-handed unit's basic attack comes from its martial art (not a per-unit field).
// dash falls back to the base roll (these are striking, not movement, styles). This is the seam Black Leg /
// Rokushiki plug into: a richer style would add heavy/slots/modifiers on top (or swap the roll for Soru/Geppo).
Styles.register({
  id: 'style.brawl',
  name: 'Street Brawling',
  dash: 'ability.roll',
  primary: 'ability.banditStrike', // the bandit's trained jab (was unit.thug's attackAbility)
  modifiers: [],
  tags: ['style.brawl'],
});
Styles.register({
  id: 'style.haymaker',
  name: 'Haymaker',
  dash: 'ability.roll',
  primary: 'ability.brawlerStrike', // the boss's committed bare-fist swing (was unit.brawler's attackAbility)
  modifiers: [],
  tags: ['style.haymaker'],
});
// the BULL's "style" — its natural weapon (the headbutt gore) as its basic attack. A style is just how a
// weapon-less body's strike is granted (the Moat); an animal's attack is a style like a martial art is.
Styles.register({
  id: 'style.gore',
  name: 'Gore',
  dash: 'ability.roll',
  primary: 'ability.gore',
  modifiers: [],
  tags: ['style.gore'],
});

Potentials.register({
  id: 'potential.ironbody',
  name: 'Iron Body',
  modifiers: [
    { stat: 'atk', op: 'addPct', value: 0.15, source: 'potential:potential.ironbody' },
    { stat: 'def', op: 'flat', value: 10, source: 'potential:potential.ironbody' },
  ],
  tags: ['potential.ironbody'],
});
