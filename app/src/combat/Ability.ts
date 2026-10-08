import { Registry, type ContentId, type Def } from '../core/Registry';
import { SWING_SPEED_FLOOR } from '../config/constants';
import { tierStats } from './PowerTier';
import { flurryWindows, type HitVolume } from './hitVolume';
import type { StatId } from './Modifier';
import type { AttackPhases } from './phases';

export interface AbilityShape {
  range: number;
  arc: number; // half-angle of the hit cone (radians) — used by 'arc' pattern
  single?: boolean; // hits only the nearest target in the cone/line
  /** Attack DELIVERY: 'melee' = a moving hitbox resolved on contact (MeleeSystem); 'pistol' = an INSTANT
   *  hitscan cone (a rubber arm genuinely IS instant-reach — Gomu); 'shot' = a TRAVELLING projectile
   *  (ProjectileSystem — a musket ball you can dodge/lead, and that a wall stops). See docs DESIGN_BACKLOG #19. */
  swing: 'melee' | 'pistol' | 'shot';
  /** 'shot' only: projectile SPEED (px/s). With `range`, sets the ball's lifespan (life = range / speed) —
   *  a fast flat musket ball vs a lazy lob. Required for a 'shot' shape (boot-validated). */
  shotSpeed?: number;
  /** 'shot' only: how far AHEAD of the shooter's center (px) the ball is born, so it clears the body it's
   *  fired from (muzzle placement). Default = the shooter's own radius. */
  muzzle?: number;
  /** 'shot' only: BUCKSHOT — number of balls fired per trigger pull. >1 fans a CONE of pellets (each its own
   *  scatter + electric roll); the recoil pose + pushback fire ONCE. Default 1 (a single musket ball). */
  pellets?: number;
  /** 'shot' only: per-pellet fan HALF-angle (rad) for a `pellets`>1 spread — the buckshot cone's half-width.
   *  Independent of the shooter's aim spread (a scatter blast is wide even when aimed). Default 0 (dead-on). */
  shotSpreadArc?: number;
  /** 'shot' only: art file for the flying projectile (src/art-relative, e.g. 'weapon/bullet_1.png') — a
   *  musket ball vs a cannonball differ by this ROW (content-is-data). Loaded at boot; drawn by
   *  ProjectileRenderer. Unset ⇒ a small procedural dot (no art needed for a basic shot). */
  shotArt?: string;
  /** 'shot' only: GENERATED (procedural) projectile look, drawn by ProjectileRenderer from code — NO PNG. 'ball'
   *  = a round lead shot (with an electric crackle variant when the round procs). Mutually exclusive with
   *  `shotArt` (art wins if both set). A proc ball keeps art out of the repo for simple shapes + lets a variant
   *  (electric) recolor without a second file. */
  shotProc?: 'ball' | 'slash'; // 'slash' = a flying crescent (a wind cut)
  /** 'shot' only: on-screen size of the drawn projectile (px diameter). Default 6. Visual only — the hit
   *  radius is the ball's own tiny transform.r; a big cannonball art can still be a small point-hit, or set
   *  the projectile's r via a future field. */
  shotSize?: number;
  /** 'shot' only: PASS-THROUGH at close range — a long musket jammed in someone's face often can't get a clean
   *  shot off (the barrel can't bear, a rushing body spoils it), so a point-blank shot has a chance to phase
   *  THROUGH with no hit (the reload's still spent — punishable). This is the peak pass-through probability
   *  (0..1) at contact; it fades STEEPLY to 0 by `closePassRange` (only really point-blank risks it). Measured
   *  at FIRE time (a shot fired up close is a bad shot, wherever it lands). NOT deflection — that's a future
   *  parry-vs-projectile mechanic. Unset/0 ⇒ no close penalty. */
  closePassChance?: number;
  /** 'shot' only: the distance (px) at which `closePassChance` has faded to 0 — beyond this the shot is
   *  reliable. ~1–2 tiles for a musket. Required if closePassChance is set (boot-validated). */
  closePassRange?: number;
  /** 'shot' only: CHARGED-ROUND proc — `chance` (0..1) per PELLET at fire time that the ball carries `effect`
   *  (an EffectDef id — shocked/burning/… applied to whoever it hits, for `dur` seconds) and hits ×`damageMult`.
   *  The generic elemental-round seam (backlog #16: rounds carry effects, the matrix routes them — never a
   *  per-element field triple): an electric round is procEffect→effect.shocked; a future fire round is one new
   *  effect row, zero new fields. The renderer themes the charged ball by the effect's status color. */
  procEffect?: { chance: number; effect: ContentId; dur: number; damageMult?: number };
  /** Hit shape: 'arc' = swing (sweep); 'line' = stab (thrust); 'mixed' = random; 'stretch' = Gomu rubber arm;
   *  'gore' = headbutt capsule; 'axe' = overhead axe-kick (the limb rises/scales UP, then slams an AoE straight down);
   *  'flurry' = `jabs` rapid ALTERNATING blade sweeps through the active phase (a thousand-cuts channel). */
  pattern?: 'arc' | 'line' | 'mixed' | 'stretch' | 'gore' | 'axe' | 'flurry';
  width?: number; // 'line' corridor half-width (px)
  /** Melee swing duration (s) at attack speed 1: the window the animated fist/blade is a live hitbox. Default 0.18.
   *  The REAL duration is swingTime / atkSpeed, floored so a readable tell never drops under TELL_FLOOR
   *  (combat/phases.swingDuration) — a faster unit swings faster, not just recovers faster. */
  swingTime?: number;
  /** CHARGE-HOLD (arc swings): snap the blade to its cocked-back load EARLY in the windup, then HOLD it there
   *  until the cut — a Sekiro-style "charging up" tell that reads unmistakably (vs a linear load that drifts).
   *  For big committed swings (the sword finisher). Default off (a linear load). */
  chargeHold?: boolean;
  jabs?: number; // a SYNTHESIZED flurry's cut count ('stretch' Gomu Gatling): N once-per-target windows + alternating hands. A 'flurry' with authored hitVolumes derives its count from them instead (swing.flurryCuts)
  /** 'stretch' style: 'punch' cocks back then snaps out; 'grab' reaches forward then retracts (Gomu Rocket). */
  stretchMode?: 'punch' | 'grab';
  /** Which limb strikes — purely visual (a fist/hand vs a kicking foot/boot); the motion + hitbox are the same. */
  limb?: 'hand' | 'foot';
  /** Multiplies the body's natural reach for this strike — a short jab (< 1), a long kick (> 1). Default 1. */
  reachMul?: number;
  /** SWING FX theme — an extra visual played as the swing goes ACTIVE, to read the move as elemental. 'electric'
   *  = a cyan crackle burst at the striking limb (the Shock Kick). Unset ⇒ a plain swing. Presentation-only. */
  swingFx?: 'electric';
  /** Render BOTH limbs for a stretch (Gomu Rocket's two-armed grab) instead of one. */
  bothHands?: boolean;
  /** FLIP the drawn weapon sprite end-for-end for this swing — the pommel/butt leads instead of the tip (a
   *  musket's butt-stroke: you jab with the STOCK). A pure sprite mirror (same position + rotation), NOT a
   *  reposition. Visual only; the hitbox is the swing motion. */
  reverseGrip?: boolean;
  /** Mirror an ARMED swing to the off side (side −1) — combo steps alternate cut direction with it. */
  mirror?: boolean;
  /** Visual-only swing: MeleeSystem animates it but lands NO contact hit (damage comes from elsewhere). */
  noHit?: boolean;
  /** This swing's damaging volumes (combat/hitVolume) — REPLACES the weapon's default wholesale (arrays
   *  replace, never merge). `[]` = visual-only. Unset ⇒ the weapon's hitVolumes ⇒ the whole drawn weapon. */
  hitVolumes?: HitVolume[];
  /** This attack's windup/active/recover split (combat/phases). Unset ⇒ the weight ladder (the equipped
   *  weapon's class for its own kit, else unarmed). Fruit abilities ALWAYS author theirs — a fruit power's
   *  telegraph is its identity, not a function of what's sheathed on your hip. */
  phases?: AttackPhases;
  /** Launch ability: deal an AoE in this radius (px) where the body LANDS, instead of on contact. */
  landRadius?: number;
}

