import { angleDiff, dist } from '../core/math';
import type { AIProfileDef } from '../defs/aiProfiles';
import type { Entity } from '../ecs/components';

export interface Vision {
  sight: number; // full forward range
  cone: number; // forward half-angle
  nearSight: number; // short side range
  blind: number; // rear blind half-angle
}

/** The vision zones for a profile (all per-unit data now). Shared by the AI engine + the debug draw. */
export function visionOf(p: AIProfileDef): Vision {
  return { sight: p.sight, cone: p.cone, nearSight: p.nearSight, blind: p.blindArc };
}

/**
 * Graded perception by where `foe` sits relative to `e`'s facing: full `sight` in the FORWARD cone, short
 * `nearSight` to the SIDES, and a total blind spot in the rear arc (the surprise-attack window). Line-of-sight
 * (walls) is checked separately by the caller.
 */
export function perceives(e: Entity, foe: Entity, p: AIProfileDef): boolean {
  const t = e.transform!;
  const ft = foe.transform!;
  const v = visionOf(p);
  const d = dist(t.x, t.y, ft.x, ft.y);
  const a = Math.abs(angleDiff(Math.atan2(ft.y - t.y, ft.x - t.x), t.angle)); // 0 ahead … π directly behind
  if (a <= v.cone) return d <= v.sight; // forward cone: full range
  if (a <= Math.PI - v.blind) return d <= v.nearSight; // flanks: short range
  return false; // rear blind arc — blind at any range
}
