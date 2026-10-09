import { clamp } from '../core/math';
import { isPair, Weapons } from '../defs/layers';
import type { Entity, MeleeSwing } from '../ecs/components';
import type { AbilityDef, AbilityShape } from './Ability';
import type { AttackPhases } from './phases';

const HAND_SPREAD = 1.09; // IDLE hand angle off the aim axis (rad) — the EXACT MIRROR of the old hanging
//                           stance (π − 2.05): arms rest on the FACING side per the perspective model,
//                           same distance and spread as the approved sketch pose, just flipped.
const HAND_BASE = 0.95; // ×r hand distance from center (idle and guard alike)
const HAND_FWD = -0.1; // ×r idle nudge — mirrored with the stance (slightly back toward the body center)
const GUARD_SPREAD = 0.95; // COMBAT hand angle (rad) — fists up, forward; every swing motion works from here
const GUARD_FWD = 0.25; // ×r guard forward nudge

/** Forward component of the guard hand (×r) — DERIVED so the stab thrust always reaches `reach` from
 *  wherever the guard sits (was a hardcoded 0.95 that silently assumed the guard's old numbers). */
const GUARD_FWD_FRAC = Math.cos(GUARD_SPREAD) * HAND_BASE + GUARD_FWD;
const ARMED_POKE = 0.7; // ×r forward poke for an armed stab (a weapon's length does the long reaching)
const TWIST_MIN = 0.7; // rad — minimum body-twist amplitude for an arc swing
const TWIST_GAIN = 1.4; // twist amplitude grows with the ability's arc half-angle
/** The `shape.arc` that makes an arc swing turn EXACTLY one full revolution over its active phase (the cut sweeps
 *  2 × arc × TWIST_GAIN rad) — a spinning slash is authored with this, never a magic 2.24. */
export const FULL_TURN_ARC = Math.PI / TWIST_GAIN;
const STRETCH_BACK = 0.35; // how far (×reach) the fist cocks behind its rest spot before the punch (a big pull)
// NOTE: every motion's sub-timeline (load/cut/recover, cock/punch/retract) derives from the SWING'S RESOLVED
// PHASES (MeleeSwing.phases — windup/active/recover). There is ONE attack clock; the old WIND/CUT/STRETCH_*
// constants were a second, disagreeing timeline and are gone. Hits land while the motion travels: the
// windup is the visible tell, the active phase is the strike, the recovery is the follow-through.

/** IDLE local position of a hand (side -1/+1) for a body oriented at `angle` — arms hanging at the sides.
 *  Purely how a non-swinging hand is DRAWN; no hit geometry derives from it. */
export function restHand(angle: number, side: number, r: number): [number, number] {
  return [
    Math.cos(angle + side * HAND_SPREAD) * r * HAND_BASE + Math.cos(angle) * r * HAND_FWD,
    Math.sin(angle + side * HAND_SPREAD) * r * HAND_BASE + Math.sin(angle) * r * HAND_FWD,
  ];
}

/** COMBAT (guard) position of a hand — every swing MOTION operates from here (fists up, forward), so all
 *  reach/tip geometry is guard-derived. Splitting idle (restHand) from guard lets art move the resting
 *  stance freely without shifting a single hitbox. */
export function guardHand(angle: number, side: number, r: number): [number, number] {
  return [
    Math.cos(angle + side * GUARD_SPREAD) * r * HAND_BASE + Math.cos(angle) * r * GUARD_FWD,
    Math.sin(angle + side * GUARD_SPREAD) * r * HAND_BASE + Math.sin(angle) * r * GUARD_FWD,
  ];
}

export interface SwingPose {
  drawAngle: number; // body orientation to lay out hands (aim + twist on an arc swing)
  hx: number; // acting (lead) hand, LOCAL
  hy: number;
  tx: number; // weapon/fist tip, LOCAL (far end of the hitbox)
  ty: number;
  /** Limb SIZE multiplier for this frame (default 1). The axe-kick (Gomu Ono) scales the drawn foot UP as the
   *  leg 'rises to the sky', then back to 1 as it slams — the top-down read of a vertical rise. Renderer-only. */
  scale?: number;
  /** The lead BLADE's angle when it differs from the body's orientation (drawAngle) — a sheathed blade points back
   *  along the hip while the body still faces the target. Unset ⇒ the blade lies along drawAngle (every other motion). */
  bladeAngle?: number;
  /** The OFF hand's pose when a motion poses BOTH hands (a two-blade form): grip + its blade's angle, LOCAL. Unset ⇒
   *  the off hand rests / guards per the draw's defaults (the pair's idle blade waits at guard through a cut). */
  off?: { hx: number; hy: number; angle: number };
}

/** The acting body's geometry the pose needs: its size, natural unarmed reach, and held-weapon length. */
export interface SwingGeom {
  r: number;
  reach: number;
  weaponLen: number;
  /** A blade in EACH hand (WeaponDef.grip.hold 'each'): a flurry's cuts alternate hands — each blade cuts in turn. */
  pair: boolean;
  /** The body's WORLD center — the one pose that needs it is the blade LOCK (its contact point is a world point). */
  x: number;
  y: number;
}

/** Fist radius as a fraction of body radius — SHARED by the hitbox (MeleeSystem) and the render (actorDraws),
 *  which is the only thing keeping "the drawn fist IS the hitbox" true. Change it here or nowhere. */
export const HAND_R_FRAC = 0.45;

/** The drawn length (px) of the weapon in `e`'s hand — 0 bare. The ONE read of a blade's length: the hitbox
 *  (swingGeomOf), the render and the AI's reach estimate (abilityReach) all take it from the weapon row's visual,
 *  so a weapon retune moves all three together and no ability row ever restates it. */
export function weaponLenOf(e: Entity): number {
  return (e.equipment?.weapon ? Weapons.get(e.equipment.weapon).visual?.length : undefined) ?? 0; // a visual-less weapon row (a bare-hands kit) swings nothing
}

