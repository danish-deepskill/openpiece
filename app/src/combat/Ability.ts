import { Registry, type ContentId, type Def } from '../core/Registry';
import type { HitVolume } from './hitVolume';
import type { StatId } from './Modifier';
import type { AttackPhases } from './phases';

export interface AbilityShape {
  range: number;
  arc: number; // half-angle of the hit cone (radians) — used by 'arc' pattern
  single?: boolean; // hits only the nearest target in the cone/line
  swing: 'melee' | 'pistol';
  /** Hit shape: 'arc' = swing (sweep); 'line' = stab (thrust); 'mixed' = random; 'stretch' = Gomu rubber arm. */
  pattern?: 'arc' | 'line' | 'mixed' | 'stretch';
  width?: number; // 'line' corridor half-width (px)
  /** Melee swing duration (s): the window the animated fist/blade is a live hitbox. Default 0.18. */
  swingTime?: number;
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
  shape?: AbilityShape; // offensive abilities
  damageStat?: StatId; // base damage read from the user's attributes (e.g. 'atk')
  damageFlat?: number;
  knockback?: number;
  stun?: number; // hitstun (s) inflicted on a target this attack lands on — heavier moves stagger longer
  shake?: number; // screen-shake magnitude on a landed hit. OFF by default — reserve it for POWERFUL abilities.
  selfImpulse?: number; // dash speed (movement abilities)
  impulseDur?: number; // how long (s) the self-impulse carries — default 0.16 (a short hop); Rocket leaps longer
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
  // base kit (unarmed): a short, committed fist jab — the fist itself is the hitbox on contact (windup ~34ms)
  { id: 'ability.punch', name: 'Punch', cooldown: 0.5, shape: { range: 0, arc: 0.22, swing: 'melee', pattern: 'line', swingTime: 0.28, reachMul: 0.85 }, damageStat: 'atk', knockback: 165, costStam: 3, stun: 0.12 },
  { id: 'ability.dodge', name: 'Dodge', cooldown: 0.55, costStam: 6, selfImpulse: 320, grantEffect: 'effect.invuln' },
  // GUARD abilities — a unit CAN block/parry iff these are in its loadout (the capability, granted like any
  // ability: base kit for fighters, or a weapon/style could grant a better one). They aren't activated through
  // AbilitySystem — the guard engine (combat/guard) drives them, gated by the grant. `trigger` records the
  // input shape (hold vs tap) per the COMBAT.md decision; consumed by the guard wiring, not a generic dispatch yet.
  { id: 'ability.block', name: 'Block', cooldown: 0, trigger: 'hold' },
  { id: 'ability.parry', name: 'Parry', cooldown: 0, trigger: 'tap' },
  // base kit HEAVY: a committed kick — slower + harder than the jab. The foot only appears for this swing (right-click).
  { id: 'ability.kick', name: 'Kick', cooldown: 0.9, shape: { range: 0, arc: 0.3, swing: 'melee', pattern: 'line', swingTime: 0.4, limb: 'foot', reachMul: 1.45 }, damageStat: 'atk', damageFlat: 6, knockback: 320, costStam: 7, stun: 0.45 },
  // Haki — Armament: a timed coating that counters Devil Fruits (bypasses Logia intangibility) + boosts damage
  { id: 'ability.armament', name: 'Armament', cooldown: 8, grantEffect: 'effect.armament' },
  // weapon (cutlass) — the basic, deliberate sword move: a real swing/stab whose blade must connect (windup ~143ms)
  { id: 'ability.cut', name: 'Cut', cooldown: 0.7, shape: { range: 30, arc: 0.5, swing: 'melee', pattern: 'mixed', width: 12, swingTime: 0.55 }, damageStat: 'atk', damageFlat: 2, knockback: 170, costStam: 3, stun: 0.22 },
  // RESERVED for a late-game / high-tier weapon: fast + powerful. Not granted by the starter cutlass.
  { id: 'ability.slash', name: 'Slash', cooldown: 0.5, shape: { range: 30, arc: 0.5, swing: 'melee', pattern: 'mixed', width: 12, swingTime: 0.35 }, damageStat: 'atk', damageFlat: 6, knockback: 210, costStam: 3.5, stun: 0.2 },
  // LIGHT weapon (knife/dagger): a quick, short, cheap stab — fast cadence, low damage + stagger (windup ~54ms)
  { id: 'ability.stab', name: 'Stab', cooldown: 0.4, shape: { range: 22, arc: 0.34, swing: 'melee', pattern: 'mixed', width: 8, swingTime: 0.3 }, damageStat: 'atk', damageFlat: 1, knockback: 120, costStam: 2, stun: 0.14 },
  // the SWORD's 3-hit chain: two committed heavy cuts (~228ms windups — REACTION-parryable, the price of the
  // reach + damage), then a finisher whose slash-wave (a 'swing'-following arc volume) reaches past the
  // steel — after it, the chain ROOT locks for the finisher's cooldown (the post-combo recovery).
  { id: 'ability.swordSlash1', name: 'Slash', cooldown: 0.65, shape: { range: 0, arc: 0.55, swing: 'melee', pattern: 'arc', swingTime: 0.6 }, damageStat: 'atk', damageFlat: 3, knockback: 180, costStam: 5, stun: 0.2, comboNext: 'ability.swordSlash2' },
  { id: 'ability.swordSlash2', name: 'Backslash', cooldown: 0.65, shape: { range: 0, arc: 0.55, swing: 'melee', pattern: 'arc', swingTime: 0.6, mirror: true }, damageStat: 'atk', damageFlat: 4, knockback: 200, costStam: 5, stun: 0.22, comboNext: 'ability.swordFinisher' },
  // the wave's window sits INSIDE the heavy rung's active phase [0.38, 0.72] — a telegraph must never
  // deal damage (the canon review caught the old [0.15, 0.7], authored against the deleted pre-phase timeline)
  { id: 'ability.swordFinisher', name: 'Cross Cut', cooldown: 2.4, shape: { range: 0, arc: 0.7, swing: 'melee', pattern: 'arc', swingTime: 0.85, hitVolumes: [{ kind: 'weaponSegment', from: 0.3 }, { kind: 'arc', radius: 52, halfAngle: 0.9, thickness: 26, follow: 'swing', active: [0.38, 0.72] }] }, damageStat: 'atk', damageFlat: 8, knockback: 320, costStam: 8, stun: 0.5, shake: 4 }, // keeps the blade's dead zone; the wave still covers the mid-range
  // fighting style (flash step)
  { id: 'ability.flashDash', name: 'Flash Dash', cooldown: 0.45, costStam: 10, selfImpulse: 420, grantEffect: 'effect.invuln' },
  // devil fruit (gomu) — rubber-arm STRETCH punches: the fist cocks back then shoots far out (the arm is the hitbox)
  // fruit phases are AUTHORED (never the weight ladder): the Pistol's long rubber cock-back IS its telegraph
  { id: 'ability.gomuPistol', name: 'Gomu Pistol', cooldown: 1.1, shape: { range: 118, arc: 0.12, single: true, swing: 'melee', pattern: 'stretch', swingTime: 1.05, phases: { windup: 0.46, active: 0.2, recover: 0.34 } }, damageStat: 'atk', damageFlat: 8, knockback: 330, costStam: 5.5, stun: 0.22 }, // a deliberately COMMITTED baseline (headroom for fast late gear): ~480ms rubber cock-back — the show IS the reactable telegraph
  { id: 'ability.gomuGatling', name: 'Gomu Gatling', cooldown: 1.6, shape: { range: 85, arc: 0.3, swing: 'melee', pattern: 'stretch', swingTime: 0.5, jabs: 4, phases: { windup: 0.1, active: 0.7, recover: 0.2 } }, damageStat: 'atk', knockback: 60, costStam: 13, stun: 0.12 },
  // Gomu Rocket: the arm grabs FORWARD, then the body rockets up to it — a long leap (launchAt fires mid-swing)
  // grab forward with BOTH hands (no contact damage), rocket the body, then SLAM an AoE where it lands
  { id: 'ability.gomuRocket', name: 'Gomu Rocket', cooldown: 2.0, costStam: 9, selfImpulse: 1100, impulseDur: 0.2, launchAt: 0.4, grantEffect: 'effect.invuln', shape: { range: 95, arc: 0.12, swing: 'melee', pattern: 'stretch', stretchMode: 'grab', swingTime: 0.5, bothHands: true, noHit: true, landRadius: 100, phases: { windup: 0.1, active: 0.3, recover: 0.6 } }, damageStat: 'atk', damageFlat: 12, knockback: 320, stun: 0.5, shake: 6 }, // grab reaches full at windup+active = 0.4 — exactly where launchAt fires
  // gomu HEAVY (the kick version of the Pistol): the leg cocks back then stamps far out — the stretched-leg stomp
  { id: 'ability.gomuStamp', name: 'Gomu Stamp', cooldown: 1.35, shape: { range: 140, arc: 0.12, single: true, swing: 'melee', pattern: 'stretch', stretchMode: 'punch', limb: 'foot', swingTime: 1.15, phases: { windup: 0.46, active: 0.2, recover: 0.34 } }, damageStat: 'atk', damageFlat: 14, knockback: 340, costStam: 8, stun: 0.5 }, // the leg version of the Pistol — same committed rubber cock-back (~530ms), heavier tail for the harder stomp
  // enemy melee — the SAME ability path as the player. Their phases are AUTHORED (kit-less abilities would
  // fall to the twitchy unarmed rung): the PLAYER parries these, so their windups must clear reaction time.
  { id: 'ability.banditStrike', name: 'Strike', cooldown: 0.8, shape: { range: 0, arc: 0.28, swing: 'melee', pattern: 'line', swingTime: 0.5, phases: { windup: 0.4, active: 0.25, recover: 0.35 } }, damageStat: 'atk', knockback: 175, costStam: 3, stun: 0.15 }, // 200ms tell
  // the Brawler boss's bare-fist haymaker — a big, committed swing (315ms tell): unarmed but AUTHORED, so
  // the guard-master's OWN blows are reactable and the parry duel goes both ways. The boss REWARDS the read.
  { id: 'ability.brawlerStrike', name: 'Haymaker', cooldown: 1.0, shape: { range: 0, arc: 0.55, swing: 'melee', swingTime: 0.7, phases: { windup: 0.45, active: 0.25, recover: 0.3 } }, damageStat: 'atk', knockback: 240, costStam: 4, stun: 0.35 },
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
