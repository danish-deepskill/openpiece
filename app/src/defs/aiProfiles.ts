import { Registry, type Def } from '../core/Registry';

export type Approach = 'rush' | 'kite' | 'flank' | 'guard';

/**
 * The single per-unit AI spec — a unit's whole brain as DATA, grouped awareness / movement / combat. The
 * AI systems (brains, perception) are generic engines that only READ these; a new AI type is a new profile
 * (or, later, an intelligence score that scales one), never new branching code. Every profile starts from
 * BASE and overrides only what differs.
 */
export interface AIProfileDef extends Def {
  name: string;
  approach: Approach;
  passive?: boolean; // never fights: wanders its spawn, and FLEES from whoever strikes it (prey animals)

  // — Awareness —
  sight: number; // forward detection radius (needs line-of-sight; walls hide you)
  cone: number; // forward-vision half-angle (rad): full `sight` only within this of facing
  nearSight: number; // flank/peripheral range (px): sensed to the SIDES within this (short)
  blindArc: number; // rear blind-spot half-angle (rad): the surprise-attack window
  reaction: number; // aim-lag (s): it commits to where you WERE, so movement makes it whiff
  faceSway: number; // idle facing sway (rad): keeps the aim alive, not a dead-on lock
  loseSightSec: number; // give-up timer after losing sight
  alertDur: number; // a hit makes it investigate its attacker for this long (s)
  leash: number; // give up + go home past this far from its post

  // — Movement —
  weaveAmp: number; // serpentine-approach lateral strength (rel. forward)
  weaveFreq: number; // serpentine + facing-sway oscillation (rad/s)
  laneSpread: number; // squad fan-out lane width (px)
  wanderTurn: number; // turn rate while wandering (rad/s) — eases FACING only; movement still aims straight at the goal
  wanderTether: number; // idle-roam radius around the post (px); a chase give-up outside it walks back
  wanderSpeed: number; // idle-roam amble speed (px/s) — grazing pace, not the combat move speed
  dashMax: number; // gap-closer window (px past reach) within which a dash-capable unit lunges
  turnSpeed?: number; // heavy-body turn CAP (rad/s): if set, the unit moves along its facing (arcs), not straight at the goal — a lumber. Critters only.
  chargeMax: number; // gap within which it commits a sprint-charge (px)
  chargeDur: number; // charge sprint duration (s)
  chargeCd: number; // cooldown between charges (s)
  chargeStam: number; // min stamina to start a charge

  // — Combat —
  strikeFrac: number; // stop this fraction INTO max reach, so blows land (not graze the edge)
  preferredRange?: number; // kite: keep this much distance
  guardRadius?: number; // guard: only engage within this of its post
  fleeBelowHp?: number; // 0..1 HP fraction; flee below it
  /** Chance (0..1) to raise a BLOCK when its foe winds up in reach — rolled once per swing (guardCd), the
   *  same tryGuard the player's F key calls. 0 = never guards (fodder). Skill, expressed as data. */
  blockChance: number;
  /** Chance (0..1) to attempt the riskier PARRY instead (rolled before block — parry ⊂ the guard decision).
   *  Its timing is honest: the tap only lands if the foe's active phase falls inside the parry window. */
  parryChance: number;
  /** TACTICAL RETREAT (stamina management): when stamina drops to ≤ this FRACTION, break off and back to
   *  spacing to regen instead of flailing on an empty bar — a smart fighter saves its burst. Undefined ⇒
   *  fights to exhaustion (fodder). Pairs with `reengageStam` (hysteresis, so it doesn't jitter). */
  regroupBelowStam?: number;
  /** Re-engage once stamina recovers to ≥ this fraction (must be > regroupBelowStam — the hysteresis band).
   *  The gap between the two is how long it stays out regrouping: a wide band = long, patient resets. */
  reengageStam?: number;
  /** Friendly-fire tolerance: an ALLY that beats this unit down to ≤ this HP fraction earns a PERMANENT,
   *  personal grudge (mutual hostility). 0.8 = snaps after losing 20%; HIGHER = jumpier (0.95 ≈ first hit);
   *  LOWER = more loyal (absorbs more); 0 = never turns. Only allies provoke it — real enemies aren't betrayal. */
  betrayHpFrac: number;
}