/** Build the entity's swing geometry ONCE — MeleeSystem (hitbox) and actorDraws (visual) must call this same
 *  helper so their geometry can never drift apart. */
export function swingGeomOf(e: Entity): SwingGeom {
  const t = e.transform!;
  return { r: t.r, reach: e.attributes?.get('reach') ?? 0, weaponLen: weaponLenOf(e), pair: isPair(e.equipment?.weapon), x: t.x, y: t.y };
}

/**
 * Effective reach of an ability — what the AI engages at and what targeting probes (the real hit is by contact
 * with the pose, MeleeSystem). It's a one-number estimate of the pose's tip: a bare fist reaches an arm's length
 * (`bodyReach`); an armed swing keeps the arm home (≈0.3·reach, the guard hand) and the WEAPON does the reaching
 * (`weaponLen` — measured within 1 px of the swung tip for every weapon). A foot strike ignores the held weapon
 * (swingPose's rule: a kick is the leg). Pistol / shot / stretch reach their authored fixed range.
 */
export function abilityRange(ab: AbilityDef, bodyReach: number, weaponLen = 0): number {
  if (!ab.shape) return 0;
  if (ab.shape.swing !== 'melee' || ab.shape.pattern === 'stretch') return ab.shape.range!; // boot-validated > 0 for a fixed-reach shape
  // a swing that carries launch cues TRAVELS: each impulse covers speed × duration, so the brain engages a dash-cut
  // from where the step will land it, not from blade range (that's the whole point of a lunge)
  const travel = (ab.launchAt?.length ?? 0) * (ab.selfImpulse ?? 0) * (ab.impulseDur ?? 0.16);
  return Math.round(steelReach(ab, bodyReach, weaponLen) + travel);
}

/** The STEEL's reach, unrounded: how far from the body center the strike's tip gets — the arm home + the blade, or the
 *  arm/foot extended. The one term abilityRange and strikeRange share. */
function steelReach(ab: AbilityDef, bodyReach: number, weaponLen: number): number {
  const len = ab.shape!.limb === 'foot' ? 0 : weaponLen; // callers checked `shape`
  const arm = len > 0 ? 0.3 : 1; // armed → arm stays home; bare → arm extends fully
  return bodyReach * arm * (ab.shape!.reachMul ?? 1) + len;
}

/** How far the STRIKE itself reaches from the body — the steel, WITHOUT any step the swing carries. What a swing VISUAL may
 *  claim: the flurry crescent drawn at abilityRange painted the cut where the step would END, a hitbox that was never there
 *  ("what you see is what hits" cuts both ways — a visual may not out-reach the steel either). The brain keeps abilityRange. */
export function strikeRange(ab: AbilityDef, bodyReach: number, weaponLen = 0): number {
  if (!ab.shape) return 0;
  if (ab.shape.swing !== 'melee' || ab.shape.pattern === 'stretch') return ab.shape.range!;
  return Math.round(steelReach(ab, bodyReach, weaponLen));
}

/** abilityRange for THIS wielder: its body reach + whatever it holds. The call every system makes (brains,
 *  targeting probes, the debug ring) so the reach they agree on is the hitbox's own geometry. */
export function abilityReach(e: Entity, ab: AbilityDef): number {
  return abilityRange(ab, e.attributes?.get('reach') ?? 0, weaponLenOf(e));
}

/** strikeRange for THIS wielder — the radius a swing visual may be drawn at. */
export function strikeReach(e: Entity, ab: AbilityDef): number {
  return strikeRange(ab, e.attributes?.get('reach') ?? 0, weaponLenOf(e));
}

/** Body twist for an arc swing, phase-driven: LOAD to one side through the windup (the visible rear-back —
 *  a heavy's long windup reads as a long, dodgeable telegraph), CUT across through the active phase, then
 *  ease back to neutral through the recovery. `charge` = snap to the load in the FIRST 40% of windup then HOLD
 *  it cocked until the cut (a Sekiro-style charge-up tell) instead of a linear drift. */
function twist(p: number, half: number, ph: AttackPhases, charge: boolean): number {
  const amp = Math.max(TWIST_MIN, half * TWIST_GAIN);
  const w = ph.windup;
  const aEnd = ph.windup + ph.active;
  if (p < w) {
    const u = p / Math.max(0.0001, w); // 0 → 1 across the windup
    // charge: ease to full load over the first 40% of windup, then HOLD at +amp (the visible cock-and-wait).
    // linear: drift steadily to +amp across the whole windup.
    const load = charge ? Math.min(1, u / 0.4) : u;
    return amp * load; // → +amp  (the load = the tell)
  }
  if (p < aEnd) return amp - 2 * amp * ((p - w) / Math.max(0.0001, aEnd - w)); // +amp → −amp  (the cut)
  return -amp * (1 - (p - aEnd) / Math.max(0.0001, 1 - aEnd)); // −amp → 0  (the follow-through)
}

/**
 * Gomu rubber-arm reach along the aim, phase-driven (ONE clock with the hitbox):
 *  - flurry (jabs > 1): pumps its out-and-back jabs through the ACTIVE phase only — exactly the span the
 *    synthesized per-jab hit windows cover, so the arms and the damage can't desync.
 *  - grab: shoots forward through windup+active (full reach at the moment launchAt fires), then retracts.
 *  - punch (default): cocks BACK through the windup, snaps out through the active, retracts through recovery.
 */
