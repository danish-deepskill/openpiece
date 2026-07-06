import { angleDiff } from '../core/math';
import type { AIProfileDef } from '../defs/aiProfiles';
import type { Entity } from '../ecs/components';

/**
 * HEAVY-BODY STEERING — the ONE home for the "lumbering beast" movement model (a bull; any future rhino/boar/
 * ogre). A heavy body is one whose profile sets `turnSpeed` (a turn-rate CAP): it can't pivot on a dime, so it
 * turns slowly, moves only along its FACING (no sliding sideways/backward), and can only COMMIT an attack/charge
 * when the target is in its front arc. Centralised here so the rules can't drift: every `t.angle`/velocity site
 * in the chase brain routes through these instead of re-deriving the trait checks inline (the bug-prone way that
 * let one forgotten site — the dash, the mid-swing aim — snap the facing and break the flanking counter).
 *
 * Light fighters (no `turnSpeed`) are NOT heavy: `isHeavy` is false, and callers fall back to instant-pivot,
 * move-straight-at-target behaviour — so this module only ever changes heavy creatures.
 */

/** ≈ ±52° — the arc in front of a heavy body within which it will COMMIT a charge or strike. */
export const FACING_CONE = 0.9;

/** Does this profile describe a heavy, turn-capped body (a bull), vs an agile fighter (instant pivot)? */
export function isHeavy(p: AIProfileDef): boolean {
  return p.turnSpeed != null;
}

/**
 * Ease a heavy body's facing toward `wantAngle` at its capped turn rate — the lumber. FROZEN while `frozen`
 * (mid-swing): a committed headbutt can't re-aim, else the facing keeps tracking the target UNDER the committed
 * head visual and SNAPS to it the instant the swing ends. Mutates `t.angle`. No-op for a light body (caller
 * handles instant pivot). Returns whether it actually turned (unused today; handy for callers later).
 */
export function steerFacing(e: Entity, wantAngle: number, p: AIProfileDef, dt: number, frozen: boolean): void {
  if (p.turnSpeed == null || frozen) return;
  const t = e.transform!;
  const step = p.turnSpeed * dt;
  t.angle += Math.max(-step, Math.min(step, angleDiff(wantAngle, t.angle)));
}

/** Is `(tx,ty)` inside the heavy body's front arc (FACING_CONE of its current facing)? Always true for a light
 *  body — it pivots instantly, so it can commit at any angle. This gates the charge + the strike. */
export function facesTarget(e: Entity, tx: number, ty: number, p: AIProfileDef): boolean {
  if (p.turnSpeed == null) return true;
  const t = e.transform!;
  return Math.abs(angleDiff(Math.atan2(ty - t.y, tx - t.x), t.angle)) <= FACING_CONE;
}

/**
 * A heavy body moves ALONG its facing, not straight at the desired direction — so it can't slide sideways or
 * backward toward a target behind it (it must wheel around first). Returns the heading to move along and a
 * speed SCALE (1 facing the want dir → 0 at 90°/behind, so it crawls to a stop and turns in place while badly
 * mis-aimed instead of sidling). For a light body, returns the want dir unchanged at full speed.
 */
export function heavyHeading(e: Entity, wantX: number, wantY: number, p: AIProfileDef): { mx: number; my: number; speedScale: number } {
  if (p.turnSpeed == null) return { mx: wantX, my: wantY, speedScale: 1 };
  const t = e.transform!;
  const off = Math.abs(angleDiff(Math.atan2(wantY, wantX), t.angle));
  return { mx: Math.cos(t.angle), my: Math.sin(t.angle), speedScale: Math.max(0, Math.cos(off)) };
}
