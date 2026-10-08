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
  [SWIM_SPEED_STAT]: 1,
  [SWIM_STAM_STAT]: 1,
  [SWIM_BREATH_STAT]: 1,
};