function stretchLen(p: number, len: number, jabs: number, grab: boolean, ph: AttackPhases): number {
  const w = ph.windup;
  const aEnd = ph.windup + ph.active;
  const back = len * STRETCH_BACK; // the rubber cock-back distance — shared by all three modes as the WINDUP tell
  // ALL modes cock BACK through the windup (the readable telegraph — before, the flurry sat still and the grab
  // shot straight out, so neither had a windup tell; now every rubber attack visibly winds up first).
  const cock = p < w ? -back * Math.sin((p / Math.max(0.0001, w)) * (Math.PI / 2)) : 0;
  if (p < w) return cock;
  if (jabs > 1) {
    const local = clamp((p - w) / Math.max(0.0001, aEnd - w), 0, 1);
    return len * Math.sin(((local * jabs) % 1) * Math.PI); // pump the jabs through the ACTIVE phase; ends retracted
  }
  if (grab) {
    if (p < aEnd) {
      const q = (p - w) / Math.max(0.0001, aEnd - w);
      return -back + (len + back) * (1 - (1 - q) * (1 - q)); // shoot from the cocked-back position to full reach
    }
    // SNAP the arm back over the FIRST HALF of the recovery (not the whole thing) — the rubber yanks the body
    // to the anchor, so the arm should be pulled in fast as he lands, not left drifting stretched out.
    const q = clamp((p - aEnd) / Math.max(0.0001, (1 - aEnd) * 0.5), 0, 1);
    return len * (1 - q) * (1 - q); // ease-OUT retract (fast at first) — reads as a quick pull-in
  }
  // punch (Pistol/Stamp)
  if (p < aEnd) {
    const q = (p - w) / Math.max(0.0001, aEnd - w);
    return -back + (len + back) * (1 - (1 - q) * (1 - q)); // snap out to full reach (ease-out)
  }
  const q = (p - aEnd) / Math.max(0.0001, 1 - aEnd);
  return len * (1 - q * q); // retract
}

/** A FLURRY's cut count — ONE source: the authored windows when there are any (each window IS a cut), else the
 *  synthesized `jabs`. The flurry motion and the FX trail both whip this many times, so they can never disagree
 *  with the hits (the old `jabs`-beside-`hitVolumes` pair had to be kept equal by hand). */
export function flurryCuts(shape: AbilityShape): number {
  return Math.max(1, shape.hitVolumes?.length ?? shape.jabs ?? 1);
}

/** Which hand is acting THIS frame. A multi-cut swing alternates hands cut-by-cut over the ACTIVE phase (matching its
 *  per-cut hit windows) when there is a striking tool in EACH hand: the RUBBER-ARM flurry (Gomu Gatling — two fists)
 *  and a blade flurry under a PAIR hold (nitōryū — two blades: lead cut, off cut, lead cut …). A flurry with ONE blade
 *  keeps the lead hand — it whips the blade, not the grip (keying this off `jabs` alone made the fists swap hilts
 *  ~6×/s through Kamaitachi). The hold is data (WeaponDef.grip), read through the swing geometry. */
export function activeSide(s: MeleeSwing, shape: AbilityShape, g: SwingGeom): number {
  const cuts = flurryCuts(shape);
  const alternates = cuts > 1 && (s.motion === 'stretch' || (s.motion === 'flurry' && g.pair));
  if (!alternates) return s.side;
  const p = clamp(s.dur > 0 ? s.t / s.dur : 1, 0, 1);
  const w = s.phases.windup;
  const aEnd = s.phases.windup + s.phases.active;
  const local = clamp((p - w) / Math.max(0.0001, aEnd - w), 0, 1);
  const cut = Math.min(cuts - 1, Math.floor(local * cuts));
  return cut % 2 === 0 ? s.side : -s.side; // L → R → L → R …
}

/**
 * A motion archetype (Strategy): maps the swing's progress `p` + the TYPE's params (`shape`, data) + the body's
 * geometry to a pose. The instance carries no per-type fields, so adding motions never grows MeleeSwing.
 */
type Motion = (s: MeleeSwing, shape: AbilityShape, g: SwingGeom, p: number) => SwingPose;

/** How far the hand/weapon COCKS BACK (×r) during a stab's windup — the visible tell that a thrust is coming,
 *  so a defender can read it (before this the hand sat motionless through windup and the stab had no telegraph). */
const STAB_COCK = 0.55;

/** STAB: cocks BACK through the windup (the readable tell), thrusts OUT through the active phase, pulls back
 *  to guard through recovery. A short poke with a weapon, a full jab bare. */
const stab: Motion = (s, _shape, g, p) => {
  const [bx, by] = guardHand(s.angle, s.side, g.r);
  // bare thrust = whatever closes the gap from the guard to just inside `reach` (+0.15r margin — the
  // fist's own radius covers the rest), so the drawn fist reaches the sim range wherever the guard sits
  const thrustDist = g.weaponLen > 0 ? g.r * ARMED_POKE : Math.max(0, g.reach - g.r * (GUARD_FWD_FRAC + 0.15));
  const cock = g.r * STAB_COCK; // pull-back distance during windup
  const w = s.phases.windup;
  const aEnd = s.phases.windup + s.phases.active;
  const thrust =
    p <= w
      ? -cock * Math.sin((p / Math.max(0.0001, w)) * (Math.PI / 2)) // COCK BACK: 0 → −cock through the windup (the tell)
      : p <= aEnd
        // out through active: sweep from the cocked-back position (−cock) forward to full thrust
        ? -cock + (thrustDist + cock) * Math.sin(((p - w) / Math.max(0.0001, aEnd - w)) * (Math.PI / 2))
        : thrustDist * Math.cos(((p - aEnd) / Math.max(0.0001, 1 - aEnd)) * (Math.PI / 2)); // back to guard through recovery
  const hx = bx + Math.cos(s.angle) * thrust;
  const hy = by + Math.sin(s.angle) * thrust;
  return { drawAngle: s.angle, hx, hy, tx: hx + Math.cos(s.angle) * g.weaponLen, ty: hy + Math.sin(s.angle) * g.weaponLen };
};

/** GORE (headbutt): the HEAD itself is the hitbox — exactly like the hero's FIST is the punch hitbox, minus the
 *  left/right hand mechanic (a bull has one head). The pose is a COMPACT zone AT the head, which LUNGES forward
 *  along facing during the swing (rears back on windup, thrusts out through active, pulls back on recovery). Both
 *  the renderer (drawBull) and MeleeSystem read this one pose, so the drawn head IS the damage — "what you see is
 *  what hits". `hx,hy` = head center; `tx,ty` = its leading edge (a short segment ≈ the head circle, NOT a long
 *  fan). The head-sized width comes from the ability's authored hitVolume. */