/**
 * A data-driven action. Any of the four combat layers can grant abilities (a weapon's strike, a fruit's
 * pistol, a style's dash). The AbilitySystem resolves them generically: pay cost, set cooldown, deal a
 * shaped hit (damage scaled off an attribute), apply a self-impulse, and/or apply a self-effect.
 */
/** How an ability is INVOKED (input shape) — data, not a category. 'tap' fires once (punch, parry); 'hold'
 *  stays active while held then ends on release (block, sprint); 'combo' chains on repeat presses. Most
 *  abilities are the default 'tap'; guard uses this to distinguish block (hold) from parry (tap). */
export type AbilityTrigger = 'tap' | 'hold' | 'combo';

/** AI ROLE tags (AbilityDef.tags) — the brain scans the loadout for these (one home for the strings):
 *  pointBlank = the ranged close-range answer (a scatter blast); disengage = the space-maker (a shove-off kick). */


export const AI_ROLE_POINT_BLANK = 'ai.role.pointBlank';
export const AI_ROLE_DISENGAGE = 'ai.role.disengage';

export interface AbilityDef extends Def {
  name: string;
  cooldown: number; // BASE recovery; effective = cooldown / atkSpeed (a tier stat)
  /** Input shape (see AbilityTrigger). Default 'tap'. Guard reads it (block=hold, parry=tap). */
  trigger?: AbilityTrigger;
  costStam?: number; // stamina drained on use AND the gate — you can't use what you can't pay for (clamped to 0)
  /** SUSTAINED drain (stamina/sec) for a continuous 'hold' ability that isn't a discrete cast — sprint burns
   *  this every frame it's active (movement modifier, resolved outside activate()). Distinct from costStam
   *  (a one-shot spend). Read by combat/stamina.trySprint. */
  costStamPerSec?: number;
  /** Movement speed multiplier a sustained movement ability applies while active (sprint = 1.5×). */
  moveMult?: number;
  shape?: AbilityShape; // offensive abilities
  /** RECOIL — a backward self-shove (px/s) on the ATTACKER, applied opposite facing, mass-scaled (a heavy body
   *  barely moves). On a 'shot' it's the fire kick (a musket shoves the firer back a step); on a MELEE move it's
   *  a shove-off (the electric kick that hops the kicker back to make space — the tactical-retreat verb). Does NOT
   *  cancel the swing (unlike selfImpulse). Data so it's per-ability; unset/0 ⇒ none. Distinct from `knockback`
   *  (what the attack does to a TARGET). */
  recoilPush?: number;
  /** IMPACT-SPARK color (hex) — tints the hit burst StrikeResolver emits on a landed blow (an ELECTRIC kick pops
   *  cyan, a fire move orange). Unset ⇒ the default spark. Presentation-only (a hit still resolves identically). */
  hitFx?: number;
  damageStat?: StatId; // base damage read from the user's attributes (e.g. 'atk')
  damageFlat?: number;
  /** Scales the base damage (stat + flat) of EVERY hit this ability lands — a multi-hit move's per-cut share
   *  (8 cuts × 0.3 ≈ 2.4 full hits), the mirror of procEffect.damageMult for rounds. Default 1; boot-validated > 0. */
  damageMul?: number;
  /** VOLLEYS: shot abilities this swing LOOSES mid-flight — each fires ONCE when the swing's progress crosses `at`
   *  (a fraction of the swing, ascending), FORWARD along the swing's aim, scattered by up to ±`spread` rad (seeded
   *  combat stream) so a volley fans a little instead of stacking on one line. Each `ability` is a 'shot' row of
   *  its own (its damage/speed/look live there; it needs no grant). The generic seam for any channel that throws
   *  things while swinging — a wind flurry, a Rankyaku kick storm. Boot-validated. */
  volleys?: { at: number; ability: ContentId; spread?: number }[];
  /** A CHANNEL — two consequences of one concept: (1) it ignores the wielder's attack-mobility trait (combat/
   *  attackMove) — feet planted for the whole thing, so walking out of it is a counterplay; (2) it stays
   *  INTERRUPTIBLE through its whole swing (StrikeResolver's weight roll, not windup-only — a long commitment bought
   *  with a short tell must be breakable). Default false: an ordinary swing moves per the trait and trades once active. */
  channel?: boolean;
  knockback?: number;
  /** WALL-SLAM proc (the marine Buttstroke): `chance` (0..1) that this hit's knockback is replaced by a LONG one
   *  (`knockback` px/s). Two outcomes, both electric (statuses = EFFECT rows, backlog #16): SLAMMING a wall
   *  applies effect.electrified for `stun` seconds (a FROZEN pin + a themed pop); flying FREE applies
   *  effect.shocked for `slow` seconds (the lighter lingering current) — the shove always does something.
   *  Rolled on the seeded `combat` stream. Unset ⇒ a normal hit, no slam. */
  wallSlam?: { chance: number; knockback: number; stun: number; slow: number };
  stun?: number; // hitstun (s) inflicted on a target this attack lands on — heavier moves stagger longer
  /** Posture damage a BLOCKED hit of this ability deals — overrides the weight-table default (guard.WEIGHT_POSTURE
   *  keyed by weapon class). For a weapon-less ability (a fruit power like Gomu) the weight lookup falls to
   *  'unarmed' (a fist's 4), which under-rates a big committed blow; set this to give the ability its own posture
   *  pressure. Unset ⇒ the weight-table default (the weapon-class rule stays the norm; this is the exception). */
  posture?: number;
  /** Knockback (px/s impulse) shoved onto a defender who BLOCKS/PARRIES this hit — a heavy blow jolts the guard
   *  back. Per-weapon so a greatsword shoves harder than a katana. Unset ⇒ a fraction (GUARD_KNOCKBACK_MULT) of
   *  the attack's own `knockback` for HEAVY-class weapons, and nothing for light/medium (bracing holds firm).
   *  Applied at FULL on a BLOCK, and at a reduced fraction on a PARRY (a clean deflection barely moves you). */
  guardKnockback?: number;
  shake?: number; // screen-shake magnitude on a landed hit. OFF by default — reserve it for POWERFUL abilities.
  selfImpulse?: number; // dash speed (movement abilities)
  impulseDur?: number; // how long (s) the self-impulse carries — default 0.16 (a short hop); Rocket leaps longer
  /** Play the ROLL animation (ball-up + 360° spin, drawActor) for the impulse's duration. A ground roll opts in;
   *  a flash-step / dash leaves it off (it blinks, it doesn't tumble). Presentation-only signal, sim-set. */
  roll?: boolean;
  /** JUMP: enter the AIR layer for this many seconds (docs/design/MOVEMENT_AIR.md). AbilitySystem sets the
   *  mover to layer:'air' + airT; MovementSystem lands it. Geppo later = the same field + airKicks (re-launch
   *  mid-air). Combines freely with selfImpulse (a jump that also carries forward). */
  jump?: number;
  /** GEPPO (docs/design/MOVEMENT_AIR.md): a TOGGLE-hover — activating flips the mover's `hovering` on/off. While
   *  on, MovementSystem keeps the actor airborne (kicking off the air), spends `costStam` per KICK (each bob),
   *  and auto-lands when the next kick is unaffordable. Distinct from `jump` (a one-shot hop). */
  geppo?: boolean;
  /** ANTI-AIR (docs/design/MOVEMENT_AIR.md): chance (0..1) this attack CATCHES a jumper — the exception to the
   *  100%-jump-dodge. `1` = a hard anti-air (always catches a launcher/upward slash); `0.5` = a gamble; unset/0 =
   *  a normal ground attack (fully dodged by a jump). The counterplay to jump-spam — and the ONE place a jump-vs-
   *  attack outcome can be random, on the specific counter-move, not baseline melee. */
  airCatch?: number;
  launchAt?: number; // with a stretch shape: fire `selfImpulse` at this fraction of the swing (grab → THEN rocket)
  grantEffect?: ContentId; // self-effect on use (e.g. i-frames)
  requireTags?: string[];
  blockTags?: string[];
  /** Tags describing THIS ability — the classification seam backlog #16 plans for elements/delivery
   *  (element.lightning, delivery.blunt…) and the AI reads for tactical ROLES today: 'ai.role.pointBlank'
   *  (the ranged close-range answer — the marine's Buckshot) and 'ai.role.disengage' (the space-maker — the
   *  Shock Kick). The brain scans the LOADOUT for these (like leapSpecial scans by property), so a weapon's
   *  slot ORDER can never silently change AI behavior — the role is on the ability, not the array position. */
  tags?: string[];
  /** COMBO CHAIN: pressing the same slot again within `comboWindow` fires THIS ability next instead of
   *  restarting (interruptible — distinct from a multi-window swing, which is one committed animation).
   *  Player-timed per press; note HOLDING the button also walks the chain at swing-end cadence (the attack
   *  input is level-sampled by design — hold-to-attack). The final step (no comboNext) also locks the
   *  chain's ROOT for its own cooldown — the post-combo recovery. AbilitySystem owns the state (Loadout.chain). */
  comboNext?: ContentId;
  /** Seconds after this step fires during which the next press chains (default 0.9). Must outlast the
   *  step's swingTime or the chain is unreachable. */
  comboWindow?: number;
}

