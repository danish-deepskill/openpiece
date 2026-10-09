import type { ContentId } from '../core/Registry';
import type { Entity, Mover } from '../ecs/components';
import { Effects, TAG_RAGDOLL, applyEffect } from './Effect';

/**
 * RAGDOLL — the knockdown CC class (docs/design/COMBAT.md: aerials map to ground-plane states). Three beats on one
 * mover record + one effect:
 *   FLIGHT  (t < air)        flung on the impulse channel (dvx/dodgeT), TUMBLING (the roll-anim clock — the same ball
 *                            a dodge-roll draws, so weapon/hat tuck away for free), PHASING through bodies; a wall ends
 *                            it early with a thud (MovementSystem).
 *   DOWNED  (t < air + down) sprawled (actorDraws' prone pose along `angle`), hittable, PUSHABLE (a walker shoves it
 *                            along — BodyCollisionSystem), never re-launched (Damage.apply / StrikeResolver read the tag).
 *   GET-UP                   the record clears (MovementSystem ticks `t`); the effect's STUNNED expires with it.
 * The dominance rung scales the launch before it gets here (force × knockbackMul, downed × stunMul), so a dominant
 * body simply isn't launched — "Luffy sends fodder flying; the Admiral doesn't budge" is two multipliers.
 */

/** Extra DOWNED time (s) a flung body pays for meeting a WALL mid-flight — the slam: a body that hits stone stays down
 *  longer than one that lands on grass. The flight's own end (the thud) is the trigger (MovementSystem.ragdollThud). */
export const WALL_THUD_DOWN_BONUS = 0.8;

/** Launch `o` along (dx, dy) (unit). `seed` ∈ [0,1) picks the sprawl's limb splay (presentation reads it). `effectId` names
 *  the ragdoll row worn (its label): the plain 'Down', or a verdict's own — 'Overpowered' for a lost clash. */
export function launchRagdoll(o: Entity, dx: number, dy: number, force: number, airTime: number, downed: number, seed: number, effectId: ContentId = 'effect.ragdoll'): void {
  const m = o.mover;
  if (!m) return;
  m.dvx = dx * force;
  m.dvy = dy * force;
  m.dodgeT = airTime; // the flight rides the impulse channel — walls, ships and the slam watch all apply
  m.rollT = airTime; // the tumble: the dodge-roll's ball pose for exactly the flight (rollAnim reads these)
  m.rollDur = airTime;
  m.ragdoll = { t: 0, air: airTime, down: downed, angle: Math.atan2(dy, dx), seed };
  delete o.melee; // a flung body swings nothing
  applyEffect(o, effectId, 'ragdoll', airTime + downed);
  applyEffect(o, 'effect.phasing', 'ragdoll', airTime); // through bodies while airborne; solid (and pushable) once down
}

/** The WALL SLAM of a flight: the body stays down WALL_THUD_DOWN_BONUS longer — the downed beat and the ragdoll effect it
 *  wears (whichever row granted the tag) both stretch, so the pose and the label agree. No-op for a body not flying. */
export function slamRagdoll(o: Entity): void {
  const rg = o.mover?.ragdoll;
  if (!rg || !o.effects) return;
  rg.down += WALL_THUD_DOWN_BONUS;
  for (const a of o.effects.active) if (Effects.get(a.id).grantTags?.includes(TAG_RAGDOLL)) a.remaining += WALL_THUD_DOWN_BONUS;
}

/** Lying DOWNED this instant (landed, not yet up) — the pose, the pushability, the hidden weapon all key on this. */
export function isDowned(e: Entity): boolean {
  const rg = e.mover?.ragdoll;
  return rg !== undefined && rg.t >= rg.air;
}

/** Flung or down — no further shove or launch lands on this body until it's up. */
export function isRagdolled(e: Entity): boolean {
  return e.tags?.has(TAG_RAGDOLL) === true;
}

/** Ends a flight NOW (a wall took it): the impulse dies, the tumble unrolls, the downed beat begins. */
export function groundRagdoll(m: NonNullable<Entity['mover']>): void {
  const rg = m.ragdoll;
  if (!rg) return;
  m.dvx = 0;
  m.dvy = 0;
  m.dodgeT = 0;
  m.rollT = 0;
  rg.t = Math.max(rg.t, rg.air);
}

// ─── THE JOINTED RAG (per-part, still connected) ───────────────────────────────────────────────────────────────────
// A downed body is three loose parts on ball sockets around a rigid torso: the HEAD off the torso's far end, a FIST off
// each shoulder. Each part is its own little circle a walker can shove; a joint is a DISTANCE constraint to its socket
// (relaxed every tick, Verlet-style): the part snaps back to its socket's length and the TORSO is dragged a share of the
// way — shove the head and the whole body follows a little, shove the fist and the arm swings. No rotation constraint:
// a part may swing anywhere around its socket (a ball joint), which is what makes it read as limp. Deterministic
// positional math, no rng, no velocities: parts only move when pushed or pulled.