const gore: Motion = (s, _shape, g, p) => {
  const rest = g.r * 1.35; // the head's resting distance ahead of center (matches drawQuadruped's head anchor)
  const w = s.phases.windup;
  const aEnd = s.phases.windup + s.phases.active;
  // the head's distance ahead of center this instant: rear back a touch on windup (tell), lunge to `reach` on
  // active, ease back on recovery. It's the HEAD position, not a reaching tip.
  const headFwd =
    p <= w
      ? rest - g.r * 0.25 * Math.sin((p / Math.max(0.0001, w)) * (Math.PI / 2)) // rear back (the wind-up tell)
      : p <= aEnd
        ? rest - g.r * 0.25 + (g.reach - rest + g.r * 0.25) * Math.sin(((p - w) / Math.max(0.0001, aEnd - w)) * (Math.PI / 2)) // lunge to reach
        : rest + (g.reach - rest) * Math.cos(((p - aEnd) / Math.max(0.0001, 1 - aEnd)) * (Math.PI / 2)); // pull back
  const cx = Math.cos(s.angle) * headFwd;
  const cy = Math.sin(s.angle) * headFwd;
  // hx→tx is a SHORT segment centered on the head (a compact capsule ≈ the head circle), not a body-to-tip fan
  const half = g.r * 0.4;
  return {
    drawAngle: s.angle,
    hx: cx - Math.cos(s.angle) * half,
    hy: cy - Math.sin(s.angle) * half,
    tx: cx + Math.cos(s.angle) * half,
    ty: cy + Math.sin(s.angle) * half,
  };
};

/** ARC: the body twists and the swing sweeps. Armed → hand stays home, blade reaches; bare → arm extends to reach. */
const arc: Motion = (s, shape, g, p) => {
  const ang = s.angle + twist(p, shape.arc, s.phases, shape.chargeHold === true);
  if (g.weaponLen > 0) {
    const [hx, hy] = guardHand(ang, s.side, g.r); // hand held up at guard; the blade does the reaching
    return { drawAngle: ang, hx, hy, tx: hx + Math.cos(ang) * g.weaponLen, ty: hy + Math.sin(ang) * g.weaponLen };
  }
  const dist = Math.max(g.r * 0.95, g.reach); // bare fist swings out to arm's length
  const hx = Math.cos(ang) * dist;
  const hy = Math.sin(ang) * dist;
  return { drawAngle: ang, hx, hy, tx: hx, ty: hy };
};

/** STRETCH: the Gomu rubber arm — shoulder (hx) → fist (tx) IS the hitbox. punch/grab/flurry come from the def. */
const stretch: Motion = (s, shape, g, p) => {
  const [bx, by] = guardHand(s.angle, activeSide(s, shape, g), g.r); // a flurry alternates which hand throws
  const reach = stretchLen(p, shape.range!, shape.jabs ?? 1, shape.stretchMode === 'grab', s.phases); // range: boot-validated > 0 for a stretch
  return { drawAngle: s.angle, hx: bx, hy: by, tx: bx + Math.cos(s.angle) * reach, ty: by + Math.sin(s.angle) * reach };
};

/** Foot scale at the peak of the rise (×) — the drawn foot swells BIG as the leg towers to the sky (top-down
 *  "height"). Deliberately large (may cover the character at peak) so the towering-leg tell reads unmistakably. */
const AXE_PEAK_SCALE = 3.2;

/** AXE (Gomu Ono): an overhead axe-KICK. The foot rises straight UP OVER THE BODY (centered, not offset) and
 *  SCALES UP BIG through the windup (the leg towering to the sky — the readable tell; the scale IS the height in
 *  top-down), then CRASHES back down to normal as it slams (active) and settles through recovery. Centered on the
 *  actor so the slam reads as landing on his own spot (matching the AoE, which is centered on the body). */
const axe: Motion = (s, _shape, g, p) => {
  const w = s.phases.windup;
  // rise fraction over the WINDUP: climb to the peak in the first ~65% of windup, then CRASH down to 0 (planted)
  // by the END of windup — so the foot is on the GROUND exactly when the active phase begins and the AoE fires
  // (AbilitySystem lands the slam at windup-end). "What you see is what hits": the impact = the foot touching down,
  // not the foot still hanging at its peak. Active/recover keep it planted (rise 0) — the follow-through of the slam.
  const RISE_PEAK = 0.65; // fraction of the windup spent CLIMBING; the rest is the crash-down
  let rise: number;
  if (p <= w) {
    const u = p / Math.max(0.0001, w); // 0 → 1 across the windup
    rise = u <= RISE_PEAK
      ? Math.sin((u / RISE_PEAK) * (Math.PI / 2)) // ease UP to the peak (the leg towers — the tell)
      : 1 - (u - RISE_PEAK) / (1 - RISE_PEAK); // then CRASH down to 0, landing right at windup-end (= impact)
  } else rise = 0; // planted through active + recovery (the slam has already connected)
  // CENTERED on the body (no up-screen lift, no forward offset): the foot rises straight up over him and slams
  // on his own spot. The height is conveyed purely by SCALE (top-down: a bigger foot = higher up), so it reads as
  // "leg towers overhead, then stomps down here" rather than a foot drifting off to one side.
  const half = g.r * 0.3; // a compact foot capsule (before the scale multiplies it)
  return {
    drawAngle: s.angle,
    hx: -Math.cos(s.angle) * half,
    hy: -Math.sin(s.angle) * half,
    tx: Math.cos(s.angle) * half,
    ty: Math.sin(s.angle) * half,
    scale: 1 + rise * (AXE_PEAK_SCALE - 1), // foot swells BIG as it towers, back to 1 as it slams
  };
};