// validated at boot: a typo'd negative cooldown/cost/range fails loud on load, not as a weird mid-game bug
export const Abilities = new Registry<AbilityDef>('Abilities', (a) => {
  if (a.cooldown < 0) return 'cooldown must be ≥ 0';
  if ((a.costStam ?? 0) < 0) return 'costStam must be ≥ 0';
  if (a.damageMul !== undefined && !(a.damageMul > 0)) return `damageMul must be > 0 (got ${a.damageMul})`;
  if (a.volleys && !a.shape) return 'volleys need a shape (they are loosed from a swing in flight)';
  if (a.shape?.swing === 'shot' && !(a.shape.range > 0)) return `a 'shot' ability needs range > 0 (its life is range / shotSpeed; got ${a.shape.range})`;
  if (a.shape?.shotProc === 'slash' && a.shape.procEffect) return "shotProc 'slash' has no charged (proc) texture yet — use 'ball' or drop procEffect";
  if (a.shape?.pattern === 'flurry' && a.shape.hitVolumes && a.shape.phases) {
    // the authored windows ARE the cuts (swing.flurryCuts): they must tile the active phase back to back, or the
    // whipping blade and the live hitbox drift apart (and a stray `jabs` must not disagree with them)
    const vols = a.shape.hitVolumes;
    const w = a.shape.phases.windup;
    const end = w + a.shape.phases.active;
    if (a.shape.jabs !== undefined && a.shape.jabs !== vols.length) return `a flurry's jabs (${a.shape.jabs}) must equal its authored windows (${vols.length}) — or drop jabs`;
    for (let i = 0; i < vols.length; i++) {
      const v = vols[i]!; // index-bounded loop
      if (!v.active) return `flurry window #${i} needs an active span`;
      const want0 = i === 0 ? w : vols[i - 1]!.active![1];
      if (Math.abs(v.active[0] - want0) > 1e-6) return `flurry window #${i} starts at ${v.active[0]}, expected ${want0.toFixed(4)} (windows must tile the active phase)`;
    }
    const last = vols[vols.length - 1]!.active![1];
    if (Math.abs(last - end) > 1e-6) return `flurry windows end at ${last}, expected the active phase's end ${end.toFixed(4)}`;
  }
  if (a.volleys) {
    let prev = -1;
    for (const v of a.volleys) {
      if (!(v.at >= 0 && v.at <= 1)) return `volley.at must be in [0, 1] (got ${v.at})`;
      if (v.at < prev) return 'volleys must be in ascending `at` order';
      if (v.spread !== undefined && !(v.spread >= 0)) return `volley.spread must be ≥ 0 (got ${v.spread})`;
      prev = v.at;
    }
  }
  if (a.shape && a.shape.range < 0) return 'shape.range must be ≥ 0';
  if (a.shape?.swing === 'shot' && !((a.shape.shotSpeed ?? 0) > 0)) return `a 'shot' ability needs shotSpeed > 0 (got ${a.shape.shotSpeed})`;
  // an authored 0 makes the swing clock divide by zero (t/dur → NaN: the ball never fires, the swing never ends);
  // OMITTING it is fine (engine default) — only the explicit-zero/negative typo crashes here
  if (a.shape?.swingTime !== undefined && !(a.shape.swingTime > 0)) return `swingTime must be > 0 when authored (got ${a.shape.swingTime})`;
  const cpc = a.shape?.closePassChance;
  if (cpc !== undefined) {
    if (cpc < 0 || cpc > 1) return `closePassChance must be in [0, 1] (got ${cpc})`;
    if (!((a.shape?.closePassRange ?? 0) > 0)) return `closePassChance needs closePassRange > 0 (got ${a.shape?.closePassRange})`;
  }
  const proc = a.shape?.procEffect;
  if (proc) {
    if (proc.chance < 0 || proc.chance > 1) return `procEffect.chance must be in [0, 1] (got ${proc.chance})`;
    if (!(proc.dur > 0)) return `procEffect.dur must be > 0 (got ${proc.dur})`;
    if (proc.damageMult !== undefined && !(proc.damageMult > 0)) return `procEffect.damageMult must be > 0 (got ${proc.damageMult})`;
  }
  if (a.wallSlam) {
    if (a.wallSlam.chance < 0 || a.wallSlam.chance > 1) return `wallSlam.chance must be in [0, 1] (got ${a.wallSlam.chance})`;
    if (!(a.wallSlam.knockback > 0)) return `wallSlam.knockback must be > 0 (got ${a.wallSlam.knockback})`;
    if (a.wallSlam.stun < 0) return `wallSlam.stun must be ≥ 0 (got ${a.wallSlam.stun})`;
    if (a.wallSlam.slow < 0) return `wallSlam.slow must be ≥ 0 (got ${a.wallSlam.slow})`;
    // the slam flags disarm INSIDE the knockback-impulse window (MovementSystem) — a wallSlam row with no base
    // knockback never launches that impulse, leaving the flags armed forever (they'd fire on the victim's next
    // unrelated dodge). Content error → crash at boot, never a haunted flag mid-game.
    if (!((a.knockback ?? 0) > 0)) return `a wallSlam ability needs a base knockback > 0 (the proc rescales it; got ${a.knockback})`;
  }
  if (a.shape?.pellets !== undefined && (!Number.isInteger(a.shape.pellets) || a.shape.pellets < 1)) return `pellets must be an integer ≥ 1 (got ${a.shape.pellets})`;
  if (a.shape?.shotSpreadArc !== undefined && a.shape.shotSpreadArc < 0) return `shotSpreadArc must be ≥ 0 (got ${a.shape.shotSpreadArc})`;
  if (a.airCatch !== undefined && (a.airCatch < 0 || a.airCatch > 1)) return `airCatch must be in [0, 1] (got ${a.airCatch})`;
  const ph = a.shape?.phases;
  if (ph) {
    if (ph.windup < 0 || ph.recover < 0 || !(ph.active > 0)) return 'phases: windup/recover ≥ 0 and active > 0 (an attack with no active phase can never hit)';
    const sum = ph.windup + ph.active + ph.recover;
    if (Math.abs(sum - 1) > 0.01) return `phases must sum to 1 (got ${sum})`;
  }
  if (a.comboNext) {
    const win = a.comboWindow ?? 0.9;
    if (!(win > 0)) return `comboWindow must be > 0 (got ${win})`;
    // the window starts at ACTIVATION and a new swing is refused while one is in flight — a window shorter
    // than the swing makes the next step unreachable (the JSDoc's warning, promoted to a boot crash)
    // the chain must be reachable at the SLOWEST swing the knobs allow: swingTime is divided by at least
    // SWING_SPEED_FLOOR, so with the floor at 1 the authored time is the bound; set the floor to 0 (the symmetric
    // model) and an F- unit's swing stretches by 1/0.45 — this check follows the knob so it can't silently lie
    const slowest = (a.shape?.swingTime ?? 0) / Math.max(SWING_SPEED_FLOOR, tierStats('F-').atkSpeed);
    if (a.shape?.swingTime !== undefined && win <= slowest) return `comboWindow (${win}) must outlast the slowest possible swing (${slowest.toFixed(2)}s) or the chain is unreachable`;
  }
  return null;
});

