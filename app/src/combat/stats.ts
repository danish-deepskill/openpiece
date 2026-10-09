/**
 * NAMED STATS — the string ids the modifier pipe (StatBlock/Modifier) moves and the systems read, in ONE home:
 * a stat is a contract between whoever grants it (a trait row, a timed effect, gear, Haki later) and the ONE
 * system that consumes it. Multiplier stats are seeded at base 1 on every spawned StatBlock (and filled on
 * restore) so an absent stat never reads as "frozen"; additive/chance stats (deflect) read 0 when absent, the
 * documented neutral. Rule: a stat with no consumer is a bug (silently does nothing) — name the reader here.
 */
/**
 * `attackMoveMult` — the fraction of move speed a unit KEEPS while a swing is in flight (combat/attackMove).
 * Unset ⇒ 0 ⇒ ROOTED while attacking (the default: you plant your feet to commit). A trait overrides it toward
 * mobility: a trained fighter shuffles, an expert glides. `override` (not flat/add) so the trait SETS the value
 * outright — a unit has exactly one mobility band, not a sum of them.
 */
export const ATTACK_MOVE_STAT = 'attackMoveMult';

/** PROJECTILE DEFLECT chance (0..1) — rolled by ProjectileSystem the instant a ball would strike this body: on
 *  success the ball turns and flies back at its shooter as the deflector's own shot. Absent/0 ⇒ never (the base
 *  case for everyone). Granted by a timed effect (the Samurai's shukuchi window) or, later, a Haki/trait row —
 *  the stat IS the state, so no tag is needed and sources stack through the normal modifier pipe. */
export const DEFLECT_STAT = 'deflectChance';

/** COMBO RECOVERY multiplier (base 1): scales the lockout a finished chain puts on its ROOT (the post-combo pause —
 *  AbilitySystem's chain rule), and nothing else (each step's own cooldown is untouched). <1 = the chain resets
 *  sooner. Granted by a buff (Kiai halves it) or a future trait; mulPct so sources stack. */
export const COMBO_RECOVERY_STAT = 'comboRecoveryMul';

/** LAND move-speed MULTIPLIER (base 1): the one stat a haste buff, a slow, a race trait or a burden ever touches
 *  to change walk speed. MovementSystem multiplies it into every self-powered move (land AND water, aboard too).
 *  mulPct so layers STACK (a buff on a trait); the tag-driven SLOWED debuff predates it and stays a constant. */
export const MOVE_SPEED_STAT = 'moveSpeedMul';
/** DOMINANCE (base 0): BANDS added to the unit's power tier when the tier-gap ladder judges a hit (combat/dominance).
 *  Granted by a coating (Armament +3 = one letter for the effect's duration), later a Conqueror aura, advanced
 *  haki, or sea-stone on the victim (negative). flat so sources ADD; absent reads 0 (the nameplate tier). */
export const DOMINANCE_STAT = 'dominance';

/** PACE stats (all MULTIPLIERS, base 1) — what a chosen pace trades (combat/Effect: effect.secondWind / measuredBreath):
 *  `stamCostMul` scales what every action costs (combat/stamina.stamCostOf), `stamRegenMul` the refill rate and
 *  `stamRegenDelayMul` the pause after a spend (CombatantSystem / spendStamina), `vigorWearMul` how much of the day each
 *  refilled point costs (CombatantSystem). A push borrows from tomorrow. */
export const STAM_COST_STAT = 'stamCostMul';
export const STAM_REGEN_STAT = 'stamRegenMul';
export const STAM_REGEN_DELAY_STAT = 'stamRegenDelayMul';
export const VIGOR_WEAR_STAT = 'vigorWearMul';
/** How fast the day's reserve comes back (CombatantSystem's vigor recovery) — a push can't rest (×0.5), a measured breath rests better (×1.5). */
export const VIGOR_RECOVER_STAT = 'vigorRecoverMul';
/** How fast WILL trickles back after a spend (CombatantSystem) — a second wind lifts the spirit a little (×1.25); the coating's DRAIN is deliberately not a pace stat (that would make Z the best haki key). */
export const WILL_REGEN_STAT = 'willRegenMul';
/** HARDENING — what fraction of a strike's damage reaches the body (a MULTIPLIER, base 1; Damage.apply reads it before
 *  the flat `def` subtraction). Armament sets ×0.5: the coating protects like armor at EVERY tier, where a percent on the
 *  flat `def` stat (single digits) vanished against 40-damage cuts. TRUE damage (drowning) ignores it like it ignores def. */
export const DAMAGE_TAKEN_STAT = 'damageTakenMul';
/** THE BLOW's multipliers (base 1) — what a pump does to the strike itself, not just its number: `knockbackMul` scales the
 *  shove (and a ragdoll's fling) every hit of this body lands (StrikeResolver, after the rung); `shotScaleMul` scales a
 *  loosed projectile's SIZE — drawn and hit radius together (stamped on the shot at fire, like the theme) — a pumped
 *  swordsman's flying slashes come out larger. Ni Gorilla sets both; a giant's race or an advanced coating could too. */
export const KNOCKBACK_STAT = 'knockbackMul';
export const SHOT_SCALE_STAT = 'shotScaleMul';
/** …and how FAR a loosed projectile flies (its authored range × this, read at fire) — a slight stretch for a pump; speed
 *  stays authored per move (it is what makes a shot dodgeable). */
export const SHOT_RANGE_STAT = 'shotRangeMul';
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
  [MOVE_SPEED_STAT]: 1,
  [COMBO_RECOVERY_STAT]: 1,
  [STAM_COST_STAT]: 1,
  [STAM_REGEN_STAT]: 1,
  [STAM_REGEN_DELAY_STAT]: 1,
  [VIGOR_WEAR_STAT]: 1,
  [VIGOR_RECOVER_STAT]: 1,
  [WILL_REGEN_STAT]: 1,
  [DAMAGE_TAKEN_STAT]: 1,
  [KNOCKBACK_STAT]: 1,
  [SHOT_SCALE_STAT]: 1,
  [SHOT_RANGE_STAT]: 1,
  [SWIM_SPEED_STAT]: 1,
  [SWIM_STAM_STAT]: 1,
  [SWIM_BREATH_STAT]: 1,
};
