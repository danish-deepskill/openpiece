import { isDowned, PART_FIST_L, PART_FIST_R, PART_HEAD } from '../combat/ragdoll';
import type { Entity } from '../ecs/components';

/**
 * SHARED roll state — the ONE source every layer consults to stay in sync during a dodge-roll (the body in
 * drawActor draws the tucked-ball pose; WeaponSpriteSystem + AccessorySystem HIDE the held weapon/hat, tucked
 * into the ball). Without a shared rule each layer would decide independently whether a roll is happening — the
 * bug where the body rolled but the hat/weapon floated on. Mirrors RenderSystem.sortY: one presentation fact
 * every layer reads. Presentation-only: reads the sim-set mover.rollT/rollDur, writes nothing.
 */

/** The per-frame velocity decay MovementSystem applies to a dodge impulse (0.86 at 60fps). Kept in sync so the
 *  roll animation can ease on the SAME curve the travel does. */
const IMPULSE_DECAY_PER_SEC = Math.pow(0.86, 60);

/**
 * Roll progress 0 (start) → 1 (end) if the entity is mid-roll, else null. NOT linear in time: it tracks the
 * DISTANCE TRAVELED, because a dodge impulse front-loads (fast start, decays to a crawl) — a linear animation
 * would keep tumbling after the body has already arrived (the "anim longer than the move" bug). Using the
 * travel's own saturating curve, the tumble eases out exactly as the movement does, so both finish together.
 * rollDur guards a divide-by-zero.
 */
export function rollProgress(e: Entity): number | null {
  const m = e.mover;
  if (!m?.rollT || !m.rollDur) return null;
  const linear = 1 - m.rollT / m.rollDur; // 0 → 1 in real time
  const T = m.rollDur;
  const denom = 1 - Math.pow(IMPULSE_DECAY_PER_SEC, T); // total distance factor over the whole roll
  if (denom <= 1e-6) return linear; // degenerate (tiny dur) — fall back to linear
  return (1 - Math.pow(IMPULSE_DECAY_PER_SEC, linear * T)) / denom; // fraction of distance covered by now
}

/** Where the HEAD sits on its roll loop this frame — the SHARED source so both the roll pose (drawActor) and the
 *  hat (AccessorySystem) place identically. `dx/dy` = offset from the unit center (world px); `scale` = the
 *  fake-perspective size (bigger over the top, smaller under); `overTop` = draw ON TOP of the body (else behind);
 *  `crownAlpha` = how much the head's CROWN faces the camera — 1 over the top, 0 tucked under. A hat sits on the
 *  crown, so when the head is UNDER (crown facing the ground) the hat is on the head's far side and must be
 *  HIDDEN, not just shrunk — the hat rides `crownAlpha`, not `scale`. Null if not mid-roll. Stays in lockstep
 *  with drawRollPose's head math. */
export interface RollHead {
  dx: number;
  dy: number;
  scale: number;
  overTop: boolean;
  crownAlpha: number;
  travel: number; // roll direction (rad) — a worn hat orients to THIS, not the unit's aim, so it tumbles the right way
}
export function rollHeadPlacement(e: Entity): RollHead | null {
  const prog = rollProgress(e);
  const m = e.mover;
  const t = e.transform;
  if (!m || !t) return null;
  if (prog === null) {
    // DOWNED (the sprawl): the head lies at the far end of the body along the fall direction, rolled to one side —
    // the hat lies WITH it (same placement the prone pose draws the head at), crown up, sized as a resting head
    const p = proneHead(e);
    return p ? { dx: p.x, dy: p.y, scale: 1, overTop: true, crownAlpha: 1, travel: p.tilt } : null;
  }
  const travel = Math.atan2(m.dvy, m.dvx);
  const theta = prog * Math.PI * 2; // one revolution
  const along = Math.cos(theta); // signed forward offset
  const depth = -Math.sin(theta); // forward roll: under at the front, over the top at the back
  const headFwd = along * t.r * 0.95;
  return {
    dx: Math.cos(travel) * headFwd,
    dy: Math.sin(travel) * headFwd,
    scale: Math.max(0.4, 0.75 + 0.35 * depth), // matches drawRollPose headScale
    overTop: depth >= 0,
    crownAlpha: Math.max(0, depth), // crown faces the camera only over the top (depth>0); 0 while tucked under
    travel,
  };
}

/** The SPRAWL as drawn — the sim's jointed parts (combat/ragdoll) read into the pose: where the head lies (the hat lies
 *  there too), the body axis, and the two fists. Null unless downed with its parts laid out (the first downed tick lays
 *  them; the tumble draws until then). Units: px from the unit center. */
export interface Sprawl {
  x: number; // head center
  y: number;
  tilt: number; // the head's facing (rad) — along its own offset from the body, i.e. where it rolled
  axis: number; // the body's long axis (the fall direction)
  fists: [[number, number], [number, number]];
}
export function proneHead(e: Entity): Sprawl | null {
  if (!isDowned(e)) return null;
  const rg = e.mover!.ragdoll!; // isDowned proved the record
  const parts = rg.parts;
  if (!parts || parts.length < 3) return null;
  const h = parts[PART_HEAD]!;
  const l = parts[PART_FIST_L]!;
  const r = parts[PART_FIST_R]!;
  return { x: h.x, y: h.y, tilt: Math.atan2(h.y, h.x), axis: rg.angle, fists: [[l.x, l.y], [r.x, r.y]] };
}
