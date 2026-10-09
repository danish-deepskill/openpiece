import { modifierProblem, type Modifier } from '../combat/Modifier';
import { Registry, type ContentId, type Def } from '../core/Registry';
import { ATTACK_MOVE_STAT, MOVE_SPEED_STAT, SWIM_BREATH_STAT, SWIM_SPEED_STAT, SWIM_STAM_STAT } from '../combat/stats';

/**
 * A TRAIT — a named, toggleable talent a unit HAS or lacks (RimWorld-style traits / GAS passive tags). Unlike
 * an ability (a discrete ACTION) or an equipped layer (weapon/fruit/style), a trait is an innate PROPERTY of
 * the fighter: it grants `modifiers` (stat tweaks) and/or `tags` (capability/condition markers) for as long as
 * the unit has it. Managed as a plain id list on the unit (`traits: ['trait.mobileAttack.slow']`) — add/remove
 * an id to grant/revoke, the SAME "has-this-marker-or-not" model as ability grants (the Moat).
 *
 * A trait carries NO bespoke read code: its effect is entirely its modifiers/tags, which flow through the
 * existing StatBlock/TagSet plumbing every system already reads. So a NEW trait = a new row here, never a new
 * branch — the content-is-data rule. (First customer: move-while-attacking. Future: berserker, iron-stomach,
 * light-sleeper — the RimWorld trait catalog the vision wants.)
 */
export interface TraitDef extends Def {
  name: string;
  /** One-line flavor for tooltips / the unit inspector. */
  desc?: string;
  /** Stat tweaks granted while the unit has this trait (source-tracked; applied at spawn, removable). */
  modifiers?: Modifier[];
  /** Gameplay tags granted while the unit has this trait (capabilities/conditions the sim reads). */
  tags?: string[];
  /** Abilities this trait GRANTS into the loadout (the same `granted` set weapons/styles add to) — so a trait
   *  can unlock a CAPABILITY, not just tweak stats. E.g. trait.sprinter grants ability.sprint. */
  grants?: ContentId[];
}

// validated at boot: a malformed modifier is a content bug that must fail on load, not silently do nothing
export const Traits = new Registry<TraitDef>('Traits', (t) => modifierProblem(t.modifiers));


Traits.registerAll([
  // MOVE-WHILE-ATTACKING — two mobility bands. A unit lists AT MOST ONE (else the last override wins by
  // registration order, which isn't meaningful — keep it to one). No trait at all = rooted (the base case).
  // Both share the SAME modifier source so a unit can't stack them, and a future retrait wipes cleanly.
  {
    id: 'trait.mobileAttackSlow',
    name: 'Footwork',
    desc: 'Can shuffle while attacking (half speed) — a trained fighter keeps their feet moving.',
    modifiers: [{ stat: ATTACK_MOVE_STAT, op: 'override', value: 0.5, source: 'trait:mobileAttack' }], // exactly half — the desc's number (first carrier: the Samurai)
  },
  // PACE — the stance cycle (ability.pace): a trained fighter chooses how to spend the day — push (breath back fast, the
  // reserve burns) or conserve (slow breath, the reserve guarded). A grant, no modifiers: the modes are the effects.
  { id: 'trait.pace', name: 'Pace', desc: 'Can push for a second wind or settle into a measured breath (Z).', grants: ['ability.pace'] },
  // IRON WILL — a bigger guard: +50% posture capacity, so breaking it takes a real string, not a lucky pair of
  // heavies. mulPct on the DERIVED stat (willpower × POSTURE_PER_WILLPOWER seeds the base; syncDerivedResources
  // carries the ceiling onto the combatant). First carrier: the Ronin.
  {
    id: 'trait.ironWill',
    name: 'Iron Will',
    desc: 'A guard half again as deep — it takes a real string to break.',
    modifiers: [{ stat: 'maxPosture', op: 'mulPct', value: 0.5, source: 'trait:ironWill' }],
  },
  {
    id: 'trait.mobileAttackFull',
    name: 'Flow',
    desc: 'Attacks at full stride — an expert never has to plant to swing.',
    modifiers: [{ stat: ATTACK_MOVE_STAT, op: 'override', value: 1, source: 'trait:mobileAttack' }],
  },
  // FLEET — a quick-footed fighter: +25% walk (and so sprint) speed. A TRAIT, not a tier stat: movement speed is the one
  // number a gap in is felt every second, so it stays a per-unit choice (the duelists have it; a possessed one keeps it).
  {
    id: 'trait.fleet',
    name: 'Fleet',
    desc: 'Quick on the feet — walks and sprints 25% faster.',
    modifiers: [{ stat: MOVE_SPEED_STAT, op: 'mulPct', value: 0.25, source: 'trait:fleet' }],
  },
  // SPRINTER — grants the sprint capability. Sprint is opt-IN per unit now (a trait you list), not an automatic
  // tier grant: a street thug plods, a trained fighter sprints — YOUR call per unit, not "everyone ≥ E-".
  {
    id: 'trait.sprinter',
    name: 'Sprinter',
    desc: 'Can sprint — burn stamina for a burst of speed (hold to run).',
    grants: ['ability.sprint'],
  },
  // GREAT SWIMMER — a water expert (the Marine Officer; later fishmen/pirates). Moves near land-pace in deep
  // water, barely tires swimming, and holds their breath far longer. `mulPct` on the base-1 multiplier seeds
  // (MULTIPLIER_STAT_SEEDS) — NOT override — so a future gear/haki water layer STACKS with the trait instead of
  // being wiped by it.
  {
    id: 'trait.swimmer',
    name: 'Great Swimmer',
    desc: 'A water expert — fast in the deep, tireless, and long-breathed (dives + swims where others drown).',
    modifiers: [
      { stat: SWIM_SPEED_STAT, op: 'mulPct', value: 0.7, source: 'trait:swimmer' }, // ×1.7: the base 0.5 water speed ≈ 0.85× land pace
      { stat: SWIM_STAM_STAT, op: 'mulPct', value: -0.6, source: 'trait:swimmer' }, // ×0.4: 40% of the normal swim stamina drain (tireless)
      { stat: SWIM_BREATH_STAT, op: 'mulPct', value: 1.5, source: 'trait:swimmer' }, // ×2.5: breath pool up + drain down ⇒ long dives
    ],
  },
]);