/** SHOT recoil: how far (×r) the shouldered weapon + hands KICK BACK along the aim on fire. A gun doesn't
 *  swing — the whole "animation" is a raise-to-aim hold, a sharp rearward jolt as it fires, then a settle. */
const SHOT_KICK = 0.5;

/** SHOT: a firearm's recoil (musket). The hands hold at guard (weapon shouldered, barrel forward along the
 *  aim — the aiming pose) through the windup, JOLT BACKWARD along the aim at the fire instant (active), then
 *  ease forward back to the aim rest through recovery. Visual-only (the ability is noHit — the ball is the
 *  hit). drawAngle stays on the TRUE aim — the body BLADE (a bladed firing stance) is applied ONCE in
 *  actorDraws (bodyA), the SAME place the idle-aim blade lives, so firing and idle-aiming tilt identically. */
const shot: Motion = (s, _shape, g, p) => {
  const [bx, by] = guardHand(s.angle, s.side, g.r); // shouldered/aiming from the guard hand
  const w = s.phases.windup;
  const aEnd = s.phases.windup + s.phases.active;
  const kick = g.r * SHOT_KICK;
  const back =
    p <= w
      ? 0 // aiming — steady on target through the windup (no sway; a settle model is #19's follow-up)
      : p <= aEnd
        ? -kick * Math.sin(((p - w) / Math.max(0.0001, aEnd - w)) * Math.PI) // JOLT back then already returning (a sharp recoil pulse)
        : 0; // settled back to the aim rest through recovery
  const hx = bx + Math.cos(s.angle) * back;
  const hy = by + Math.sin(s.angle) * back;
  return { drawAngle: s.angle, hx, hy, tx: hx + Math.cos(s.angle) * g.weaponLen, ty: hy + Math.sin(s.angle) * g.weaponLen };
};

/** Strategy registry. A new MOTION is one entry here; the 1000 swing *types* are just data (AbilityDef.shape). */
/** FLURRY (Kamaitachi): `jabs` rapid ALTERNATING blade sweeps through the ACTIVE phase — each sub-cut carries the
 *  blade from one side to the other, the next comes back the other way — timed to the per-cut hit windows (the
 *  authored/synthesized volumes slice the active phase the same way), so what you see is what hits. The windup
 *  cocks to the lead side and HOLDS (the charge tell); the recovery settles from wherever the last cut ended.
 *  ONE blade: the hand stays on the lead side (a two-handed blade doesn't hop hands) and only the blade whips. A
 *  PAIR: the cuts alternate hands (activeSide) — each blade's sweep crosses from its own side. */
const flurry: Motion = (s, shape, g, p) => {
  const half = Math.max(TWIST_MIN, shape.arc * TWIST_GAIN);
  const cuts = flurryCuts(shape);
  const w = s.phases.windup;
  const aEnd = w + s.phases.active;
  let off: number;
  if (p < w) {
    off = half * Math.min(1, p / Math.max(0.0001, w) / 0.4); // cock to +half over the first 40% of windup, then hold
  } else if (p < aEnd) {
    const local = (p - w) / Math.max(0.0001, aEnd - w);
    const cut = Math.min(cuts - 1, Math.floor(local * cuts));
    const u = local * cuts - cut; // 0 → 1 within THIS cut
    const dir = cut % 2 === 0 ? 1 : -1; // +half → −half, then back, then …
    off = dir * (half - 2 * half * u);
  } else {
    const endOff = (cuts % 2 === 0 ? 1 : -1) * half; // where the last cut came to rest
    off = endOff * (1 - (p - aEnd) / Math.max(0.0001, 1 - aEnd)); // settle to center through recovery
  }
  const ang = s.angle + off;
  const [hx, hy] = guardHand(ang, activeSide(s, shape, g), g.r);
  const len = g.weaponLen > 0 ? g.weaponLen : Math.max(g.r * 0.95, g.reach);
  return { drawAngle: ang, hx, hy, tx: hx + Math.cos(ang) * len, ty: hy + Math.sin(ang) * len };
};

/** CROSS CUT — the two-blade dash-through iai (Rashōmon), a motion that poses BOTH hands:
 *   windup   both hands draw BACK to the hips, the blades turning to point behind him — the sheathe (the tell);
 *   the step  (after the cue, until `landed`) the blades stay tucked: he passes THROUGH with nothing drawn — no cut yet;
 *   landed    over CROSS_SNAP of the swing both blades SNAP OUT ahead into an X (lead to one side, off to the other) —
 *             the drawn instant the trail volume fires behind him — then ease back to guard through the rest.
 *  The body keeps facing the aim throughout (drawAngle = s.angle); only the blades turn (bladeAngle / off.angle). Hit
 *  geometry is NOT the blades here (a 'trail' volume is the cut), so the poses are free to read well. */