/** The default brain. Each profile spreads this and overrides only what makes it distinct. */
const BASE: Omit<AIProfileDef, 'id' | 'name' | 'approach' | 'sight' | 'preferredRange' | 'guardRadius' | 'fleeBelowHp'> = {
  cone: 1.0,
  nearSight: 75,
  blindArc: 0.7,
  reaction: 0.18,
  faceSway: 0.16,
  loseSightSec: 5, // long enough to round a block + re-acquire at the current slow move speed
  alertDur: 3,
  leash: 640,
  weaveAmp: 0.7,
  weaveFreq: 3.5,
  laneSpread: 70,
  wanderTurn: 5,
  wanderTether: 120,
  wanderSpeed: 30,
  dashMax: 130,
  chargeMax: 220,
  chargeDur: 0.7,
  chargeCd: 2,
  chargeStam: 25,
  strikeFrac: 0.8,
  betrayHpFrac: 0.8, // default: an ally that knocks off 20% of my HP has crossed the line
  blockChance: 0, // fodder doesn't guard — profiles that fight with intent override these
  parryChance: 0,
};

// validated at boot: brains divide by `reaction` and scale by `strikeFrac`, so a 0 or NaN here is not a
// tuning choice — it's a division-by-zero / never-strikes bug that must fail on load
export const AIProfiles = new Registry<AIProfileDef>('AIProfiles', (p) => {
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === 'number' && !Number.isFinite(v)) return `${k} must be finite (got ${v})`;
  }
  if (p.sight < 0) return `sight must be ≥ 0 (got ${p.sight})`;
  if (!(p.reaction > 0)) return `reaction must be > 0 — brains compute 1/reaction (got ${p.reaction})`;
  if (!(p.strikeFrac > 0 && p.strikeFrac <= 1)) return `strikeFrac must be in (0, 1] (got ${p.strikeFrac})`;
  if (p.fleeBelowHp !== undefined && (p.fleeBelowHp < 0 || p.fleeBelowHp > 1)) return `fleeBelowHp must be in [0, 1] (got ${p.fleeBelowHp})`;
  if (p.betrayHpFrac < 0 || p.betrayHpFrac > 1) return `betrayHpFrac must be in [0, 1] (got ${p.betrayHpFrac})`;
  if (p.blockChance < 0 || p.blockChance > 1) return `blockChance must be in [0, 1] (got ${p.blockChance})`;
  if (p.parryChance < 0 || p.parryChance > 1) return `parryChance must be in [0, 1] (got ${p.parryChance})`;
  if (p.parryChance + p.blockChance > 1) return `parryChance + blockChance must be ≤ 1 — one roll decides parry | block | neither (got ${p.parryChance + p.blockChance})`;
  const rg = p.regroupBelowStam, re = p.reengageStam;
  if ((rg === undefined) !== (re === undefined)) return 'regroupBelowStam and reengageStam must be set together (a retreat needs both edges of the hysteresis)';
  if (rg !== undefined && re !== undefined && !(re > rg)) return `reengageStam (${re}) must be > regroupBelowStam (${rg}) — else the retreat can never end`;
  return null;
});

