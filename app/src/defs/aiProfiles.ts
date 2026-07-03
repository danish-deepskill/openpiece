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
  return null;
});

AIProfiles.registerAll([
  { ...BASE, id: 'ai.rusher', name: 'Rusher', approach: 'rush', sight: 210, reaction: 0.16 },
  { ...BASE, id: 'ai.flanker', name: 'Flanker', approach: 'flank', sight: 220 },
  { ...BASE, id: 'ai.kiter', name: 'Kiter', approach: 'kite', sight: 250, preferredRange: 170, reaction: 0.14 },
  { ...BASE, id: 'ai.guard', name: 'Guard', approach: 'guard', sight: 190, leash: 260, loseSightSec: 2, guardRadius: 200, reaction: 0.24, wanderTether: 70 },
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
}

/**
 * Pure decision: given a profile and the current geometry, what should the unit do this frame? Kept pure
 * (no world/entity refs) so it's unit-testable. The brain handles *how* to move (pathfinding) + flank offset.
 */
export function combatStance(
  p: AIProfileDef,
  dist: number,
  reach: number,
  hpRatio: number,
  targetDistFromHome: number,
): CombatStance {
  if (p.fleeBelowHp != null && hpRatio <= p.fleeBelowHp) return { move: 'away', attack: false };
  if (p.approach === 'guard' && targetDistFromHome > (p.guardRadius ?? 200)) return { move: 'home', attack: false };

  if (p.approach === 'kite') {
    if (dist < (p.preferredRange ?? 160)) return { move: 'away', attack: false };
    const inReach = dist <= reach;
    return { move: inReach ? 'hold' : 'approach', attack: inReach };
  }

  // rush / flank / guard-while-engaging
  const inReach = dist <= reach;
  return { move: inReach ? 'hold' : 'approach', attack: inReach };
}