const SHEATHE_BACK = 2.35; // rad off the aim where a sheathed hand sits (behind the shoulder, each side)
const SHEATHE_DIST = 0.95; // ×r — the hand's distance from center while sheathed
const CROSS_SPREAD = 1.05; // rad each blade opens off the aim in the X (lead −, off +)
const CROSS_SNAP = 0.1; // fraction of the swing the snap-out takes after landing
const crossCut: Motion = (s, _shape, g, p) => {
  const w = s.phases.windup;
  const len = g.weaponLen > 0 ? g.weaponLen : g.r;
  const hand = (side: number, sheathe: number): [number, number] => {
    // lerp guard → hip by `sheathe` (0 = at guard, 1 = fully sheathed back)
    const [gx, gy] = guardHand(s.angle, side, g.r);
    const hx = Math.cos(s.angle + side * SHEATHE_BACK) * g.r * SHEATHE_DIST;
    const hy = Math.sin(s.angle + side * SHEATHE_BACK) * g.r * SHEATHE_DIST;
    return [gx + (hx - gx) * sheathe, gy + (hy - gy) * sheathe];
  };
  // the blade's angle per phase: forward (guard) → back along the hip (sheathed) → out in the X → forward again
  let sheathe: number; // 0..1 how far back the hands are
  let open: number; // 0..1 how far the X has opened (only after landing)
  if (!s.landed) {
    sheathe = p < w ? Math.sin((p / Math.max(0.0001, w)) * (Math.PI / 2)) : 1; // ease back through the windup, then HOLD through the step
    open = 0;
  } else {
    const since = (s.t - (s.landedAt ?? s.t)) / Math.max(0.0001, s.dur); // swing-clock fraction since the landing
    const pLand = p - since; // where in the swing he landed (attack speed and dash length move it — hence the landing clock)
    const u = clamp(since / CROSS_SNAP, 0, 1);
    sheathe = 1 - u; // hands come forward as the blades snap out
    // the X opens fully at the snap, then eases back toward forward through whatever remains of the swing
    const settle = clamp((since - CROSS_SNAP) / Math.max(0.0001, 1 - pLand - CROSS_SNAP), 0, 1);
    open = u * (1 - settle);
  }
  const bladeOf = (side: number): number => s.angle + sheathe * side * Math.PI * 0.85 - open * side * CROSS_SPREAD; // back along the hip when sheathed, out to the side in the X
  const [hx, hy] = hand(s.side, sheathe);
  const [ox, oy] = hand(-s.side, sheathe);
  const bladeAngle = bladeOf(s.side);
  return {
    drawAngle: s.angle,
    bladeAngle,
    hx, hy,
    tx: hx + Math.cos(bladeAngle) * len,
    ty: hy + Math.sin(bladeAngle) * len,
    off: { hx: ox, hy: oy, angle: bladeOf(-s.side) },
  };
};

/** TWIN CLEAVE — the two-sword great cut (Nigori Zake), a motion that poses BOTH hands: through the windup both hands
 *  rise TOGETHER to the lead side, the blades parallel and pointing back (charge-held — the tell); through the active
 *  phase they come down ACROSS the whole front in one sweep, the torso twisting with the blow; the recovery eases them
 *  back to guard from the far side. ONE cut, not two alternating — both edges land as one blow (the row authors one
 *  window). The off hand rides a hand's width inside the lead so the two blades read as a parallel pair. */
