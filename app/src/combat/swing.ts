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
 *  ease back to neutral through the recovery. */
function twist(p: number, half: number, ph: AttackPhases): number {
  const amp = Math.max(TWIST_MIN, half * TWIST_GAIN);
  const w = ph.windup;
  const aEnd = ph.windup + ph.active;
  if (p < w) return amp * (p / Math.max(0.0001, w)); // 0 → +amp  (the load = the tell)
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
  if (jabs > 1) {
    const local = clamp((p - w) / Math.max(0.0001, aEnd - w), 0, 1);
    return len * Math.sin(((local * jabs) % 1) * Math.PI); // still at rest through windup; ends retracted
  }
  if (grab) {
    if (p < aEnd) {
      const q = p / Math.max(0.0001, aEnd);
      return len * (1 - (1 - q) * (1 - q)); // shoot the arm forward to full reach (the grab)
    }
    return len * (1 - (p - aEnd) / Math.max(0.0001, 1 - aEnd)); // retract as the body rockets up to the anchor
  }
  const back = len * STRETCH_BACK;
  if (p < w) return -back * (p / Math.max(0.0001, w)); // cock back — the rubber telegraph
  if (p < aEnd) {
    const q = (p - w) / Math.max(0.0001, aEnd - w);
    return -back + (len + back) * (1 - (1 - q) * (1 - q)); // snap out to full reach (ease-out)
  }
  const q = (p - aEnd) / Math.max(0.0001, 1 - aEnd);
  return len * (1 - q * q); // retract
}

/** Which hand is acting THIS frame: a flurry (Gomu Gatling) alternates hands jab-by-jab (over the ACTIVE
 *  phase, matching the jab hit windows); otherwise it's fixed. */
export function activeSide(s: MeleeSwing, jabs: number): number {
  if (jabs <= 1) return s.side;
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

/** STAB: a forward poke from the acting hand's guard spot — short with a weapon, a full jab bare. Poised
 *  through the windup (the tell), thrusts OUT through the active phase, pulls back through the recovery. */
const stab: Motion = (s, _shape, g, p) => {
  const [bx, by] = guardHand(s.angle, s.side, g.r);
  // bare thrust = whatever closes the gap from the guard to just inside `reach` (+0.15r margin — the
  // fist's own radius covers the rest), so the drawn fist reaches the sim range wherever the guard sits
  const thrustDist = g.weaponLen > 0 ? g.r * ARMED_POKE : Math.max(0, g.reach - g.r * (GUARD_FWD_FRAC + 0.15));
  const w = s.phases.windup;
  const aEnd = s.phases.windup + s.phases.active;
  const thrust =
    p <= w
      ? 0
      : p <= aEnd
        ? thrustDist * Math.sin(((p - w) / Math.max(0.0001, aEnd - w)) * (Math.PI / 2)) // out through active
        : thrustDist * Math.cos(((p - aEnd) / Math.max(0.0001, 1 - aEnd)) * (Math.PI / 2)); // back through recovery
  const hx = bx + Math.cos(s.angle) * thrust;
  const hy = by + Math.sin(s.angle) * thrust;
  return { drawAngle: s.angle, hx, hy, tx: hx + Math.cos(s.angle) * g.weaponLen, ty: hy + Math.sin(s.angle) * g.weaponLen };
};

/** ARC: the body twists and the swing sweeps. Armed → hand stays home, blade reaches; bare → arm extends to reach. */
const arc: Motion = (s, shape, g, p) => {
  const ang = s.angle + twist(p, shape.arc, s.phases);
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
  const [bx, by] = guardHand(s.angle, activeSide(s, shape.jabs ?? 1), g.r); // a flurry alternates which hand throws
  const reach = stretchLen(p, shape.range, shape.jabs ?? 1, shape.stretchMode === 'grab', s.phases);
  return { drawAngle: s.angle, hx: bx, hy: by, tx: bx + Math.cos(s.angle) * reach, ty: by + Math.sin(s.angle) * reach };
};

/** Strategy registry. A new MOTION is one entry here; the 1000 swing *types* are just data (AbilityDef.shape). */
const MOTIONS: Record<string, Motion> = { stab, arc, stretch };

/**
 * Acting-hand + weapon/fist tip + body orientation at the current point in a swing. The swing INSTANCE carries
 * only runtime state (which hand, how far in); the swing TYPE — its motion + params — lives on `shape` (data),
 * so adding swing types never grows the component. Shared by the renderer (draw) and MeleeSystem (contact), so
 * the blade you see is the hitbox.
 */
export function swingPose(s: MeleeSwing, shape: AbilityShape, g: SwingGeom): SwingPose {
  const p = clamp(s.dur > 0 ? s.t / s.dur : 1, 0, 1);
  // a per-strike reach multiplier (short jab < 1, long kick > 1); stretch motions ignore it (they use shape.range)
  const geom = shape.reachMul && shape.reachMul !== 1 ? { ...g, reach: g.reach * shape.reachMul } : g;
  return (MOTIONS[s.motion] ?? arc)(s, shape, geom, p);
}