AIProfiles.registerAll([
  { ...BASE, id: 'ai.rusher', name: 'Rusher', approach: 'rush', sight: 210, reaction: 0.16, blockChance: 0.15 }, // fodder blocks occasionally, never parries
  { ...BASE, id: 'ai.flanker', name: 'Flanker', approach: 'flank', sight: 220, blockChance: 0.2, parryChance: 0.03 },
  { ...BASE, id: 'ai.kiter', name: 'Kiter', approach: 'kite', sight: 250, preferredRange: 170, reaction: 0.14 },
  { ...BASE, id: 'ai.guard', name: 'Guard', approach: 'guard', sight: 190, leash: 260, loseSightSec: 2, guardRadius: 200, reaction: 0.24, wanderTether: 70, blockChance: 0.35, parryChance: 0.05 }, // disciplined post-holders
  // a boss-grade fencer: reads windups and answers with the guard — the unit that TEACHES the player feints
  { ...BASE, id: 'ai.duelist', name: 'Duelist', approach: 'rush', sight: 230, reaction: 0.14, blockChance: 0.4, parryChance: 0.12 },
  // a GUARD MASTER: the guard test dummy — sharp reaction + heavy BLOCK uptime (0.6), currently no parry.
  // The counter is the FEINT (bait the guard, then punish the whiffed block). EXPERIMENT: also a TACTICAL
  // fighter — it breaks off when its stamina runs low (≤30%), WALKS back to spacing to regen (no sprint, or
  // it'd drain the bar it's refilling), and re-engages fresh (≥75%). The rhythm: pressure → back off → breathe.
  { ...BASE, id: 'ai.master', name: 'Guard Master', approach: 'guard', sight: 230, reaction: 0.1, guardRadius: 520, leash: 900, blockChance: 0.6, parryChance: 0, regroupBelowStam: 0.3, reengageStam: 0.75 },
  { ...BASE, id: 'ai.coward', name: 'Coward', approach: 'kite', sight: 210, leash: 9999, loseSightSec: 1.5, preferredRange: 9999, fleeBelowHp: 1 },
  // townsfolk: wander their spot, defend it from anything hostile that comes close, flee when badly hurt — never hunt
  { ...BASE, id: 'ai.townsfolk', name: 'Townsfolk', approach: 'guard', sight: 220, leash: 160, loseSightSec: 2.5, guardRadius: 120, fleeBelowHp: 0.45, reaction: 0.3, wanderTether: 70 },
  // passive wildlife (cows/pigs): graze near their spawn, hunt no one (sight 0 = oblivious), bolt when struck
  { ...BASE, id: 'ai.critter', name: 'Critter', approach: 'guard', sight: 0, passive: true, turnSpeed: 2.2, leash: 200, loseSightSec: 1 },
]);

export type Move = 'approach' | 'away' | 'home' | 'hold';
export interface CombatStance {
  move: Move;
  attack: boolean;
  /** The unit's NEXT tactical-retreat state (stamina hysteresis) — the brain writes it back to bb.regrouping
   *  so this pure fn stays stateless. Undefined ⇒ the profile has no retreat behavior. */
  regroup?: boolean;
}

/** How far a regrouping unit backs off to catch its breath (px), if the profile has no explicit kite range. */
const REGROUP_SPACING = 190;

/**
 * Pure decision: given a profile + the current geometry/resources, what should the unit do this frame? Kept
 * pure (no world/entity refs) so it's unit-testable. The brain handles *how* to move (pathfinding) + flank
 * offset, and persists `regroup` back to the blackboard.
 *
 * `stamFrac` = current stamina / max (0..1). `wasRegrouping` = the unit's retreat state coming in (bb flag),
 * so the stamina hysteresis (regroupBelowStam ↓ … reengageStam ↑) has memory without this fn holding state.
 */
export function combatStance(
  p: AIProfileDef,
  dist: number,
  reach: number,
  hpRatio: number,
  targetDistFromHome: number,
  stamFrac = 1,
  wasRegrouping = false,
): CombatStance {
  if (p.fleeBelowHp != null && hpRatio <= p.fleeBelowHp) return { move: 'away', attack: false, regroup: false };
  if (p.approach === 'guard' && targetDistFromHome > (p.guardRadius ?? 200)) return { move: 'home', attack: false, regroup: false };

  // TACTICAL RETREAT: if the profile manages stamina, break off when spent and hold spacing to regen, then
  // re-engage once recovered. Hysteresis (enter ≤ regroupBelowStam, exit ≥ reengageStam) so it doesn't jitter
  // at the threshold — a real "back off, breathe, come back with a full combo" rhythm rather than flailing empty.
  let regroup = wasRegrouping;
  if (p.regroupBelowStam !== undefined && p.reengageStam !== undefined) {
    if (regroup) { if (stamFrac >= p.reengageStam) regroup = false; }
    else if (stamFrac <= p.regroupBelowStam) regroup = true;
    if (regroup) {
      const spacing = p.preferredRange ?? REGROUP_SPACING;
      // back off if too close (recover at range); if already spaced, HOLD there (don't creep back yet). Never
      // attack while regrouping — the whole point is to not spend the last of the bar.
      return { move: dist < spacing ? 'away' : 'hold', attack: false, regroup };
    }
  }

  if (p.approach === 'kite') {
    if (dist < (p.preferredRange ?? 160)) return { move: 'away', attack: false, regroup };
    const inReach = dist <= reach;
    return { move: inReach ? 'hold' : 'approach', attack: inReach, regroup };
  }

  // rush / flank / guard-while-engaging
  const inReach = dist <= reach;
  return { move: inReach ? 'hold' : 'approach', attack: inReach, regroup };
}
