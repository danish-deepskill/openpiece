import { clamp } from '../core/math';
import { Weapons } from '../defs/layers';
import type { Entity, MeleeSwing } from '../ecs/components';
import type { AbilityShape } from './Ability';

const HAND_SPREAD = 0.95; // each hand's angle off the aim axis
const HAND_BASE = 0.95; // ×r resting hand distance from center
const HAND_FWD = 0.25; // ×r forward nudge
const ARMED_POKE = 0.7; // ×r forward poke for an armed stab (a weapon's length does the long reaching)
const TWIST_MIN = 0.7; // rad — minimum body-twist amplitude for an arc swing
const TWIST_GAIN = 1.4; // twist amplitude grows with the ability's arc half-angle
const WIND = 0.15; // arc-swing phases (fractions of the swing): load 0→WIND, cut WIND→CUT, recover CUT→1
const CUT = 0.6;
const STRETCH_WIND = 0.36; // stretch phases: cock back 0→WIND (a long wind-up), punch WIND→PUNCH, retract PUNCH→1
const STRETCH_PUNCH = 0.58;
const STRETCH_BACK = 0.35; // how far (×reach) the fist cocks behind its rest spot before the punch (a big pull)
const STRETCH_GRAB = 0.4; // grab phase: reach forward 0→GRAB, then retract GRAB→1 (Gomu Rocket)

/** Resting local position of a hand (side -1/+1) for a body oriented at `angle`. */
export function restHand(angle: number, side: number, r: number): [number, number] {
  return [
    Math.cos(angle + side * HAND_SPREAD) * r * HAND_BASE + Math.cos(angle) * r * HAND_FWD,
    Math.sin(angle + side * HAND_SPREAD) * r * HAND_BASE + Math.sin(angle) * r * HAND_FWD,
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

/** Body twist for an arc swing: ease to one side, sweep across to the other, then recover to neutral. */
function twist(p: number, half: number): number {
  const amp = Math.max(TWIST_MIN, half * TWIST_GAIN);
  if (p < WIND) return amp * (p / WIND); // 0 → +amp  (quick load, not a telegraph)
  if (p < CUT) return amp - 2 * amp * ((p - WIND) / (CUT - WIND)); // +amp → −amp  (the cut across)
  return -amp * (1 - (p - CUT) / (1 - CUT)); // −amp → 0  (recover to normal)
}

/**
 * Gomu rubber-arm reach along the aim, as a fraction of the swing.
 *  - flurry (jabs > 1): rapid out-and-back jabs (Gomu Gatling).
 *  - grab: shoots FORWARD with no wind-up, then retracts as the body launches up to it (Gomu Rocket).
 *  - punch (default): cocks the fist BACK, snaps it out to full length, then retracts (Gomu Pistol).
 */
function stretchLen(p: number, len: number, jabs: number, grab: boolean): number {
  if (jabs > 1) return len * Math.sin(((p * jabs) % 1) * Math.PI); // rapid out→back jabs
  if (grab) {
    if (p < STRETCH_GRAB) {
      const q = p / STRETCH_GRAB;
      return len * (1 - (1 - q) * (1 - q)); // shoot the arm forward to full reach (the grab)
    }
    return len * (1 - (p - STRETCH_GRAB) / (1 - STRETCH_GRAB)); // retract as the body rockets up to the anchor
  }
  const back = len * STRETCH_BACK;
  if (p < STRETCH_WIND) return -back * (p / STRETCH_WIND); // cock back
  if (p < STRETCH_PUNCH) {
    const q = (p - STRETCH_WIND) / (STRETCH_PUNCH - STRETCH_WIND);
    return -back + (len + back) * (1 - (1 - q) * (1 - q)); // snap out to full reach (ease-out)
  }
  const q = (p - STRETCH_PUNCH) / (1 - STRETCH_PUNCH);
  return len * (1 - q * q); // retract
}

/** Which hand is acting THIS frame: a flurry (Gomu Gatling) alternates hands jab-by-jab; otherwise it's fixed. */
export function activeSide(s: MeleeSwing, jabs: number): number {
  if (jabs <= 1) return s.side;
  const p = clamp(s.dur > 0 ? s.t / s.dur : 1, 0, 1);
  const jab = Math.min(jabs - 1, Math.floor(p * jabs));
  return jab % 2 === 0 ? s.side : -s.side; // L → R → L → R …
}

/**
 * A motion archetype (Strategy): maps the swing's progress `p` + the TYPE's params (`shape`, data) + the body's
 * geometry to a pose. The instance carries no per-type fields, so adding motions never grows MeleeSwing.
 */
type Motion = (s: MeleeSwing, shape: AbilityShape, g: SwingGeom, p: number) => SwingPose;

/** STAB: a forward poke from the acting hand's own (side-offset) rest spot — short with a weapon, a full jab bare. */
const stab: Motion = (s, _shape, g, p) => {
  const [bx, by] = restHand(s.angle, s.side, g.r);
  const thrustDist = g.weaponLen > 0 ? g.r * ARMED_POKE : Math.max(0, g.reach - g.r * 0.95);
  const thrust = thrustDist * Math.sin(p * Math.PI); // out → back
  const hx = bx + Math.cos(s.angle) * thrust;
  const hy = by + Math.sin(s.angle) * thrust;
  return { drawAngle: s.angle, hx, hy, tx: hx + Math.cos(s.angle) * g.weaponLen, ty: hy + Math.sin(s.angle) * g.weaponLen };
};

/** ARC: the body twists and the swing sweeps. Armed → hand stays home, blade reaches; bare → arm extends to reach. */
const arc: Motion = (s, shape, g, p) => {
  const ang = s.angle + twist(p, shape.arc);
  if (g.weaponLen > 0) {
    const [hx, hy] = restHand(ang, s.side, g.r); // hand held at the body; the blade does the reaching
    return { drawAngle: ang, hx, hy, tx: hx + Math.cos(ang) * g.weaponLen, ty: hy + Math.sin(ang) * g.weaponLen };
  }
  const dist = Math.max(g.r * 0.95, g.reach); // bare fist swings out to arm's length
  const hx = Math.cos(ang) * dist;
  const hy = Math.sin(ang) * dist;
  return { drawAngle: ang, hx, hy, tx: hx, ty: hy };
};

/** STRETCH: the Gomu rubber arm — shoulder (hx) → fist (tx) IS the hitbox. punch/grab/flurry come from the def. */
const stretch: Motion = (s, shape, g, p) => {
  const [bx, by] = restHand(s.angle, activeSide(s, shape.jabs ?? 1), g.r); // a flurry alternates which hand throws
  const reach = stretchLen(p, shape.range, shape.jabs ?? 1, shape.stretchMode === 'grab');
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