// NOTE: `cooldown` is the BASE recovery; effective recovery = cooldown / atkSpeed (a tier stat), so attack
// speed is tier-driven, not a hardcoded player advantage. Stamina gates EVERY costed ability by AFFORDABILITY:
// you can't use what you can't pay for — even the bare fist. Same kit, same rules for every actor.
// SWING TIMES are tuned in ABSOLUTE reaction terms (windup fraction × swingTime vs human ~0.25s): the
// unarmed/light tier stays deliberately UNREACTABLE (rhythm-parry only, the twitchy inside game); medium is
// borderline; heavy/fruit telegraphs run ~0.23–0.33s of windup — the reaction-parry targets. Lengthening a
// swingTime slows the WHOLE attack, so cooldowns rise with it where the old rhythm assumed cd ≥ swing.
// ── KAMAITACHI's choreography (the row is below; this is its one tuning surface) ────────────────────────
/** The channel's clock: windup = the tell, active = the cutting span the PLAN is laid over, recover = the settle. */
const KAMAITACHI_PHASES = { windup: 0.07, active: 0.87, recover: 0.06 } as const; // ×6s: 0.42s tell · 5.22s of cuts · 0.36s settle
/** One char per window of the channel, in order: 'c' = a blade cut, 'L' = a LARGE sweep (an arc reaching past the
 *  blade, with its own wave), 'S' = a cut that also LOOSES a wind-slash projectile. The finisher (the big wind)
 *  is appended as the last window. Edit the string to re-choreograph; the windows, waves and volleys follow. */
const KAMAITACHI_PLAN = 'ccLccS'.repeat(5);
/** The windows + volley cues, laid over the active phase (ONE source with the row's phases — they can't drift). */
const KAMAITACHI_WINDOWS = flurryWindows(KAMAITACHI_PLAN, KAMAITACHI_PHASES.windup, KAMAITACHI_PHASES.windup + KAMAITACHI_PHASES.active, {
  large: { kind: 'arc', radius: 96, halfAngle: 0.9, thickness: 72, follow: 'swing', damageMul: 2 }, // an arc band runs radius−thickness → radius: 24–96px, 3 tiles; DOUBLE a cut's damage
  finisher: { kind: 'arc', radius: 120, halfAngle: 1.1, thickness: 96, follow: 'swing' }, // 24–120px: the big wind
  shot: 'ability.kamaitachiSlash',
  shotSpread: 0.35, // ±20°: forward, but no two slashes on the same line
});

