import { modifierProblem, type Modifier } from '../combat/Modifier';
import { Registry, type ContentId, type Def } from '../core/Registry';

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

/**
 * `attackMoveMult` — the fraction of move speed a unit KEEPS while a swing is in flight (combat/attackMove).
 * Unset ⇒ 0 ⇒ ROOTED while attacking (the default: you plant your feet to commit). A trait overrides it toward
 * mobility: a trained fighter shuffles, an expert glides. `override` (not flat/add) so the trait SETS the value
 * outright — a unit has exactly one mobility band, not a sum of them.
 */
export const ATTACK_MOVE_STAT = 'attackMoveMult';

/** SWIM stats a trait can tune (all MULTIPLIERS). Read by MovementSystem (speed) + SwimSystem (stamina drain,
 *  breath capacity + drain). `swimSpeedMul` scales water move speed (deep swim AND shallow wade); `swimStamMul`
 *  scales the surface-swim stamina drain (< 1 = tireless); `swimBreathMul` scales BOTH the breath pool (bigger)
 *  AND its drain (slower) — a great swimmer holds their breath far longer. */
export const SWIM_SPEED_STAT = 'swimSpeedMul';
export const SWIM_STAM_STAT = 'swimStamMul';
export const SWIM_BREATH_STAT = 'swimBreathMul';

/** MULTIPLIER-class stats seed at BASE 1 (the neutral baseline) in every spawned StatBlock — StatBlock reads an
 *  absent stat as 0, which for a multiplier means "frozen/none", the exact trap the old per-read `|| 1` fallbacks
 *  papered over. Seeding 1 lets traits/gear/haki modify them with `mulPct` (composable stacking: a swimmer trait
 *  × a diving-suit item) instead of `override` (which wipes every other layer). `attackMoveMult` is deliberately
 *  NOT here: its neutral value is 0 (rooted while attacking is the default), and traits SET a mobility band. */
export const MULTIPLIER_STAT_SEEDS: Record<string, number> = {
  [SWIM_SPEED_STAT]: 1,
  [SWIM_STAM_STAT]: 1,
  [SWIM_BREATH_STAT]: 1,
};

Traits.registerAll([
  // MOVE-WHILE-ATTACKING — two mobility bands. A unit lists AT MOST ONE (else the last override wins by
  // registration order, which isn't meaningful — keep it to one). No trait at all = rooted (the base case).
  // Both share the SAME modifier source so a unit can't stack them, and a future retrait wipes cleanly.
  {
    id: 'trait.mobileAttackSlow',
    name: 'Footwork',
    desc: 'Can shuffle while attacking (half speed) — a trained fighter keeps their feet moving.',
    modifiers: [{ stat: ATTACK_MOVE_STAT, op: 'override', value: 0.45, source: 'trait:mobileAttack' }],
  },
  {
    id: 'trait.mobileAttackFull',
    name: 'Flow',
    desc: 'Attacks at full stride — an expert never has to plant to swing.',
    modifiers: [{ stat: ATTACK_MOVE_STAT, op: 'override', value: 1, source: 'trait:mobileAttack' }],
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
