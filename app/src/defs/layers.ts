import { Registry, type ContentId, type Def, type Validator } from '../core/Registry';
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
export interface WeaponDef extends LayerDef {
  weaponClass: 'light' | 'medium' | 'heavy' | 'ranged';
  primary: ContentId; // basic-attack ability
  visual?: { kind: 'blade' | 'dagger' | 'club'; length: number; width: number; color: number }; // drawn in-hand
}
export interface FruitDef extends LayerDef {
  fruitType: 'paramecia' | 'zoan' | 'logia';
  primary: ContentId; // overrides the LIGHT attack while held
  heavy?: ContentId; // overrides the HEAVY attack while held (e.g. Gomu Stamp); falls back to the kick
  slots: ContentId[]; // extra abilities (U, I)
}
export interface StyleDef extends LayerDef {
  dash: ContentId;
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
  visual: { kind: 'blade', length: 30, width: 5, color: 0xcdd3da },
  modifiers: [{ stat: 'atk', op: 'flat', value: 6, source: 'weapon:weapon.cutlass' }],
  tags: ['weapon.class.medium'],
});

Weapons.register({
  id: 'weapon.knife',
  name: 'Knife',
  weaponClass: 'light',
  primary: 'ability.stab',
  visual: { kind: 'dagger', length: 22, width: 3, color: 0xbfc6cf }, // short, thin dagger (grip + guard + point)
  modifiers: [{ stat: 'atk', op: 'flat', value: 3, source: 'weapon:weapon.knife' }], // light = modest bonus (cutlass is +6)
  tags: ['weapon.class.light'],
});

Fruits.register({
  id: 'fruit.gomu',
  name: 'Gomu Gomu no Mi',
  fruitType: 'paramecia',
  primary: 'ability.gomuPistol',
  heavy: 'ability.gomuStamp',
  slots: ['ability.gomuGatling', 'ability.gomuRocket'],
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

Potentials.register({
  id: 'potential.ironbody',
  name: 'Iron Body',
  modifiers: [
    { stat: 'atk', op: 'addPct', value: 0.15, source: 'potential:potential.ironbody' },
    { stat: 'def', op: 'flat', value: 10, source: 'potential:potential.ironbody' },
  ],
  tags: ['potential.ironbody'],
});