/** Part indices in `ragdoll.parts`. */
export const PART_HEAD = 0;
export const PART_FIST_L = 1;
export const PART_FIST_R = 2;
/** Part radii (×r) — the circles a walker pushes; head = the drawn head, fists = the drawn fist (combat/swing.HAND_R_FRAC). */
export const PART_R: readonly number[] = Object.freeze([0.72, 0.45, 0.45]);
/** Socket positions on the torso (×r, body frame: +along = the fall direction, +across = right) and each joint's length. */
const SOCKETS: readonly { along: number; across: number; len: number }[] = Object.freeze([
  { along: 0.5, across: 0, len: 0.6 }, // the neck: at the torso's far end; head center ~1.1r out
  { along: 0.1, across: -1.05, len: 0.5 }, // left shoulder
  { along: 0.1, across: 1.05, len: 0.5 }, // right shoulder
]);
/** Share of a joint correction the TORSO takes (the rest moves the part): the drag. 1 would make the body rigid again. */
const TORSO_DRAG = 0.35;
/** The torso's own collision radius while down (×r) — the trunk alone; the parts carry their own circles. */
export const DOWNED_TORSO_R = 0.6;

/** A socket's position as an offset from the body center (px). */
function socket(rg: NonNullable<Mover['ragdoll']>, i: number, r: number): { x: number; y: number } {
  const s = SOCKETS[i]!; // index-bounded by the parts array
  const ax = Math.cos(rg.angle);
  const ay = Math.sin(rg.angle);
  return { x: (ax * s.along - ay * s.across) * r, y: (ay * s.along + ax * s.across) * r };
}

/** Lay the parts out at LANDING from the fall's seed: each part at its socket length, splayed a seeded bit (limp, uneven),
 *  the head rolled to one side. Called once when the flight ends (MovementSystem). */
export function landRagdoll(m: Mover, r: number): void {
  const rg = m.ragdoll;
  if (!rg || rg.parts) return;
  const s1 = rg.seed;
  const s2 = (rg.seed * 7.31) % 1;
  const s3 = (rg.seed * 3.77) % 1;
  const side = s1 < 0.5 ? -1 : 1;
  const splay = [side * (0.5 + 0.5 * s2), -(0.3 + 0.6 * s2), 0.3 + 0.6 * s3]; // rad off each socket's outward direction
  const outward = [0, -Math.PI / 2, Math.PI / 2]; // body-frame direction each socket faces
  rg.parts = [];
  for (let i = 0; i < SOCKETS.length; i++) {
    const sk = socket(rg, i, r);
    const dir = rg.angle + outward[i]! + splay[i]!;
    rg.parts.push({ x: sk.x + Math.cos(dir) * SOCKETS[i]!.len * r, y: sk.y + Math.sin(dir) * SOCKETS[i]!.len * r });
  }
}

/** Satisfy every joint: a part off its socket's length snaps back (1 − TORSO_DRAG of the way) and the torso is DRAGGED the
 *  rest (through `moveTorso`, so walls still hold it). Two passes settle a double shove. Offsets are torso-relative, so a
 *  dragged torso carries every part with it — the connection. */
export function relaxRagdoll(m: Mover, r: number, moveTorso: (dx: number, dy: number) => void): void {
  const rg = m.ragdoll;
  if (!rg?.parts) return;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < rg.parts.length; i++) {
      const p = rg.parts[i]!;
      const sk = socket(rg, i, r);
      const len = SOCKETS[i]!.len * r;
      const dx = p.x - sk.x;
      const dy = p.y - sk.y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-6 || Math.abs(d - len) < 0.01) continue;
      const cx = dx * (1 - len / d); // the correction that puts the part back at the joint's length
      const cy = dy * (1 - len / d);
      moveTorso(cx * TORSO_DRAG, cy * TORSO_DRAG); // the body follows the shoved limb a share of the way…
      p.x -= cx; // …and the limb settles at its socket's length (in the torso frame — the torso's move carried it)
      p.y -= cy;
    }
  }
}

/** Push ONE part (body-center offset) by a world displacement — a walker stepping into the head, a fist. */
export function pushPart(m: Mover, i: number, dx: number, dy: number): void {
  const p = m.ragdoll?.parts?.[i];
  if (!p) return;
  p.x += dx;
  p.y += dy;
}
