import { Registry, type Def, type Validator } from '../core/Registry';
import type { CombatWeight } from '../combat/phases';

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
  /** LEAD AIM (s): predictive targeting — aim at where the target WILL be (perceived pos + its velocity × this),
   *  the Calamity-boss trick that beats circle-kiting. 0 (default) = aim where it IS (lagged), which a circling
   *  target dodges by drifting off the committed line; a positive value leads the aim so steady orbiting feeds it
   *  your FUTURE spot. The counter shifts from "just circle" to "CHANGE speed/direction". Tune ~0.2–0.4s: too high
   *  and it over-leads a stopping target (whiffs in front). Works WITH reaction (lag first, then lead the lagged pos). */
  leadAim?: number;
  faceSway: number; // idle facing sway (rad): keeps the aim alive, not a dead-on lock
  loseSightSec: number; // give-up timer after losing sight
  alertDur: number; // a hit makes it investigate its attacker for this long (s)
  /** SPOT DELAY (s): the beat between SEEING a target and committing to the chase — the "!" double-take. It holds,
   *  faces you, then pursues; if it loses sight during the delay it stands down. A sharp soldier reacts fast
   *  (~0.15s), a dozy thug slow (~0.5s). 0 ⇒ instant pursuit (no alert beat). Default 0.3 (via BASE). */
  spotDelay: number;
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
  /** Hold-spacing: while in reach, if it's crowded INSIDE this fraction of the strike distance (momentum/
   *  body-push shoved it point-blank), it leans back toward blade range WHILE STILL SWINGING — so a long-blade
   *  fighter drifts to blade distance instead of fighting chest-to-chest. Crucially it keeps attacking, so a
   *  target that pins it (walks into it) just gets hit point-blank rather than pushing it back forever. The gap
   *  from 1.0 is the no-jitter band. Default 0.72. */
  holdBackoffFrac?: number;
  preferredRange?: number; // kite: keep this much distance
  /** KITE melee-switch range (px): a ranged kiter this close is point-blank — the shot is useless, so it
   *  switches to its MELEE HEAVY (a musket's Buttstroke) to SHOVE the attacker off, then resumes kiting. Also
   *  the "cornered → turn and fight" trigger when it can't back off. Undefined ⇒ 0 (never melee-switches; a
   *  pure kiter that only ever flees + shoots). Set to a body-length or two for a gun with a butt. */
  meleeRange?: number;
  /** POINT-BLANK slot roll (0..1): when crowded inside meleeRange, the chance a KITER fires its first SLOT
   *  ability (the marine's Buckshot scatter) instead of the melee heavy (the Buttstroke shove). Rolled per
   *  point-blank decision (seeded `ai` stream). 0/undefined ⇒ always the shove. Needs a slot[0] to fire; falls
   *  back to the heavy if the slot is on cooldown. This is what makes rushing the marine a gamble (blast or shove). */
  pointBlankSlotChance?: number;
  /** KITE JUKE-ROLL chance (0..1): when a kiter starts a reposition beat, the chance it DASHES (rolls) to the
   *  spot instead of walking — a trained, evasive relocate (a marine dive-rolling to new cover). Rolled per
   *  reposition (seeded `ai` stream); needs the dash off cooldown, else it just walks. 0/undefined ⇒ always walks. */
  jukeRollChance?: number;
  // ── KITE BEAT personality (the discrete tactic loop, ai/brains) — per-profile because a sniper and a
  //    skirmisher differ on EXACTLY these (how long they settle, how wide they hold, how far they chase).
  /** How long (s) a planted kiter HOLDS the braced aim before firing — the spread cone settles over this window
   *  (a deliberate marksman lines up longer; a skirmisher snaps sooner at the cost of accuracy). */
  kiteAimTime: number;
  /** The breath (s) after a shot before the next beat (reposition/re-aim) — the rhythm of the loop. */
  kitePause: number;
  /** Reposition step distance (px) — how far one juke/backpedal/advance beat travels. */
  kiteStep: number;
  /** COMFORT BAND width (px): stands-and-shoots anywhere in [preferredRange, preferredRange + this] — the
   *  hysteresis zone that kills per-pixel following (crossing 1px can't flip a threshold; you cross the BAND). */
  kiteComfortWidth: number;
  /** Chance (0..1) a comfortably-in-band kiter JUKES after a shot (vs re-aiming in place) — lateral liveliness.
   *  0 = a statue that only moves when pushed out of band; ~0.4 = lively. */
  kiteJukeChance: number;
  /** Max committed ADVANCE steps chasing a fleeing target before it STOPS and shoots from range — a marksman
   *  holds a line, doesn't dog you per-pixel. Resets when the target returns to the comfort band. */
  kiteMaxChase: number;
  guardRadius?: number; // guard: only engage within this of its post
  fleeBelowHp?: number; // 0..1 HP fraction; flee below it
  /** Chance (0..1) to raise a BLOCK when its foe winds up in reach — rolled once per swing (guardCd), the
   *  same tryGuard the player's F key calls. 0 = never guards (fodder). Skill, expressed as data. */
  blockChance: number;
  /** Chance (0..1) to attempt the riskier PARRY instead (rolled before block — parry ⊂ the guard decision).
   *  Its timing is honest: the tap only lands if the foe's active phase falls inside the parry window. */
  parryChance: number;
  /** READS THE WEIGHT of what's coming: a per-weight override of `parryChance` keyed by the incoming swing's combat
   *  weight (combat/phases.swingWeight — the same classifier the posture table uses) — `{ medium: 0.8, heavy: 0.9 }`
   *  parries committed weapon blows almost always while jabs (light) keep the base rate: a read is spent where it
   *  pays. Unset weights fall back to `parryChance`. Each value + blockChance must stay ≤ 1 (one roll decides parry |
   *  block | neither — boot-validated). The INT ladder's first "tactical" rung, as a knob. */
  parryByWeight?: Partial<Record<CombatWeight, number>>;
  /** DODGE the tell (0..1 per incoming weight): the third outcome of the one guard roll — a SIDESTEP (the base roll, kept even
   *  when a style owns Q) thrown perpendicular to the foe so a committed blow whiffs, and the whiff is then an opening
   *  (pickAttack's riposte). parry + block + dodge per weight ≤ 1 (boot-validated). Unset ⇒ never dodges. */
  dodgeByWeight?: Partial<Record<CombatWeight, number>>;
  /** GUARD READS: choose the RIGHT guard, not a luckier one — never spend a parry on a blow the ladder says can't be parried
   *  (a coated technique's parryShift vs my letter; its share goes to dodge, else block), never block on a cracked guard
   *  (posture past CRACKED_GUARD — a break is worse than the hit; its share goes to dodge, else parry). Deterministic. */
  guardReads?: boolean;
  /** COMBO INTENT: don't walk a chain's FINISHER into air — if the previous step whiffed, let the window lapse; if the
   *  steps landed, always finish. The brain remembers whether its last swing hit (bb.lastSwingLanded). */
  comboIntent?: boolean;
  /** READS SITUATIONS: before the flat special roll, reach for a special FOR A REASON — the ability role tags (AI_ROLE_*):
   *  a gap closer when the foe is well out of reach, a guard breaker against a raised or cracked guard, a finisher under
   *  FINISHER_HP, a ranged poke at a regrouping foe. Each still gated by cooldown, cost, reach and tags. */
  readsSituations?: boolean;
  /** RANGED POKE (0..1, per DECISION beat — DECIDE_CADENCE): with the foe out of reach and a ranged-role special able to reach
   *  him, loose it at this chance instead of closing — the flying slash from across the ring. A regrouping foe is always
   *  worth it (no roll). Needs readsSituations. Unset ⇒ only the regrouper gets shot at. */
  rangedChance?: number;
  /** RIPOSTE (0..1): when the foe is STAGGERED (parried, guard-broken, rebounded, hit-stunned) inside the loadout
   *  HEAVY's reach, reach for the heavy at this chance instead of rolling the ordinary rotation — the opening a
   *  trained fighter never wastes. Still gated by the heavy's cooldown + stamina. 0/unset ⇒ fodder that jabs on. */
  punishChance?: number;
  /** PACE (the stance cycle, if the unit carries it): PUSH (Second Wind) when stamina falls under this fraction of today's
   *  bar while engaged; CONSERVE (Measured Breath) while regrouping; normal otherwise. Unset ⇒ never touches the stance. */
  pushBelowStam?: number;
  /** PACE by DANGER: PUSH (Second Wind) once HP falls to ≤ this fraction while engaged — the fight is going badly, borrow
   *  from tomorrow to turn it (the duelists: 0.6). Either trigger (this or pushBelowStam) is enough. Unset ⇒ HP never
   *  moves the stance. */
  pushBelowHp?: number;
  /** ABILITY ROTATION (0..1): chance PER swing to reach for a SPECIAL (the loadout's `heavy` + `slots` —
   *  a fruit's Stamp/Gatling/Rocket, a style's committed strike) instead of the fast primary jab. The
   *  candidates come from the unit's OWN loadout (generic — any fruit/style/weapon it carries joins), gated
   *  by cooldown + stamina + that ability's own reach. 0 (default) ⇒ fodder that only ever throws its primary;
   *  higher ⇒ a showy fighter (Luffy) that punctuates jabs with big rubber moves. Keep it MODEST — a special
   *  every swing reads as spammy and drains stamina instantly; ~0.3 gives a jab-jab-SPECIAL rhythm. */
  specialChance?: number;
  /** TACTICAL RETREAT (stamina management): when stamina drops to ≤ this FRACTION, break off and back to
   *  spacing to regen instead of flailing on an empty bar — a smart fighter saves its burst. Undefined ⇒
   *  fights to exhaustion (fodder). Pairs with `reengageStam` (hysteresis, so it doesn't jitter). */
  regroupBelowStam?: number;
  /** Re-engage once stamina recovers to ≥ this fraction (must be > regroupBelowStam — the hysteresis band).
   *  The gap between the two is how long it stays out regrouping: a wide band = long, patient resets. */
  reengageStam?: number;
  /** RETREAT ROLL: while REGROUPING (backing off to regen), burst with the loadout's dash/roll instead of
   *  walking — strategic direction (see rollSidewaysChance): a lateral juke around the target that resets
   *  spacing without fleeing, or straight back. A signature disengage (Luffy bouncing/circling to catch his
   *  breath) vs a plain backpedal. Needs a granted dash + the retreat band (regroupBelowStam/reengageStam);
   *  cooldown-gated so it's a rhythmic hop, not a constant blur. Undefined/false ⇒ a regrouping unit just walks. */
  retreatRoll?: boolean;
  /** Chance (0..1) the retreat roll goes SIDEWAYS (a lateral juke around the target) vs straight back. Higher =
   *  circles more / flees less — the anti-"he just runs away" knob. Default 0.7. Only read when retreatRoll. */
  rollSidewaysChance?: number;
  /** HARRY WHILE REGROUPING: a regrouping unit normally holds fire (banks the bar). With this, it still throws
   *  its CHEAP primary (a jab) when the target wanders into reach — so it never goes fully passive and keeps
   *  pressure on while resetting. The brain forces the primary only (no pricey specials) in this state, so the
   *  bar still climbs net-positive. Undefined/false ⇒ pure reset (no attacks while regrouping). */
  harryWhileRegroup?: boolean;
  /** ROCKET REPOSITION: chance (0..1), rolled ONCE when a PINNED regrouper commits, that it PLANS to LEAP THROUGH
   *  the target with its loadout HEAVY (Gomu Rocket aims along facing at the target; the long jump overshoots so
   *  he lands BEHIND them, slam hit on the way) instead of jabbing. Once planned (bb.plannedSpecial) he CONSERVES
   *  — stops jabbing so regen carries him to the heavy's cost — then fires. A committed mini-intent, so his own
   *  jabs can't starve the stamina the Rocket needs (that's why it works even at a low regroup entry). Needs a
   *  leaping loadout.heavy (selfImpulse/launchAt). Default 0 (never plans a reposition — just jabs while pinned). */
  rocketEscapeChance?: number;
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
  spotDelay: 1.5, // the default "!" double-take before pursuing — a deliberate ~1.5s beat (per-profile below)
  leash: 640,
  weaveAmp: 0.7,
  weaveFreq: 3.5,
  laneSpread: 70,
  wanderTurn: 5,
  wanderTether: 120,
  wanderSpeed: 24, // rides the 2026-07 ×0.8 locomotion re-base (an amble must stay slower than the new walk)
  dashMax: 130,
  chargeMax: 220,
  chargeDur: 0.7,
  chargeCd: 2,
  chargeStam: 25,
  strikeFrac: 0.8,
  betrayHpFrac: 0.8, // default: an ally that knocks off 20% of my HP has crossed the line
  blockChance: 0, // fodder doesn't guard — profiles that fight with intent override these
  parryChance: 0,
  // kite beat defaults (only kiters read them) — the tuned musketeer feel; a sniper/skirmisher overrides per row
  kiteAimTime: 0.6,
  kitePause: 0.5,
  kiteStep: 110,
  kiteComfortWidth: 150,
  kiteJukeChance: 0.4,
  kiteMaxChase: 2,
};