const CLEAVE_RAISE = 1.7; // rad off the aim where the raised hands sit (high on the lead side, behind the shoulder)
const CLEAVE_SWEEP = 3.3; // rad the hands travel across the front, lead side → far side
const CLEAVE_PAIR = 0.35; // rad between the lead hand and the off hand along the sweep (the parallel blades' gap)
const CLEAVE_BLADE = 0.9; // rad the blades lean past the hands: back on the raise, forward on the far side
const CLEAVE_TWIST = 0.5; // rad the torso twists with the sweep (±)
const twinCleave: Motion = (s, shape, g, p) => {
  const w = s.phases.windup;
  const aEnd = w + s.phases.active;
  const len = g.weaponLen > 0 ? g.weaponLen : g.r;
  const side = s.side;
  let raise: number; // 0 = hands at guard, 1 = fully into the cleave's arc
  let sweep: number; // 0 = raised on the lead side, 1 = swept to the far side
  if (p < w) {
    raise = Math.min(1, p / Math.max(0.0001, w) / 0.4); // up over the first 40% of the windup, then HOLD (chargeHold's beat)
    sweep = 0;
  } else if (p < aEnd) {
    raise = 1;
    sweep = (p - w) / Math.max(0.0001, aEnd - w);
  } else {
    raise = 1 - (p - aEnd) / Math.max(0.0001, 1 - aEnd); // ease home from the far side
    sweep = 1;
  }
  const phi = s.angle + side * (CLEAVE_RAISE - CLEAVE_SWEEP * sweep); // the lead hand's angle on the arc
  const bladeArc = phi + side * CLEAVE_BLADE * (1 - 2 * sweep); // the blades lean back on the raise, forward on the far side
  const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
  const onArc = (ang: number, dist: number): [number, number] => [Math.cos(ang) * g.r * dist, Math.sin(ang) * g.r * dist];
  const [glx, gly] = guardHand(s.angle, side, g.r);
  const [gox, goy] = guardHand(s.angle, -side, g.r);
  const [alx, aly] = onArc(phi, 1.05);
  const [aox, aoy] = onArc(phi - side * CLEAVE_PAIR * (1 - 2 * sweep), 0.85); // the off hand a step INSIDE the lead, either side of the sweep
  const hx = lerp(glx, alx, raise);
  const hy = lerp(gly, aly, raise);
  const bladeAngle = s.angle + angleDiffSigned(bladeArc, s.angle) * raise; // from forward (guard) into the lean
  return {
    drawAngle: s.angle + side * CLEAVE_TWIST * (1 - 2 * sweep) * raise,
    bladeAngle,
    hx, hy,
    tx: hx + Math.cos(bladeAngle) * len,
    ty: hy + Math.sin(bladeAngle) * len,
    off: { hx: lerp(gox, aox, raise), hy: lerp(goy, aoy, raise), angle: bladeAngle }, // parallel: the same lean
  };
};
/** Signed shortest turn from `from` to `to` (rad, in (−π, π]). */
function angleDiffSigned(to: number, from: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/** SCISSORS — the Nigiri double cuts, both blades at once from the guard hands: `in` = the blades start spread WIDE (±arc
 *  off the aim) and close together in front, the tips meeting (Tōrō, the rising climb read top-down as a closing V);
 *  `out` = crossed in front and sweeping OUT to ±arc (Samon, the pattern cut — an opening V). The hands cock back a
 *  touch through the windup (the tell) and stay home; the blades do the moving. Both blades HIT (two off/lead segments
 *  on the row). `shape.arc` IS the spread, so a wider scissor is a row knob. */
const SCISSOR_TIGHT = 0.1; // rad each blade stops short of the aim when closed — a hair apart, never overlapping
const SCISSOR_COCK = 0.25; // ×r the hands pull back through the windup
/** The OPENING cut's FOLLOW-THROUGH: after the cut the blades keep going — out and WAY BACK past the shoulders (to this angle
 *  off the aim), the hands swinging back with them — over the first part of the recovery, then return to guard. The power
 *  of the blow is read in how far it carries; nothing hits during it (the volumes close with the active phase). */
const SCISSOR_FOLLOW = 2.45; // rad off the aim the blades reach at the end of the follow-through (pointing behind him)
const SCISSOR_FOLLOW_AT = 0.45; // fraction of the recovery spent carrying through; the rest returns to guard
const SCISSOR_FOLLOW_HAND = 2.2; // rad off the aim the hands swing back to (each side), at ×r SCISSOR_FOLLOW_DIST
const SCISSOR_FOLLOW_DIST = 0.9;
const scissor = (dir: 'in' | 'out'): Motion => (s, shape, g, p) => {
  const w = s.phases.windup;
  const aEnd = w + s.phases.active;
  const len = g.weaponLen > 0 ? g.weaponLen : g.r;
  const wide = Math.max(SCISSOR_TIGHT, shape.arc);
  const [from, to] = dir === 'in' ? [wide, SCISSOR_TIGHT] : [SCISSOR_TIGHT, wide];
  let spread: number; // each blade's angle off the aim (lead +, off −)
  let cock: number;
  let carry = 0; // the opening cut's follow-through: 0 = hands at guard, 1 = swung all the way back
  if (p < w) {
    const u = p / Math.max(0.0001, w);
    spread = from * Math.min(1, u / 0.6); // blades swing to the start pose over the first 60% of the windup, then hold
    cock = SCISSOR_COCK * Math.sin(u * (Math.PI / 2));
  } else if (p < aEnd) {
    const u = (p - w) / Math.max(0.0001, aEnd - w);
    spread = from + (to - from) * u; // the cut
    cock = SCISSOR_COCK * (1 - u);
  } else {
    const u = (p - aEnd) / Math.max(0.0001, 1 - aEnd);
    cock = 0;
    if (dir === 'out') {
      // follow-through: carry on past the cut to SCISSOR_FOLLOW (ease-out), then come back to forward
      carry = u < SCISSOR_FOLLOW_AT ? Math.sin((u / SCISSOR_FOLLOW_AT) * (Math.PI / 2)) : 1 - (u - SCISSOR_FOLLOW_AT) / (1 - SCISSOR_FOLLOW_AT);
      spread = u < SCISSOR_FOLLOW_AT ? to + (SCISSOR_FOLLOW - to) * carry : SCISSOR_FOLLOW * carry;
    } else spread = to * (1 - u); // the closing cut just settles to forward
  }
  const side = s.side;
  const back = (x: number, y: number): [number, number] => [x - Math.cos(s.angle) * g.r * cock, y - Math.sin(s.angle) * g.r * cock];
  const swung = (hand: [number, number], hs: number): [number, number] => {
    // the hand's follow-through: from its guard spot toward a spot behind the shoulder on its own side
    const bx = Math.cos(s.angle + hs * SCISSOR_FOLLOW_HAND) * g.r * SCISSOR_FOLLOW_DIST;
    const by = Math.sin(s.angle + hs * SCISSOR_FOLLOW_HAND) * g.r * SCISSOR_FOLLOW_DIST;
    return [hand[0] + (bx - hand[0]) * carry, hand[1] + (by - hand[1]) * carry];
  };
  const [hx, hy] = swung(back(...guardHand(s.angle, side, g.r)), side);
  const [ox, oy] = swung(back(...guardHand(s.angle, -side, g.r)), -side);
  const bladeAngle = s.angle + side * spread;
  return { drawAngle: s.angle, bladeAngle, hx, hy, tx: hx + Math.cos(bladeAngle) * len, ty: hy + Math.sin(bladeAngle) * len, off: { hx: ox, hy: oy, angle: s.angle - side * spread } };
};
const scissorIn = scissor('in');
const scissorOut = scissor('out');

/** TWIN THRUST — both blades thrust forward SIDE BY SIDE from the guard hands (Hirameki, the flash): cock back through the
 *  windup, shoot out through the active, draw back through the recovery — the stab's timeline with two points. The blades
 *  angle a hair INWARD so the two tips CONVERGE at full extension: the narrowest hit of the chain is also its longest. */
const PINCER = 0.12; // rad each blade leans toward the aim — the tips meet ~len out
const twinThrust: Motion = (s, _shape, g, p) => {
  const len = g.weaponLen > 0 ? g.weaponLen : g.r;
  const w = s.phases.windup;
  const aEnd = w + s.phases.active;
  const cock = g.r * STAB_COCK;
  const poke = g.r * ARMED_POKE;
  const thrust =
    p <= w
      ? -cock * Math.sin((p / Math.max(0.0001, w)) * (Math.PI / 2))
      : p <= aEnd
        ? -cock + (poke + cock) * Math.sin(((p - w) / Math.max(0.0001, aEnd - w)) * (Math.PI / 2))
        : poke * Math.cos(((p - aEnd) / Math.max(0.0001, 1 - aEnd)) * (Math.PI / 2));
  const side = s.side;
  const fwd = (x: number, y: number): [number, number] => [x + Math.cos(s.angle) * thrust, y + Math.sin(s.angle) * thrust];
  const [hx, hy] = fwd(...guardHand(s.angle, side, g.r));
  const [ox, oy] = fwd(...guardHand(s.angle, -side, g.r));
  const bladeAngle = s.angle - side * PINCER;
  return { drawAngle: s.angle, bladeAngle, hx, hy, tx: hx + Math.cos(bladeAngle) * len, ty: hy + Math.sin(bladeAngle) * len, off: { hx: ox, hy: oy, angle: s.angle + side * PINCER } };
};

/** THE BLADE LOCK's pose (MeleeSwing.lock — combat/clash): the lead blade AIMED at the contact point with its tip ON it, the
 *  hand brought forward as far as an arm reaches so the two tips meet where the steel rang; the body squared to the bind.
 *  A pair's off blade comes up beside the lead, pressing the same way. Replaces the motion's pose for the hold — the cut
 *  that produced the clash may have been a scissor pointing two ways or a blade on the other's body (the mutual blow), and
 *  neither READS as blades crossed. Visual only: no hit geometry is tested while a swing is locked. */
const LOCK_ARM_MAX = 1.15; // ×r — how far from center a hand may reach to put the tip on the contact
const LOCK_ARM_MIN = 0.55; // ×r — never pulled inside the body
const LOCK_HAND_SIDE = 0.3; // ×r — the lead hand sits a little to its own side of the line to the contact (a natural grip)
/** THE STRUGGLE — two balanced forces on one point tremble, they don't sit still. Three small motions, all on the lock's own
 *  clock (deterministic; they pause with the sim): the CONTACT vibrates along the line between the fighters (both tips
 *  shake together — the proof they touch the same thing), each BLADE's angle trembles with its own phase (the two never move
 *  as one rigid piece), and each BODY leans in a hair, breathing slowly (pushing, not posing). The amplitude dies over the
 *  hold's last third so the break reads as the pressure giving way. No shake here (the contact tick's job), no sliding
 *  along the other blade (that would read as a disengage). Visual only. */
const LOCK_VIBRATE_PX = 2; // the contact's travel along the line, each way
const LOCK_VIBRATE_HZ = 14;
const LOCK_TREMBLE_RAD = 0.035; // ≈2° of blade tremble
const LOCK_TREMBLE_HZ = 11;
const LOCK_LEAN_PX = 2.5; // the body's lean toward the contact
const LOCK_LEAN_HZ = 2;
function lockPose(s: MeleeSwing, g: SwingGeom): SwingPose {
  const lock = s.lock!; // callers checked
  const dx = lock.x - g.x;
  const dy = lock.y - g.y;
  const aim = Math.atan2(dy, dx);
  const len = g.weaponLen > 0 ? g.weaponLen : g.r * HAND_R_FRAC; // bare hands: the fist is the steel
  // the struggle: elapsed on the lock's clock, amplitude fading over the last third of the hold
  const elapsed = lock.hold - lock.t;
  const amp = clamp(lock.t / Math.max(0.0001, lock.hold / 3), 0, 1);
  const phase = lock.emits ? 0 : Math.PI / 2; // the two sides of one lock tremble out of step
  const vibrate = LOCK_VIBRATE_PX * amp * Math.sin(elapsed * LOCK_VIBRATE_HZ * Math.PI * 2);
  const lean = LOCK_LEAN_PX * amp * (0.5 + 0.5 * Math.sin(elapsed * LOCK_LEAN_HZ * Math.PI * 2));
  const ang = aim + LOCK_TREMBLE_RAD * amp * Math.sin(elapsed * LOCK_TREMBLE_HZ * Math.PI * 2 + phase);
  const along = clamp(Math.hypot(dx, dy) - len, LOCK_ARM_MIN * g.r, LOCK_ARM_MAX * g.r) + vibrate + lean; // the hand so the tip lands on the contact
  const sx = -Math.sin(aim) * s.side * LOCK_HAND_SIDE * g.r;
  const sy = Math.cos(aim) * s.side * LOCK_HAND_SIDE * g.r;
  const hx = Math.cos(aim) * along + sx;
  const hy = Math.sin(aim) * along + sy;
  const offAng = aim - LOCK_TREMBLE_RAD * amp * Math.sin(elapsed * LOCK_TREMBLE_HZ * Math.PI * 2 + phase + 1.3); // the pair's second blade on its own tremble
  const off = g.pair ? { hx: Math.cos(aim) * along * 0.85 - sx, hy: Math.sin(aim) * along * 0.85 - sy, angle: offAng } : undefined; // a touch behind, on the other side of the line
  return { drawAngle: aim, bladeAngle: ang, hx, hy, tx: hx + Math.cos(ang) * len, ty: hy + Math.sin(ang) * len, off };
}

const MOTIONS: Record<string, Motion> = { stab, arc, stretch, gore, axe, shot, flurry, crossCut, twinCleave, scissorIn, scissorOut, twinThrust };
/** The motions that pose BOTH hands (SwingPose.off) — the only ones an off-blade hit volume can ride (abilityProblem). */
export const TWO_HAND_MOTIONS: ReadonlySet<string> = new Set(['crossCut', 'twinCleave', 'scissorIn', 'scissorOut', 'twinThrust']);

/**
 * Acting-hand + weapon/fist tip + body orientation at the current point in a swing. The swing INSTANCE carries
 * only runtime state (which hand, how far in); the swing TYPE — its motion + params — lives on `shape` (data),
 * so adding swing types never grows the component. Shared by the renderer (draw) and MeleeSystem (contact), so
 * the blade you see is the hitbox.
 */
export function swingPose(s: MeleeSwing, shape: AbilityShape, g: SwingGeom): SwingPose {
  if (s.lock) return lockPose(s, g); // steel met steel: the held pose is the bind itself, not wherever the cut happened to be
  const p = clamp(s.dur > 0 ? s.t / s.dur : 1, 0, 1);
  // a FOOT attack strikes with the LEG, not the held weapon — so its geom carries NO weaponLen (else the stab
  // motion takes the short "armed poke" branch and the drawn foot falls short of the long kick hitbox, even
  // though the weapon is irrelevant to a kick). Also apply the per-strike reach mult (short jab < 1, long kick > 1).
  const reach = shape.reachMul && shape.reachMul !== 1 ? g.reach * shape.reachMul : g.reach;
  const geom = shape.limb === 'foot' ? { ...g, reach, weaponLen: 0 } : reach !== g.reach ? { ...g, reach } : g;
  return (MOTIONS[s.motion] ?? arc)(s, shape, geom, p);
}