Abilities.registerAll([
  // base kit (unarmed): a committed fist jab — the fist itself is the hitbox on contact. Windup ~200ms — the
  // FLOOR of the ladder (the fastest readable tell; nothing winds up quicker). Fists sit at the minimum because
  // they're fast/weak/short; heavier weapons scale UP from here. Still parryable (the Deepwoken model).
  { id: 'ability.punch', name: 'Punch', cooldown: 0.5, shape: { range: 0, arc: 0.22, swing: 'melee', pattern: 'line', swingTime: 0.5, reachMul: 0.85, phases: { windup: 0.4, active: 0.3, recover: 0.3 } }, damageStat: 'atk', knockback: 165, costStam: 3, stun: 0.24 },
  // ROLL — a committed evasive tumble: longer travel + duration than the old quick hop, and NO i-frames — the
  // roll dodges by REPOSITIONING (you roll out of the blade's path), not by damage immunity. `roll: true` opts
  // into the ball-up+spin animation (drawActor, driven off mover.rollT). This is the BASE mobility move that
  // fills the loadout `dash` slot; future mobility abilities (flashDash, geppo, soru, air-dash…) are sibling
  // rows that fill the SAME slot — each with its own stats + animation, none of them the generic slot itself.
  { id: 'ability.roll', name: 'Roll', cooldown: 2, costStam: 6, selfImpulse: 360, impulseDur: 0.38, roll: true },
  // JUMP — the base-kit air verb (SPACE): a hop into the AIR layer (docs/design/MOVEMENT_AIR.md). While aloft,
  // collision clears foot-blocked terrain (jump over water/low walls) AND it FULLY dodges ground attacks
  // (StrikeResolver) — except anti-air moves (AbilityDef.airCatch). Because it's an EVASIVE tool now, it's COSTLY
  // (20 stam / 1s cd) so it can't be spammed, and PUNISHABLE on landing (a recovery stun — MovementSystem).
  { id: 'ability.jump', name: 'Jump', cooldown: 1, costStam: 20, jump: 0.55 },
  // GEPPO — the Rokushiki "Moon Walk" (LEARNED from manual.geppo). A TOGGLE-hover on SPACE (replaces jump once
  // learned): tap on → stay airborne, kicking off the air (the jump bob loops + cloud puffs); tap off → land.
  // `costStam` is the per-KICK cost (each bob) — MovementSystem auto-lands when a kick is unaffordable, so hover
  // is stamina-bounded (no infinite flight). Airborne → keeps the 100% ground-dodge + terrain/unit pass-over.
  { id: 'ability.geppo', name: 'Geppo', cooldown: 0, costStam: 0, geppo: true }, // cooldown 0: a TOGGLE must re-activate freely (off must not be blocked by on's cd); space is edge-tapped so no double-fire
  // SPRINT — a sustained movement capability (hold SHIFT / AI charge), NOT a discrete cast: no shape, no
  // cooldown. It's a granted ability so "can this unit sprint" = "is it in its loadout" (the Moat), the same
  // question as any capability; the per-second drain + speed boost are applied by combat/stamina.trySprint.
  { id: 'ability.sprint', name: 'Sprint', trigger: 'hold', cooldown: 0, costStamPerSec: 24, moveMult: 1.5 },
  // GUARD abilities — a unit CAN block/parry iff these are in its loadout (the capability, granted like any
  // ability: base kit for fighters, or a weapon/style could grant a better one). They aren't activated through
  // AbilitySystem — the guard engine (combat/guard) drives them, gated by the grant. `trigger` records the
  // input shape (hold vs tap) per the COMBAT.md decision; consumed by the guard wiring, not a generic dispatch yet.
  { id: 'ability.block', name: 'Block', cooldown: 0, trigger: 'hold' },
  { id: 'ability.parry', name: 'Parry', cooldown: 0, trigger: 'tap' },
  // base kit HEAVY: a committed kick — slower + harder than the jab. The foot only appears for this swing (right-click).
  // the base-kit heavy KICK — a committed leg strike. Windup ~200ms (the light/unarmed FLOOR, with the punch) —
  // a readable foot-draw-back tell, reaction-parryable. Unarmed sits at the floor; weapons scale up from here.
  { id: 'ability.kick', name: 'Kick', cooldown: 0.9, shape: { range: 0, arc: 0.3, swing: 'melee', pattern: 'line', swingTime: 0.55, limb: 'foot', reachMul: 1.1, phases: { windup: 0.36, active: 0.3, recover: 0.34 } }, damageStat: 'atk', damageFlat: 6, knockback: 320, costStam: 7, stun: 0.9 },
  // Haki — Armament: a timed coating that counters Devil Fruits (bypasses Logia intangibility) + boosts damage
  { id: 'ability.armament', name: 'Armament', cooldown: 8, grantEffect: 'effect.armament' },
  // weapon (cutlass) — the basic, deliberate sword move: a real swing/stab whose blade must connect (windup ~143ms)
  // authored phases so the cutlass tell clears reaction time (~200ms) — a real ENEMY attack (the Brute), and
  // every hostile attack must be parryable. 0.4 × 0.55s = 0.22s cock-back; the default medium rung (0.26)
  // gave only 143ms, unreactable. Active/recover stay quick so the swing itself still lands snappily.
  { id: 'ability.cut', name: 'Cut', cooldown: 1.4, shape: { range: 18, arc: 0.5, swing: 'melee', pattern: 'mixed', width: 12, swingTime: 0.6, phases: { windup: 0.5, active: 0.25, recover: 0.25 } }, damageStat: 'atk', damageFlat: 2, knockback: 170, costStam: 6, stun: 0.44 }, // MEDIUM: windup 0.5×0.6=0.30s — clearly slower than the ~0.2s light floor. range 18 → abilityRange ~28, sits at the drawn cutlass tip so reach matches the sprite
  // RESERVED for a late-game / high-tier weapon: fast + powerful. Not granted by the starter cutlass.
  { id: 'ability.slash', name: 'Slash', cooldown: 0.5, shape: { range: 30, arc: 0.5, swing: 'melee', pattern: 'mixed', width: 12, swingTime: 0.35 }, damageStat: 'atk', damageFlat: 6, knockback: 210, costStam: 3.5, stun: 0.4 },
  // the DAGGER's 2-hit chain: a quick SLICE (swing) that flows into a finishing STAB. The dagger's primary is the
  // slice (chain ROOT); the stab is the payoff — it hits a touch harder + staggers longer, and its cooldown
  // locks the root afterward (the post-combo recovery, same rule as the sword finisher). Both steps are FIXED
  // motions (no 'mixed' alternation) so the combo reads as deterministic choreography. Scaled DOWN from the
  // sword: 2 steps not 3, no slash-wave, low numbers — a light weapon's flurry, not a heavy's committed combo.
  // authored phases so the dagger's tell clears reaction time (~200ms) — a real ENEMY attack (the Bandit) must parry.
  // hitVolume `from: 0.45` = the hitbox is only the BLADE half (the outer part of the drawn dagger), NOT the
  // grip/hand — so the damage zone matches the visible steel, not a circle at the empty hand (what you see hits).
  { id: 'ability.daggerSlice', name: 'Slice', cooldown: 0.4, shape: { range: 22, arc: 0.42, swing: 'melee', pattern: 'arc', width: 10, swingTime: 0.5, phases: { windup: 0.4, active: 0.3, recover: 0.3 }, hitVolumes: [{ kind: 'weaponSegment', from: 0.45 }] }, damageStat: 'atk', damageFlat: 1, knockback: 130, costStam: 4, stun: 0.28, comboNext: 'ability.stab' }, // windup 0.4×0.5=0.20s: the LIGHT floor
  { id: 'ability.stab', name: 'Stab', cooldown: 1.1, shape: { range: 22, arc: 0.34, swing: 'melee', pattern: 'line', width: 8, swingTime: 0.45, phases: { windup: 0.44, active: 0.26, recover: 0.3 }, hitVolumes: [{ kind: 'weaponSegment', from: 0.45 }] }, damageStat: 'atk', damageFlat: 2, knockback: 150, costStam: 6, stun: 0.34 }, // windup 0.44×0.45≈0.20s: the light floor; blade-only hitbox
  // the SWORD's 3-hit chain: two committed heavy cuts (~228ms windups — REACTION-parryable, the price of the
  // reach + damage), then a finisher whose slash-wave (a 'swing'-following arc volume) reaches past the
  // steel — after it, the chain ROOT locks for the finisher's cooldown (the post-combo recovery).
  { id: 'ability.swordSlash1', name: 'Slash', cooldown: 0.85, shape: { range: 0, arc: 0.55, swing: 'melee', pattern: 'arc', swingTime: 0.8 }, damageStat: 'atk', damageFlat: 3, knockback: 180, costStam: 5, stun: 0.4, comboNext: 'ability.swordSlash2' }, // HEAVY: no authored phases → the heavy rung (windup 0.5×0.8=0.40s, a big punishable rear-back)
  { id: 'ability.swordSlash2', name: 'Backslash', cooldown: 0.85, shape: { range: 0, arc: 0.55, swing: 'melee', pattern: 'arc', swingTime: 0.8, mirror: true }, damageStat: 'atk', damageFlat: 4, knockback: 200, costStam: 5, stun: 0.44, comboNext: 'ability.swordFinisher' },
  // the wave's window sits INSIDE the heavy rung's active phase [0.38, 0.72] — a telegraph must never
  // deal damage (the canon review caught the old [0.15, 0.7], authored against the deleted pre-phase timeline)
  { id: 'ability.swordFinisher', name: 'Cross Cut', cooldown: 2.4, shape: { range: 0, arc: 0.7, swing: 'melee', pattern: 'arc', swingTime: 0.85, chargeHold: true, hitVolumes: [{ kind: 'weaponSegment', from: 0.3 }, { kind: 'arc', radius: 52, halfAngle: 0.9, thickness: 26, follow: 'swing', active: [0.38, 0.72] }] }, damageStat: 'atk', damageFlat: 8, knockback: 320, costStam: 8, stun: 1.0, shake: 4 }, // chargeHold: snap-and-hold the load = a big readable wind-up tell // keeps the blade's dead zone; the wave still covers the mid-range
  // MUSKET SHOT — the first TRAVELLING projectile (docs DESIGN_BACKLOG #19). swing:'shot' spawns a ball
  // (ProjectileSystem) that flies straight + dodgeable + wall-stopped — NOT the instant hitscan cone the
  // Gomu Pistol uses. RELOAD is the counterplay that balances range: the long `cooldown` (2.2s) IS the
  // one-shot-then-vulnerable window for v1 (a dedicated reload-lock animation is a #19 follow-up). shotSpeed
  // 620 px/s over range 520 → ~0.84s aloft: fast + flat, but you CAN sidestep a shot fired from across the
  // field. Heavy damage + knockback + a real stun — a hit hurts, but landing it is the skill (lead the mover).
  // closePass 0.6 @ 96px (3 tiles): a shot fired with someone in your face has up to a 60% chance to phase
  // THROUGH (fumbled — the long barrel can't bear), fading STEEPLY (squared) to 0 by 3 tiles. The Buttstroke
  // is the real point-blank answer; this makes "just keep shooting the guy hugging you" unreliable.
  { id: 'ability.musketShot', name: 'Musket Shot', cooldown: 3, shape: { range: 400, arc: 0, swing: 'shot', shotSpeed: 256, muzzle: 20, shotArt: 'weapon/bullet_1.png', shotSize: 48, noHit: true, closePassChance: 0.6, closePassRange: 96, swingTime: 0.45, phases: { windup: 0.15, active: 0.35, recover: 0.5 } }, recoilPush: 110, damageStat: 'atk', damageFlat: 14, knockback: 240, costStam: 8, stun: 0.5, shake: 2 },
  // MUSKET BASH — the butt-stroke (RMB-tap / K): a close-range SHOVE for when an enemy closes on your slow-
  // reloading gun. LOW damage, HIGH knockback + stun — it's about creating SPACE (knock them back so you can
  // reload or step away), not killing. A committed line-thrust (the rifle butt jabs forward). The melee answer
  // a ranged weapon needs against a rusher — pairs with the shot's long reload (the distance-war counterplay).
  { id: 'ability.musketBash', name: 'Buttstroke', cooldown: 5, shape: { range: 20, arc: 0.32, swing: 'melee', pattern: 'line', width: 14, swingTime: 0.5, reverseGrip: true, phases: { windup: 0.36, active: 0.3, recover: 0.34 } }, damageStat: 'atk', damageFlat: 2, knockback: 430, costStam: 9, stun: 0.9, shake: 3 }, // reverseGrip: mirror the musket so the STOCK leads the thrust
  // MARINE BUTTSTROKE — the marine musket's butt-stroke, a PARENT row (registry inheritance: child fields win,
  // the shape/damage/knockback all inherit — a flat copy would drift). Differs only in: a SHORTER cooldown (4s
  // vs 5s — the drilled officer recovers faster) and the WALL-SLAM proc: 30% of shoves are a LONG launch (950),
  // and slamming a WALL electrifies — a 3s FROZEN pin (no wall → a 1.5s SLOWED shock). An environmental
  // finisher: line them up with a wall behind them.
  { id: 'ability.marineButtstroke', parent: 'ability.musketBash', name: 'Buttstroke', cooldown: 4, wallSlam: { chance: 0.3, knockback: 950, stun: 3, slow: 1.5 } },
  // MARINE MUSKET SHOT — the naval variant's primary, a PARENT row over musketShot (recoil/damage-stat/knockback/
  // stamina/stun inherit): FASTER reload (2.5s vs 3s), MORE damage (18 vs 14), and its own SHAPE (objects REPLACE
  // wholesale on inheritance, so the shape is restated): a FASTER ball (384 = 12 tiles/s vs 8 — harder to
  // dodge-by-sight), a GENERATED ball (shotProc, no PNG), and a 20% CHARGED round (procEffect → effect.shocked:
  // ×1.5 damage → 27, plus a 1.5s electric slow on whoever it hits).
  { id: 'ability.marineMusketShot', parent: 'ability.musketShot', name: 'Marine Musket Shot', cooldown: 2.5, shape: { range: 400, arc: 0, swing: 'shot', shotSpeed: 384, muzzle: 20, shotProc: 'ball', shotSize: 14, noHit: true, closePassChance: 0.6, closePassRange: 96, procEffect: { chance: 0.2, effect: 'effect.shocked', dur: 1.5, damageMult: 1.5 }, swingTime: 0.45, phases: { windup: 0.15, active: 0.35, recover: 0.5 } }, damageFlat: 18 },
  // MARINE BUCKSHOT (slot 1 / K) — the marine musket's SIGNATURE, and its close-range identity vs the base musket:
  // a SCATTER blast of 5 pellets in a WIDE ~44° cone, SHORT range (150 ≈ 4.7 tiles), each pellet a light hit but
  // the volley shreds someone in your face. The ranged answer to a rusher (alongside the Buttstroke shove).
  // Balanced by a LONG cooldown (8s — a committed panic-button, not a rotation move) + high stamina + NO close-pass
  // (it's MEANT for point-blank). A plain lead spray (no electric — that's the Shock Kick's thing). Big knockback = shove.
  { id: 'ability.marineBuckshot', name: 'Buckshot', tags: [AI_ROLE_POINT_BLANK], cooldown: 8, shape: { range: 150, arc: 0, swing: 'shot', shotSpeed: 384, muzzle: 20, shotProc: 'ball', shotSize: 11, noHit: true, pellets: 5, shotSpreadArc: 0.38, swingTime: 0.6, phases: { windup: 0.4, active: 0.25, recover: 0.35 } }, recoilPush: 500, damageStat: 'atk', damageFlat: 6, knockback: 200, costStam: 14, stun: 0.35, shake: 3 }, // BIG windup (0.4×0.6 ≈ 0.24s) — a readable "winding up the scatter" tell you can dodge. recoilPush 500 (~4.5× a normal shot's 110) — the scatter blast kicks the marine back HARD (a shove-off, pairs with the retreat identity)
  // MARINE SHOCK KICK (slot 2 / L) — the TACTICAL-RETREAT verb: an ELECTRIC front kick that damages + knocks the
  // enemy back AND hops the marine BACKWARD (recoilPush 560 — a real escape hop), opening the gap so a kiter
  // resets to firing range. A BIGGER hitbox than the base kick (arc 0.45 vs 0.3, reachMul 1.4 vs 1.1 — easier to
  // land in a scramble) + a LONG stun (1.3, the zap-lock). Visually distinct: cyan swing crackle (swingFx) + cyan
  // impact spark (hitFx). Long cooldown/high stamina = a committed escape, not spammable.
  { id: 'ability.marineShockKick', name: 'Shock Kick', tags: [AI_ROLE_DISENGAGE], cooldown: 6, shape: { range: 0, arc: 0.45, swing: 'melee', pattern: 'line', swingTime: 0.5, limb: 'foot', reachMul: 1.4, swingFx: 'electric', phases: { windup: 0.36, active: 0.3, recover: 0.34 } }, recoilPush: 560, hitFx: 0x6cf0ff, damageStat: 'atk', damageFlat: 7, knockback: 360, costStam: 12, stun: 1.3, shake: 3 }, // windup 0.36×0.5 = 0.18s tell
  // fighting style (flash step)
  { id: 'ability.flashDash', name: 'Flash Dash', cooldown: 0.45, costStam: 10, selfImpulse: 420, grantEffect: 'effect.invuln' },
  // ── KENJUTSU (the Samurai's kit — weapon.katana + style.kenjutsu). Designed as ANSWERS to the Marine Officer's
  // cycle (a kiter: shot / buttstroke / buckshot / shock-kick), so the duel has a rhythm, not two spam loops:
  //  KESA → KIRI-AGE: the two-cut chain (LMB, LMB). Medium rung (no authored phases → windup 0.5×0.55 = 0.28s),
  //    faster than the sword's 0.8 swings, and LOW knockback on purpose — against a kiter every pixel of shove
  //    is a gift; the cuts keep him in reach and the iai's posture does the finishing. Two steps, not three: his
  //    kick/buttstroke recharge too fast for a third auto-chained cut to land; the third beat is a decision (iai).
  { id: 'ability.kesa', name: 'Kesa', cooldown: 0.8, shape: { range: 36, arc: 0.5, swing: 'melee', pattern: 'arc', swingTime: 0.55 }, damageStat: 'atk', damageFlat: 3, knockback: 150, costStam: 5, stun: 0.4, comboNext: 'ability.kiriage' },
  { id: 'ability.kiriage', name: 'Kiri-age', cooldown: 0.8, shape: { range: 36, arc: 0.5, swing: 'melee', pattern: 'arc', swingTime: 0.55, mirror: true }, damageStat: 'atk', damageFlat: 4, knockback: 170, costStam: 5, stun: 0.45, comboNext: 'ability.tsuki' },
  //  TSUKI (the thrust): the chain's THIRD press — a STAB, not a third sweep (two cuts then the point: the chain
  //    reads as three different motions). The stab motion cocks back then lunges (the 'line' corridor + a longer
  //    reach); the one with real posture and shove. After it the root (Kesa) locks for THIS cooldown (the
  //    post-combo recovery, the chain engine's rule).
  { id: 'ability.tsuki', name: 'Tsuki', cooldown: 1.4, shape: { range: 36, arc: 0.3, swing: 'melee', pattern: 'line', width: 12, swingTime: 0.6, reachMul: 1.2 }, damageStat: 'atk', damageFlat: 6, knockback: 240, costStam: 6, stun: 0.6, posture: 10 },
  //  IAI: the draw cut — the HEAVY (RMB) and the brain's special. A narrow arc from the sheath with a CHARGE-HOLD
  //    tell (0.55 × 0.9 = 0.5s: honest, answerable), a flash of an active window, a long punishable recovery.
  //    Its job is posture (20 — breaks a block) and ending a stagger, not raw damage. reachMul: the drawn blade.
  { id: 'ability.iai', name: 'Iai', cooldown: 3, shape: { range: 36, arc: 0.3, swing: 'melee', pattern: 'arc', swingTime: 0.9, chargeHold: true, reachMul: 1.25, phases: { windup: 0.55, active: 0.15, recover: 0.3 } }, damageStat: 'atk', damageFlat: 9, knockback: 220, costStam: 10, stun: 1.0, posture: 20, shake: 3, comboNext: 'ability.kirioroshi', comboWindow: 1.3 }, // comboWindow > the 0.9s swing, or the second press could never chain
  //  KIRIOROSHI (the overhead finishing cut that follows the draw in iaido): the HEAVY chain's second press —
  //    heavier than the iai, no charge-hold (the draw was the tell), the biggest single hit in the kit. It must
  //    READ differently from the draw it follows: the iai is a NARROW cut from the lead side; this is a WIDE
  //    sweep MIRRORED from the off side (arc 0.9 — well past the twist floor the narrow draw sits on), with a
  //    visible WAVE reaching a little past the blade (the overhead cut's shock), so the two heavies can't be
  //    confused. Top-down can't show "overhead" — width, side, and the wave are what it has.
  { id: 'ability.kirioroshi', name: 'Kirioroshi', cooldown: 3.5, shape: { range: 36, arc: 0.9, swing: 'melee', pattern: 'arc', swingTime: 0.8, mirror: true, phases: { windup: 0.45, active: 0.2, recover: 0.35 }, hitVolumes: [{ kind: 'weaponSegment' }, { kind: 'arc', radius: 80, halfAngle: 0.9, thickness: 56, follow: 'swing', active: [0.45, 0.65] }] }, damageStat: 'atk', damageFlat: 11, knockback: 260, costStam: 11, stun: 1.1, posture: 14, shake: 3 },
  //  SHUKUCHI ("shrinking the earth"): the style's dash — longer + more committal than Flash Dash, and NOT i-frames:
  //    melee still lands, but for the dash window a musket ball has 50% odds (effect.deflecting) of being turned
  //    back at its shooter — the closer's answer to the kite, with the kiter's own shot as the punishment.
  { id: 'ability.shukuchi', name: 'Shukuchi', cooldown: 1.6, costStam: 9, selfImpulse: 520, impulseDur: 0.22, grantEffect: 'effect.deflecting' },
  //  KIAI (the spirit shout): the C-slot buff — a BURST, not a state (4s on a 12s cooldown): +30% move speed and
  //    +10% attack with a visible label, popped on engagement (the beat where the kite is decided). Short and
  //    pricey on purpose: a long/cheap haste makes the kiter a slower melee unit and kills the duel's rhythm.
  { id: 'ability.kiai', name: 'Kiai', cooldown: 12, costStam: 12, grantEffect: 'effect.kiai' },
  //  WIND SLASH — the projectile Kamaitachi LOOSES on its 'S' windows (never pressed; fired by the channel's volley
  //    cues along the blade's live angle, so the flurry fans them). A flying crescent (shotProc 'slash'), ~9 tiles,
  //    a real hit on whoever it meets first.
  { id: 'ability.kamaitachiSlash', name: 'Wind Slash', cooldown: 0, shape: { range: 288, arc: 0, swing: 'shot', shotSpeed: 480, muzzle: 30, shotProc: 'slash', shotSize: 30, swingTime: 0.2, noHit: true }, damageStat: 'atk', damageMul: 0.7, knockback: 200, stun: 0.4 },
  //  KAMAITACHI (the sickle-weasel wind — invisible rapid cuts): the ULTI, the katana's slot (key 1). A ROOTED
  //    channel SIX seconds long: a 0.4s charge-hold tell, then the PLAN (KAMAITACHI_PLAN) over ~5.2s at about half
  //    the kesa chain's cadence (~6/s; the flurry motion): plain blade cuts, LARGE sweeps that reach past the blade
  //    with their own wave, and cuts that LOOSE a wind-slash projectile — then the LAST window, the big WIND (an arc
  //    to ~4 tiles) that catches a kicker who hopped away. (An arc volume's band is radius−thickness → radius.) Every window lands once per target per cut (a crowd eats
  //    it too), each a small damage share and a sliver of posture that adds up to a guard break. Counterplay: WALK
  //    OUT — he's planted for all six seconds, and staggered feet still answer (slowed) — or interrupt the tell.
  //    Knockback is tiny per cut so the flurry doesn't shove its own target out of reach. Pricey + a long cooldown.
  {
    id: 'ability.kamaitachi', name: 'Kamaitachi', cooldown: 30, costStam: 30, channel: true,
    shape: {
      range: 36, arc: 0.55, swing: 'melee', pattern: 'flurry', swingTime: 6, chargeHold: true, reachMul: 1.1, // the cut count = the windows (flurryCuts)
      phases: KAMAITACHI_PHASES,
      hitVolumes: KAMAITACHI_WINDOWS.hitVolumes,
    },
    volleys: KAMAITACHI_WINDOWS.volleys,
    damageStat: 'atk', damageMul: 0.24, knockback: 25, stun: 0.15, posture: 2.5, shake: 1,
  },
  // devil fruit (gomu) — rubber-arm STRETCH punches: the fist cocks back then shoots far out (the arm is the hitbox)
  // fruit phases are AUTHORED (never the weight ladder): the Pistol's long rubber cock-back IS its telegraph
  { id: 'ability.gomuPistol', name: 'Gomu Pistol', cooldown: 1.1, shape: { range: 118, arc: 0.12, single: true, swing: 'melee', pattern: 'stretch', swingTime: 1.05, phases: { windup: 0.46, active: 0.2, recover: 0.34 } }, damageStat: 'atk', damageFlat: 8, knockback: 330, costStam: 11, stun: 0.44, posture: 8 }, // posture 8 (2× the unarmed-fallback 4): a rubber blow crushes a guard harder than a bare fist. ~480ms rubber cock-back — the show IS the reactable telegraph
  { id: 'ability.gomuGatling', name: 'Gomu Gatling', cooldown: 4.0, shape: { range: 85, arc: 0.3, swing: 'melee', pattern: 'stretch', swingTime: 2.0, jabs: 4, phases: { windup: 0.2, active: 0.6, recover: 0.2 } }, damageStat: 'atk', knockback: 60, costStam: 26, stun: 0.24, posture: 8 }, // windup 0.2×2.0=0.40s: a READABLE punch-class telegraph (was 0.1=200ms, unreactably fast for a committed barrage) — the flurry announces itself like Pistol/Stamp, then the 1.2s active R→L→R→L barrage. BOTH hands cock back in windup (drawActor)
  // Gomu Rocket: PURE MOVEMENT now — the arm grabs FORWARD, then the body rockets up to it (launchAt fires
  // mid-swing). No landing AoE / no contact hit: it's a REPOSITION (blink through a target, the cornered-escape
  // intent's tool), with i-frames on the leap. The damaging overhead slam that used to live here is now its own
  // telegraphed move, Gomu Ono (below) — one ability, one job. Fast startup is correct for a leap; its cost is
  // the long recovery (open on landing), not a windup you could never dodge anyway.
  { id: 'ability.gomuRocket', name: 'Gomu Rocket', cooldown: 2.5, costStam: 18, selfImpulse: 1100, impulseDur: 0.2, launchAt: 0.42, grantEffect: 'effect.invuln', shape: { range: 95, arc: 0.12, swing: 'melee', pattern: 'stretch', stretchMode: 'grab', swingTime: 0.8, bothHands: true, noHit: true, phases: { windup: 0.12, active: 0.3, recover: 0.58 } } }, // noHit + no landRadius → moves only; arm snaps back over the first half of recovery (swing.ts)
  // GOMU ONO (Axe): a committed OVERHEAD axe-kick — the leg stretches straight UP to the sky (the drawn foot
  // SCALES UP through the windup = the readable rising-leg tell), reaches max height, then CRASHES down as an
  // AoE slam where he stands. A punch-class telegraph (long windup, like Pistol/Stamp) — you SEE the leg rise and
  // clear the zone. The AoE + shake sell the impact. `pattern: 'axe'` is the new rising-leg motion (swing.ts);
  // landRadius makes the fall an area slam (like Rocket's old one, now on a telegraphed attack that earns it).
  { id: 'ability.gomuOno', name: 'Gomu Ono', cooldown: 3.5, shape: { range: 0, arc: 0.3, swing: 'melee', pattern: 'axe', limb: 'foot', swingTime: 1.1, noHit: true, landRadius: 70, phases: { windup: 0.5, active: 0.22, recover: 0.28 } }, damageStat: 'atk', damageFlat: 16, knockback: 300, costStam: 20, stun: 1.1, shake: 5, posture: 8 }, // noHit → the SWING deals nothing (the AoE is the hit); windup 0.5×1.1=0.55s rising-leg tell; slam lands at active-start (foot hits ground)
  // gomu HEAVY (the kick version of the Pistol): the leg cocks back then stamps far out — the stretched-leg stomp
  { id: 'ability.gomuStamp', name: 'Gomu Stamp', cooldown: 1.35, shape: { range: 140, arc: 0.12, single: true, swing: 'melee', pattern: 'stretch', stretchMode: 'punch', limb: 'foot', swingTime: 1.15, phases: { windup: 0.46, active: 0.2, recover: 0.34 } }, damageStat: 'atk', damageFlat: 14, knockback: 340, costStam: 16, stun: 1.0, posture: 8 }, // posture 8 (2× unarmed fallback). the leg version of the Pistol — same committed rubber cock-back (~530ms), heavier tail for the harder stomp
  // enemy melee — the SAME ability path as the player. Their phases are AUTHORED (kit-less abilities would
  // fall to the twitchy unarmed rung): the PLAYER parries these, so their windups must clear reaction time.
  { id: 'ability.banditStrike', name: 'Strike', cooldown: 0.8, shape: { range: 0, arc: 0.28, swing: 'melee', pattern: 'line', swingTime: 0.5, phases: { windup: 0.4, active: 0.25, recover: 0.35 } }, damageStat: 'atk', knockback: 175, costStam: 3, stun: 0.3 }, // 200ms tell
  // the Brawler boss's bare-fist haymaker — a big, committed swing (315ms tell): unarmed but AUTHORED, so
  // the guard-master's OWN blows are reactable and the parry duel goes both ways. The boss REWARDS the read.
  { id: 'ability.brawlerStrike', name: 'Haymaker', cooldown: 1.0, shape: { range: 0, arc: 0.55, swing: 'melee', swingTime: 0.7, phases: { windup: 0.45, active: 0.25, recover: 0.3 } }, damageStat: 'atk', knockback: 240, costStam: 4, stun: 0.7 },
  // the BULL's headbutt GORE — a heavy contact ram: wide arc (the horns sweep), huge knockback + a long stun
  // (you get bowled over), authored slow tell (~330ms) so the charge reads and the dodge-roll is the answer.
  // Screen-shake on the slam (a beast this size lands hard). Damage off 'atk' like everything (the Moat).
  // the HEAD is the hitbox (like the fist is the punch's): a compact head-sized capsule that LUNGES with the drawn
  // head (combat/swing.gore) — not a wide fan. `hitVolumes` width ≈ the head diameter so the damage matches the
  // head. Narrow arc (unused by a capsule, kept small). The wide knockback/stun/shake sell the ram.
  { id: 'ability.gore', name: 'Gore', cooldown: 1.4, shape: { range: 0, arc: 0.3, swing: 'melee', pattern: 'gore', swingTime: 0.55, phases: { windup: 0.6, active: 0.2, recover: 0.2 }, hitVolumes: [{ kind: 'weaponSegment', width: 30 }] }, damageStat: 'atk', damageFlat: 25, knockback: 420, costStam: 5, stun: 1.1, shake: 5, posture: 8 }, // atk(~10) + 25 flat ≈ 35 per ram; posture 8 = 2× the unarmed-fallback 4 (a headbutt crushes a guard)
]);

/**
 * Effective reach of a melee ability — used by AI to choose its engage distance (the real hit is by contact
 * in MeleeSystem). A bare fist reaches an arm's length (`bodyReach`); an armed swing barely extends the arm,
 * so the weapon's length (`shape.range`) does the reaching. Ranged abilities are a fixed range.
 */
export function abilityRange(ab: AbilityDef, bodyReach: number): number {
  if (!ab.shape) return 0;
  if (ab.shape.swing !== 'melee') return ab.shape.range; // pistol cone + shot both reach their fixed range
  if (ab.shape.pattern === 'stretch') return ab.shape.range; // rubber arm reaches its full stretch length
  const weaponLen = ab.shape.range; // 0 for fists
  const arm = weaponLen > 0 ? 0.3 : 1; // armed → arm stays home; fist → arm extends fully
  return Math.round(bodyReach * arm * (ab.shape.reachMul ?? 1) + weaponLen);
}