// validated at boot: brains divide by `reaction` and scale by `strikeFrac`, so a 0 or NaN here is not a
// tuning choice — it's a division-by-zero / never-strikes bug that must fail on load
/** The profile validator as a PURE function (the abilityProblem pattern): a problem string or null. Exported so a
 *  test can judge a bad row without registering it (a planted bad row poisons every later lookup in that file). */
export const aiProfileProblem: Validator<AIProfileDef> = (p) => {
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === 'number' && !Number.isFinite(v)) return `${k} must be finite (got ${v})`;
  }
  if (p.sight < 0) return `sight must be ≥ 0 (got ${p.sight})`;
  if (p.spotDelay < 0) return `spotDelay must be ≥ 0 (got ${p.spotDelay})`; // 0 = instant pursuit (skip the alert beat)
  if (!(p.reaction > 0)) return `reaction must be > 0 — brains compute 1/reaction (got ${p.reaction})`;
  if (!(p.strikeFrac > 0 && p.strikeFrac <= 1)) return `strikeFrac must be in (0, 1] (got ${p.strikeFrac})`;
  if (p.fleeBelowHp !== undefined && (p.fleeBelowHp < 0 || p.fleeBelowHp > 1)) return `fleeBelowHp must be in [0, 1] (got ${p.fleeBelowHp})`;
  if (p.punishChance !== undefined && !(p.punishChance >= 0 && p.punishChance <= 1)) return `punishChance must be in [0, 1] (got ${p.punishChance})`;
  if (p.pushBelowStam !== undefined && !(p.pushBelowStam >= 0 && p.pushBelowStam <= 1)) return `pushBelowStam must be in [0, 1] (got ${p.pushBelowStam})`;
  if (p.pushBelowHp !== undefined && !(p.pushBelowHp >= 0 && p.pushBelowHp <= 1)) return `pushBelowHp must be in [0, 1] (got ${p.pushBelowHp})`;
  if (p.rangedChance !== undefined && !(p.rangedChance >= 0 && p.rangedChance <= 1)) return `rangedChance must be in [0, 1] (got ${p.rangedChance})`;
  if (p.rangedChance !== undefined && p.readsSituations !== true) return 'rangedChance is read by the situation reads — set readsSituations too, or it is inert';
  if (p.dodgeByWeight) {
    for (const [w, v] of Object.entries(p.dodgeByWeight)) {
      if (v === undefined) continue;
      if (!(v >= 0 && v <= 1)) return `dodgeByWeight.${w} must be in [0, 1] (got ${v})`;
      const parry = p.parryByWeight?.[w as CombatWeight] ?? p.parryChance;
      if (parry + p.blockChance + v > 1 + 1e-9) return `dodgeByWeight.${w} (${v}) + parry (${parry}) + block (${p.blockChance}) exceed 1 — one roll decides parry | block | dodge | neither`;
    }
  }
  for (const [w, v] of Object.entries(p.parryByWeight ?? {})) {
    // the guard roll is ONE draw split parry | block | neither — an override that pushes the sum past 1 silently
    // loses the "neither" outcome for that weight (the brain would guard every such swing)
    if (!(v >= 0 && v <= 1)) return `parryByWeight.${w} must be in [0, 1] (got ${v})`;
    if (v + p.blockChance > 1) return `parryByWeight.${w} + blockChance must be ≤ 1 (got ${v} + ${p.blockChance})`;
  }
  if (p.betrayHpFrac < 0 || p.betrayHpFrac > 1) return `betrayHpFrac must be in [0, 1] (got ${p.betrayHpFrac})`;
  if (p.blockChance < 0 || p.blockChance > 1) return `blockChance must be in [0, 1] (got ${p.blockChance})`;
  if (p.parryChance < 0 || p.parryChance > 1) return `parryChance must be in [0, 1] (got ${p.parryChance})`;
  if (p.parryChance + p.blockChance > 1) return `parryChance + blockChance must be ≤ 1 — one roll decides parry | block | neither (got ${p.parryChance + p.blockChance})`;
  const rg = p.regroupBelowStam, re = p.reengageStam;
  if ((rg === undefined) !== (re === undefined)) return 'regroupBelowStam and reengageStam must be set together (a retreat needs both edges of the hysteresis)';
  if (rg !== undefined && re !== undefined && !(re > rg)) return `reengageStam (${re}) must be > regroupBelowStam (${rg}) — else the retreat can never end`;
  return null;
};

