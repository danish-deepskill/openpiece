import { Registry, type ContentId, type Def } from '../core/Registry';
import type { HitVolume } from './hitVolume';
import type { StatId } from './Modifier';
import type { AttackPhases } from './phases';

export interface AbilityShape {
  range: number;
  arc: number; // half-angle of the hit cone (radians) — used by 'arc' pattern
  single?: boolean; // hits only the nearest target in the cone/line
  swing: 'melee' | 'pistol';
  /** Hit shape: 'arc' = swing (sweep); 'line' = stab (thrust); 'mixed' = random; 'stretch' = Gomu rubber arm;
   *  'gore' = headbutt capsule; 'axe' = overhead axe-kick (the limb rises/scales UP, then slams an AoE straight down). */
  pattern?: 'arc' | 'line' | 'mixed' | 'stretch' | 'gore' | 'axe';
  width?: number; // 'line' corridor half-width (px)
  /** Melee swing duration (s): the window the animated fist/blade is a live hitbox. Default 0.18. */
  swingTime?: number;
  /** CHARGE-HOLD (arc swings): snap the blade to its cocked-back load EARLY in the windup, then HOLD it there
   *  until the cut — a Sekiro-style "charging up" tell that reads unmistakably (vs a linear load that drifts).
   *  For big committed swings (the sword finisher). Default off (a linear load). */
  chargeHold?: boolean;
  jabs?: number; // 'stretch' flurry: number of rapid jabs (Gomu Gatling); a target can be hit once per jab
  /** 'stretch' style: 'punch' cocks back then snaps out; 'grab' reaches forward then retracts (Gomu Rocket). */
  stretchMode?: 'punch' | 'grab';
  /** Which limb strikes — purely visual (a fist/hand vs a kicking foot/boot); the motion + hitbox are the same. */
  limb?: 'hand' | 'foot';
  /** Multiplies the body's natural reach for this strike — a short jab (< 1), a long kick (> 1). Default 1. */
  reachMul?: number;
  /** Render BOTH limbs for a stretch (Gomu Rocket's two-armed grab) instead of one. */
  bothHands?: boolean;
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
  damageStat?: StatId; // base damage read from the user's attributes (e.g. 'atk')
  damageFlat?: number;
  knockback?: number;
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
  if (a.shape && a.shape.range < 0) return 'shape.range must be ≥ 0';
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
    if (a.shape?.swingTime !== undefined && win <= a.shape.swingTime) return `comboWindow (${win}) must outlast swingTime (${a.shape.swingTime}) or the chain is unreachable`;
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
  // fighting style (flash step)
  { id: 'ability.flashDash', name: 'Flash Dash', cooldown: 0.45, costStam: 10, selfImpulse: 420, grantEffect: 'effect.invuln' },
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
  if (ab.shape.swing !== 'melee') return ab.shape.range;
  if (ab.shape.pattern === 'stretch') return ab.shape.range; // rubber arm reaches its full stretch length
  const weaponLen = ab.shape.range; // 0 for fists
  const arm = weaponLen > 0 ? 0.3 : 1; // armed → arm stays home; fist → arm extends fully
  return Math.round(bodyReach * arm * (ab.shape.reachMul ?? 1) + weaponLen);
}
