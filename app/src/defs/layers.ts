import { Registry, type ContentId, type Def } from '../core/Registry';
import type { Modifier } from '../combat/Modifier';

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
  wclass: 'light' | 'medium' | 'heavy' | 'ranged';
  primary: ContentId; // basic-attack ability
  visual?: { kind: 'blade' | 'club'; length: number; width: number; color: number }; // drawn in-hand
}
export interface FruitDef extends LayerDef {
  ftype: 'paramecia' | 'zoan' | 'logia';
  primary: ContentId; // overrides the basic attack while held
  slots: ContentId[]; // extra abilities (K, L)
}
export interface StyleDef extends LayerDef {
  dash: ContentId;
}
export type PotentialDef = LayerDef;

export const Weapons = new Registry<WeaponDef>('Weapons');
export const Fruits = new Registry<FruitDef>('Fruits');
export const Styles = new Registry<StyleDef>('Styles');
export const Potentials = new Registry<PotentialDef>('Potentials');

Weapons.register({
  id: 'weapon.cutlass',
  name: 'Cutlass',
  wclass: 'medium',
  primary: 'ability.slash',
  visual: { kind: 'blade', length: 30, width: 5, color: 0xcdd3da },
  modifiers: [{ stat: 'atk', op: 'flat', value: 6, source: 'weapon:weapon.cutlass' }],
  tags: ['weapon.class.medium'],
});

Fruits.register({
  id: 'fruit.gomu',
  name: 'Gomu Gomu no Mi',
  ftype: 'paramecia',
  primary: 'ability.gomuPistol',
  slots: ['ability.gomuGatling', 'ability.gomuRocket'],
  modifiers: [{ stat: 'atk', op: 'flat', value: 5, source: 'fruit:fruit.gomu' }],
  tags: ['fruit.type.paramecia'],
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