export const AIProfiles = new Registry<AIProfileDef>('AIProfiles', aiProfileProblem);

AIProfiles.registerAll([
  { ...BASE, id: 'ai.rusher', name: 'Rusher', approach: 'rush', sight: 210, reaction: 0.16, spotDelay: 2.0, blockChance: 0.15 }, // fodder blocks occasionally, never parries; the SLOWEST double-take (~2s)
  { ...BASE, id: 'ai.flanker', name: 'Flanker', approach: 'flank', sight: 220, spotDelay: 1.6, blockChance: 0.2, parryChance: 0.03 },
  { ...BASE, id: 'ai.kiter', name: 'Kiter', approach: 'kite', sight: 250, preferredRange: 170, reaction: 0.14 },
  // MUSKETEER (the Marine Officer): a ranged kiter tuned for the musket — keeps ~230px (well inside the shot's
  // ~340 range, so it can hit while back-pedalling), sees far (spots a shooter's target from range), quicker
  // reaction (aims sooner). leadAim so it leads a moving target with the SLOW ball (the shot travels — a
  // straight shot at where you ARE would always trail you). It stops to fire, then keeps its distance.
  // sight 460 > the musket's ~410 shot reach: a marksman SEES as far as it can SHOOT (else past sight the beat
  // loop stops and the old continuous chase creeps after your last-seen spot). faceSway 0: a steady bead.
  // (id was ai.ranger before the unit was renamed to Marine Officer; behavior UNCHANGED — just the id/name.)
  { ...BASE, id: 'ai.marineOfficer', name: 'Musketeer', approach: 'kite', sight: 460, preferredRange: 230, meleeRange: 46, reaction: 0.16, leadAim: 0.5, faceSway: 0, spotDelay: 1.2, pointBlankSlotChance: 0.4, jukeRollChance: 0.35 },
  { ...BASE, id: 'ai.guard', name: 'Guard', approach: 'guard', sight: 190, leash: 260, loseSightSec: 2, guardRadius: 200, reaction: 0.24, spotDelay: 1.2, wanderTether: 70, blockChance: 0.35, parryChance: 0.05 }, // disciplined post-holders — alert, quicker to react
  // a boss-grade fencer: reads windups and answers with the guard — the unit that TEACHES the player feints
  { ...BASE, id: 'ai.duelist', name: 'Duelist', approach: 'rush', sight: 230, reaction: 0.14, spotDelay: 1.0, blockChance: 0.4, parryChance: 0.12 }, // sharp: the fastest double-take (~1s)
  // RUBBER BRAWLER (Luffy): a protagonist-grade AGGRESSOR built around the Gomu fruit's stretchy gap-closers.
  // Not a fencer — he RUSHES and CHARGES relentlessly (long chargeMax + short chargeCd + low chargeStam = he
  // sprint-lunges into range again and again, the Gear-2 pressure feel) rather than sitting on a guard. Sharp
  // awareness (wide sight/cone, fast reaction, ~0.8s double-take) so he reads as skilled, not fodder. Modest
  // block, a touch of parry (only bites if he ever holds a weapon — unarmed can't parry) — he trades, not turtles.
  // stamina-aware BUT relentless: he fights nearly to EMPTY (retreats only ≤10%), so he burns his whole bar on
  // rubber specials before ever backing off — then takes a fuller reset to 60% (still ≥ a Gatling's 26, with room
  // for follow-ups). The wide 10→60 band = bigger, more separated bursts. He resets NOT by fleeing straight back
  // but by JUKING (retreatRoll + rollSidewaysChance 0.75: a lateral roll AROUND you that finds an angle without
  // opening distance) while STILL jabbing the cheap Pistol when you crowd him (harryWhileRegroup) — a slippery
  // circler that reloads, not a backpedaler. (The low entry means ~1-2 cheap jabs near empty before he bails; the
  // retreat trigger catches him within a jab of dropping below his special costs, so no sustained pistol decay.)
  { ...BASE, id: 'ai.luffy', name: 'Rubber Brawler', approach: 'rush', sight: 260, cone: 1.3, reaction: 0.12, leadAim: 0.28, spotDelay: 0.8, chargeMax: 300, chargeDur: 0.9, chargeCd: 1.2, chargeStam: 12, blockChance: 0.25, parryChance: 0.08, specialChance: 0.35, regroupBelowStam: 0.1, reengageStam: 0.6, retreatRoll: true, rollSidewaysChance: 0.75, harryWhileRegroup: true, rocketEscapeChance: 0.35 },
  // a GUARD MASTER: the guard test dummy — sharp reaction + heavy BLOCK uptime (0.6), currently no parry.
  // The counter is the FEINT (bait the guard, then punish the whiffed block). EXPERIMENT: also a TACTICAL
  // fighter — it breaks off when its stamina runs low (≤30%), WALKS back to spacing to regen (no sprint, or
  // it'd drain the bar it's refilling), and re-engages fresh (≥75%). The rhythm: pressure → back off → breathe.
  // SAMURAI — a RUSHER with a duelist's hands, built to CLOSE on a kiter and win the exchange: sharp reaction, a
  // sprint-charge that crosses the musket's 230–400px band in one go (chargeMax/Dur), real block AND parry odds
  // (the officer's buttstroke/kick are melee swings — parryable), specialChance so the iai punctuates the kesa
  // chain, and a regroup band so he doesn't empty the bar mid-duel. Kiai is fired by the generic buff beat.
  { ...BASE, id: 'ai.samurai', name: 'Samurai', approach: 'rush', sight: 260, cone: 1.2, reaction: 0.12, leadAim: 0.2, spotDelay: 0.8, chargeMax: 320, chargeDur: 0.8, chargeCd: 1.4, chargeStam: 12, blockChance: 0.3, parryChance: 0.3, dodgeByWeight: { heavy: 0.25 }, guardReads: true, readsSituations: true, rangedChance: 0.25, specialChance: 0.35, pushBelowStam: 0.3, regroupBelowStam: 0.15, reengageStam: 0.6 }, // a trained fighter: reads guards and situations; steps off a heavy a quarter of the time
  // the TRAINING DUMMY — sees nothing (sight 0), investigates nothing (alertDur 0), hugs its post (tether 0) and
  // ambles back to it after a shove: a body that takes hits and never answers. Everything else is BASE.
  { ...BASE, id: 'ai.dummy', name: 'Dummy', approach: 'guard', sight: 0, spotDelay: 0, alertDur: 0, leash: 0, wanderTether: 0, wanderSpeed: 24, blockChance: 0, parryChance: 0, betrayHpFrac: 0 },
  // the RONIN — approach 'guard': he HOLDS the arena (never chases a duel into the sea — the whole point of the walled
  // sand). Perception = the Samurai's (no special awareness: his edge is the counters). parryByWeight: he spends the
  // parry on committed blows (medium/heavy) and mostly lets jabs through; punish: a stagger is answered by the heavy.
  // ZORO — the challenger's brain: the Samurai's RUSH and charge (he goes TO the Ronin), the Ronin's reads (parries the
  // committed blows, ripostes a stagger) a shade less often — he trades, the Ronin counters — and pushes harder (specials
  // 0.45): the duel reads as pressure against precision. Utilities walk C then X (the coating, then the pump).
  { ...BASE, id: 'ai.zoro', name: 'Zoro', approach: 'rush', sight: 280, cone: 1.2, reaction: 0.12, leadAim: 0.2, spotDelay: 0.5, chargeMax: 320, chargeDur: 0.8, chargeCd: 1.4, chargeStam: 12, blockChance: 0.25, parryChance: 0.2, parryByWeight: { medium: 0.5, heavy: 0.45 }, dodgeByWeight: { medium: 0.2, heavy: 0.3 }, guardReads: true, comboIntent: true, readsSituations: true, rangedChance: 0.4, punishChance: 0.8, pushBelowHp: 0.6, specialChance: 0.45, regroupBelowStam: 0.12, reengageStam: 0.5 }, // pace: normal until the fight turns (HP ≤ 60%), then the push. The pressure fighter: parries less than the Ronin, presses more
  { ...BASE, id: 'ai.ronin', name: 'Ronin', approach: 'guard', sight: 260, cone: 1.2, reaction: 0.12, leadAim: 0.2, spotDelay: 0.8, guardRadius: 260, leash: 420, chargeMax: 300, chargeDur: 0.7, chargeCd: 1.2, chargeStam: 12, blockChance: 0.2, parryChance: 0.15, parryByWeight: { medium: 0.55, heavy: 0.45 }, dodgeByWeight: { medium: 0.25, heavy: 0.35 }, guardReads: true, comboIntent: true, readsSituations: true, rangedChance: 0.3, punishChance: 0.9, pushBelowHp: 0.6, specialChance: 0.4, regroupBelowStam: 0.12, reengageStam: 0.5 }, // pace: normal until the fight turns (HP ≤ 60%), then the push. The reader: parries, sidesteps, and punishes what misses
  { ...BASE, id: 'ai.master', name: 'Guard Master', approach: 'guard', sight: 230, reaction: 0.1, guardRadius: 520, leash: 900, blockChance: 0.6, parryChance: 0, regroupBelowStam: 0.3, reengageStam: 0.75 },
  { ...BASE, id: 'ai.coward', name: 'Coward', approach: 'kite', sight: 210, leash: 9999, loseSightSec: 1.5, preferredRange: 9999, fleeBelowHp: 1 },
  // townsfolk: wander their spot, defend it from anything hostile that comes close, flee when badly hurt — never hunt
  { ...BASE, id: 'ai.townsfolk', name: 'Townsfolk', approach: 'guard', sight: 220, leash: 160, loseSightSec: 2.5, guardRadius: 120, fleeBelowHp: 0.45, reaction: 0.3, wanderTether: 70 },
  // passive wildlife (cows/pigs): graze near their spawn, hunt no one (sight 0 = oblivious), bolt when struck
  { ...BASE, id: 'ai.critter', name: 'Critter', approach: 'guard', sight: 0, passive: true, turnSpeed: 2.2, leash: 200, loseSightSec: 1 },
  // TERRITORIAL BEAST (the bull): grazes UNTIL provoked — NOT passive, so a strike (→ grudge + alert) flips it
  // to CHASE its attacker rather than flee. It stays calm UNPROVOKED because wildlife is a NEUTRAL faction, so
  // nearestHostile finds nobody to hunt; the grudge from being hit is what first gives it a target — and only
  // THEN does its `sight` let it see + track that now-hostile attacker (sight can't manufacture a target out of
  // a neutral, so a big sight is safe here). A heavy turnSpeed cap = it LUMBERS + arcs (can't pivot on a dime —
  // circling it is the counter). Long leash/alert so once angry it commits. The charge is the sprint-charge.
  { ...BASE, id: 'ai.bull', name: 'Bull', approach: 'rush', sight: 300, cone: 1.4, turnSpeed: 1.6, leash: 900, loseSightSec: 4, alertDur: 6, chargeMax: 320, chargeDur: 1.0, chargeCd: 2.5, chargeStam: 15, reaction: 0.28 },
]);

