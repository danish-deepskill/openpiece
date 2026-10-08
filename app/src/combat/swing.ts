import { clamp } from '../core/math';
import { Weapons } from '../defs/layers';
import type { Entity, MeleeSwing } from '../ecs/components';
import type { AbilityShape } from './Ability';
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
}

/** The acting body's geometry the pose needs: its size, natural unarmed reach, and held-weapon length. */
export interface SwingGeom {
  r: number;
  reach: number;
  weaponLen: number;
}

/** Fist radius as a fraction of body radius — SHARED by the hitbox (MeleeSystem) and the render (actorDraws),
 *  which is the only thing keeping "the drawn fist IS the hitbox" true. Change it here or nowhere. */
export const HAND_R_FRAC = 0.45;

/** Build the entity's swing geometry ONCE — MeleeSystem (hitbox) and actorDraws (visual) must call this same
 *  helper so their geometry can never drift apart. */
export function swingGeomOf(e: Entity): SwingGeom {
  const wv = e.equipment?.weapon ? Weapons.get(e.equipment.weapon).visual : undefined;
  return { r: e.transform!.r, reach: e.attributes?.get('reach') ?? 0, weaponLen: wv?.length ?? 0 };
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

/** Which hand is acting THIS frame: the RUBBER-ARM flurry (Gomu Gatling) alternates hands jab-by-jab over the
 *  ACTIVE phase, matching its jab hit windows. Every other motion keeps the lead hand — a blade flurry whips the
 *  blade, not the grip (keying this off `jabs` alone made the fists swap hilts ~6×/s through Kamaitachi). */
export function activeSide(s: MeleeSwing, shape: AbilityShape): number {
  const jabs = shape.jabs ?? 1;
  if (s.motion !== 'stretch' || jabs <= 1) return s.side;
  const p = clamp(s.dur > 0 ? s.t / s.dur : 1, 0, 1);
  const w = s.phases.windup;
  const aEnd = s.phases.windup + s.phases.active;
  const local = clamp((p - w) / Math.max(0.0001, aEnd - w), 0, 1);
  const jab = Math.min(jabs - 1, Math.floor(local * jabs));
  return jab % 2 === 0 ? s.side : -s.side; // L → R → L → R …
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
  const [bx, by] = guardHand(s.angle, activeSide(s, shape), g.r); // a flurry alternates which hand throws
  const reach = stretchLen(p, shape.range, shape.jabs ?? 1, shape.stretchMode === 'grab', s.phases);
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
 *  The hand stays on the lead side (a two-handed blade doesn't hop hands): only the blade whips. */
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
  const [hx, hy] = guardHand(ang, s.side, g.r);
  const len = g.weaponLen > 0 ? g.weaponLen : Math.max(g.r * 0.95, g.reach);
  return { drawAngle: ang, hx, hy, tx: hx + Math.cos(ang) * len, ty: hy + Math.sin(ang) * len };
};

const MOTIONS: Record<string, Motion> = { stab, arc, stretch, gore, axe, shot, flurry };

/**
 * Acting-hand + weapon/fist tip + body orientation at the current point in a swing. The swing INSTANCE carries
 * only runtime state (which hand, how far in); the swing TYPE — its motion + params — lives on `shape` (data),
 * so adding swing types never grows the component. Shared by the renderer (draw) and MeleeSystem (contact), so
 * the blade you see is the hitbox.
 */
export function swingPose(s: MeleeSwing, shape: AbilityShape, g: SwingGeom): SwingPose {
  const p = clamp(s.dur > 0 ? s.t / s.dur : 1, 0, 1);
  // a FOOT attack strikes with the LEG, not the held weapon — so its geom carries NO weaponLen (else the stab
  // motion takes the short "armed poke" branch and the drawn foot falls short of the long kick hitbox, even
  // though the weapon is irrelevant to a kick). Also apply the per-strike reach mult (short jab < 1, long kick > 1).
  const reach = shape.reachMul && shape.reachMul !== 1 ? g.reach * shape.reachMul : g.reach;
  const geom = shape.limb === 'foot' ? { ...g, reach, weaponLen: 0 } : reach !== g.reach ? { ...g, reach } : g;
  return (MOTIONS[s.motion] ?? arc)(s, shape, geom, p);
}