export type Move = 'approach' | 'away' | 'home' | 'hold';
export interface CombatStance {
  move: Move;
  attack: boolean;
  /** The unit's NEXT tactical-retreat state (stamina hysteresis) — the brain writes it back to bb.regrouping
   *  so this pure fn stays stateless. Undefined ⇒ the profile has no retreat behavior. */
  regroup?: boolean;
}

/** A guard is CRACKED past this fraction of max posture — a reading brain stops blocking there (guardReads). */
export const CRACKED_GUARD = 0.6;
/** The stamina PUSH's hysteresis band: once pushing, a unit stays in Second Wind until its bar is this far ABOVE pushBelowStam
 *  (tryPace) — the push's own regen would otherwise flip it back every tick. */
export const PACE_PUSH_BAND = 0.2;
/** A foe at or under this HP fraction is a FINISHER's reason (readsSituations). */
export const FINISHER_HP = 0.3;
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
      // HARRIER PINNED IN REACH: if the target has crowded INTO melee range while a HARRYING unit is resetting,
      // backing off is futile (a corner/wall or a faster chaser = no space to make). Rather than roll into the
      // wall forever and eat free hits until the reset finishes, it TURNS AND FIGHTS — the same "cornered →
      // commit" instinct as a trapped fleer (line ~470). HOLD → the brain jabs (engaging + in reach); while
      // regrouping pickAttack forces the CHEAP primary, so the commit stays net-positive on stamina. THIS is the
      // fix for "cornered Luffy becomes a helpless punching bag" — he never just waits out the reset getting hit.
      if (p.harryWhileRegroup === true && dist <= reach) return { move: 'hold', attack: true, regroup };
      // Otherwise the classic reset: back off toward open space to regen (or HOLD once spaced — don't creep back
      // early). A non-harrier stays pure-conserve even when cornered (it would rather bank the bar than spend it).
      return { move: dist < spacing ? 'away' : 'hold', attack: false, regroup };
    }
  }

  if (p.approach === 'kite') {
    const pref = p.preferredRange ?? 160;
    const melee = p.meleeRange ?? 0;
    // POINT-BLANK: back off while still swinging. NOTE: for a RANGED kiter the discrete beat loop (ai/brains)
    // OWNS movement + the close-game move choice (Buttstroke/blast via role tags) — this branch is only the
    // FALLBACK stance for a kiter outside the beat loop (e.g. one without a ranged weapon).
    if (melee > 0 && dist <= melee) return { move: 'away', attack: true, regroup };
    if (dist < pref) return { move: 'away', attack: dist <= reach, regroup }; // too close → back off, still shooting
    const inReach = dist <= reach;
    return { move: inReach ? 'hold' : 'approach', attack: inReach, regroup }; // good spacing → hold + shoot
  }

  // rush / flank / guard-while-engaging
  const inReach = dist <= reach;
  return { move: inReach ? 'hold' : 'approach', attack: inReach, regroup };
}
