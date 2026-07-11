import { Abilities } from '../combat/Ability';
import { applyEffect, Effects } from '../combat/Effect';
import { harmableBy } from '../combat/targeting';
import { FX_COLOR, TILE } from '../config/constants';
import { events } from '../core/EventBus';
import type { Entity } from '../ecs/components';
import type { Rng } from '../core/Rng';
import type { World } from '../ecs/World';
import type { Collision } from '../world/Collision';
import type { StrikeResolver } from './StrikeResolver';

/**
 * Moves TRAVELLING shots (musket balls, thrown knives; later cannonballs, Fruit projectiles) and resolves
 * what they hit. The projectile is its own entity (transform + `projectile`); each tick it advances along a
 * FIXED straight path (leading is the shooter's skill — see #19; nothing homes here) and its path segment
 * (last → new point) is SWEPT against two blockers so a fast ball can't tunnel between ticks:
 *   1. SOLID CELLS — a tall wall/structure stops it (Collision.shotBlockedAt, the airborne rule), which is
 *      what gives PHYSICAL COVER for free (a wall between shooter and target eats the round).
 *   2. HOSTILE BODIES — the first harmable circle the segment crosses takes the hit, via the SAME
 *      StrikeResolver a melee contact uses (guard/parry/Logia/grudges all apply, no duplicated combat rules).
 * FIRST blocker along the path wins (a wall in front of an enemy protects them; an enemy in front of a wall
 * gets hit). One engine for player and AI — who fired it is just `owner`. Geometry lives here; the hit is
 * delegated. (AI that deliberately USES cover is the reserved PATHFINDING/line-of-fire follow-up.)
 */
export class ProjectileSystem {
  /** Wall-sweep step (px): sample the path at ≤ this spacing so a fast ball can't skip over a 1-tile wall
   *  between ticks. Half a tile is safe for any wall ≥ 1 tile thick. One-engine geometry knob. */
  private static readonly WALL_STEP = TILE * 0.5;

  constructor(
    private readonly world: World,
    private readonly strikes: StrikeResolver,
    private readonly collision: Collision,
    private readonly rng: Rng, // the seeded `combat` stream — the close-range pass-through roll (determinism)
  ) {}

  update(dt: number): void {
    // snapshot: the loop despawns projectiles (contact/expiry) — iterating the live set while deleting is the
    // one case the canon allows a copy (MeleeSystem does the same with its `melee` query)
    for (const e of [...this.world.with('projectile', 'transform')]) {
      const pr = e.projectile;
      const t = e.transform;
      pr.life -= dt;
      const x0 = t.x;
      const y0 = t.y;
      const x1 = x0 + pr.vx * dt;
      const y1 = y0 + pr.vy * dt;

      // 1) how far along this tick's segment does a WALL stop it? (fraction in [0,1], or 1 = clear)
      const wallT = this.wallSweep(x0, y0, x1, y1);
      // 2) the FIRST hostile body the segment crosses, up to wallT (so a wall in front shields the target)
      const owner = this.world.byId(pr.owner);
      const bodyHit = owner ? this.bodySweep(e, owner, x0, y0, x1, y1, wallT) : null;

      // CLOSE-RANGE PASS-THROUGH (chance baked at FIRE time, AbilitySystem.closePass): a shot fired point-blank
      // can FUMBLE — phase THROUGH this body doing nothing (the reload's still spent, so it's punishable). Record
      // the body as hit so it can't re-trigger, then FALL THROUGH to the wall check below — the fumbled ball keeps
      // flying but still respects THIS segment's wall (jumping to the segment end skipped it: a point-blank-
      // against-a-wall fumble advanced the ball INTO the wall face, and a fast round tunneled cover outright).
      const fumbled = bodyHit && (pr.passChance ?? 0) > 0 && this.rng.chance(pr.passChance!);
      if (fumbled) {
        pr.hit.push(bodyHit.target.id);
        events.emit('fx:burst', { x: bodyHit.x, y: bodyHit.y, color: FX_COLOR.spark, n: 3, speed: 70 }); // a near-miss puff
      } else if (bodyHit) {
        t.x = bodyHit.x; // stop AT the body it struck
        t.y = bodyHit.y;
        this.resolveHit(e, owner!, bodyHit.target);
        this.despawn(e, FX_COLOR.spark);
        continue;
      }
      if (wallT < 1) {
        t.x = x0 + (x1 - x0) * wallT; // stop at the wall face
        t.y = y0 + (y1 - y0) * wallT;
        this.despawn(e, FX_COLOR.spark);
        continue;
      }
      t.x = x1;
      t.y = y1;
      if (pr.life <= 0) this.despawn(e, null); // spent its range — fizzle, no impact spark
    }
  }

  /** Nearest fraction along (x0,y0)→(x1,y1) at which a SHOT-blocking cell begins, sampled at WALL_STEP; 1 =
   *  the whole segment is clear. Stepping (not a DDA) is enough here: WALL_STEP ≤ ½ tile can't skip a wall. */
  private wallSweep(x0: number, y0: number, x1: number, y1: number): number {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(len / ProjectileSystem.WALL_STEP));
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      if (this.collision.shotBlockedAt(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f)) return f;
    }
    return 1;
  }

  /** The first harmable body whose circle the segment (up to `maxF`) crosses, and the point on the segment
   *  where it's first touched. Null if the lane is clear. Skips bodies already hit (pierce-safe) and ships. */
  private bodySweep(
    e: Entity,
    owner: Entity,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    maxF: number,
  ): { target: Entity; x: number; y: number } | null {
    const pr = e.projectile!;
    const canHit = harmableBy(owner); // the shooter's harm predicate (allies safe unless FF/grudge) — the Moat
    let bestF = maxF;
    let best: Entity | null = null;
    for (const o of this.world.with('transform', 'health', 'faction')) {
      if (o.id === owner.id || pr.hit.includes(o.id) || !canHit(o)) continue;
      const ot = o.transform;
      const f = segCircleF(x0, y0, x1, y1, ot.x, ot.y, ot.r); // earliest fraction the path enters the circle
      if (f !== null && f <= bestF) {
        bestF = f;
        best = o;
      }
    }
    if (!best) return null;
    return { target: best, x: x0 + (x1 - x0) * bestF, y: y0 + (y1 - y0) * bestF };
  }

  /** Land the shot through the shared resolver — same path as a melee contact, so guard/parry/Logia/combo/
   *  grudge all apply. Knockback is along the projectile's travel direction. NOTE (deliberate): the resolver
   *  reads the SHOOTER's layer, so a grounded shot whiffs on an AIRBORNE target — a jump dodges a bullet too,
   *  symmetric with melee (leap the volley). An anti-air shot that catches jumpers is a #19 follow-up knob. */
  private resolveHit(e: Entity, owner: Entity, target: Entity): void {
    const pr = e.projectile!;
    const d = Abilities.get(pr.ability);
    // CHARGED round (the proc rolled at fire time, AbilityShape.procEffect): hits ×damageMult and applies its
    // EFFECT row (shocked/…) to the target on a LANDED hit — statuses are effects (backlog #16), so a future
    // fire/ice round is one new effect row, no new fields here.
    const base = this.strikes.baseDamage(owner, d) * (pr.proc?.damageMult ?? 1);
    const kb = d.knockback ?? 0;
    const len = Math.hypot(pr.vx, pr.vy) || 1;
    const kx = (pr.vx / len) * kb;
    const ky = (pr.vy / len) * kb;
    pr.hit.push(target.id); // record even if it phases (Logia), so a pierce round can't re-hit the same body
    const landed = this.strikes.hit(owner, target, d, base, kx, ky, d.shake ?? 0, d.stun ?? 0);
    if (landed && pr.proc) {
      applyEffect(target, pr.proc.effect, 'shot', pr.proc.dur);
      const theme = Effects.get(pr.proc.effect).status?.color ?? FX_COLOR.spark; // the effect's ONE theme color
      events.emit('fx:burst', { x: target.transform!.x, y: target.transform!.y, color: theme, n: 8, speed: 130 }); // the charged pop
    }
  }

  private despawn(e: Entity, sparkColor: number | null): void {
    const t = e.transform!;
    if (sparkColor !== null) events.emit('fx:burst', { x: t.x, y: t.y, color: sparkColor, n: 5, speed: 90 });
    this.world.destroy(e);
  }
}

/** Earliest fraction t∈[0,1] along segment A→B at which it enters a circle (cx,cy,r), or null if it never
 *  does. Solves |A + t·(B−A) − C|² = r² for the smaller root, clamped to the segment. Pure geometry. */
function segCircleF(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number): number | null {
  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - cx;
  const fy = ay - cy;
  const a = dx * dx + dy * dy;
  if (a === 0) return fx * fx + fy * fy <= r * r ? 0 : null; // zero-length step: point-in-circle
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  let disc = b * b - 4 * a * c;
  if (disc < 0) return null; // the line misses the circle entirely
  disc = Math.sqrt(disc);
  const t1 = (-b - disc) / (2 * a); // entry root (the nearer intersection)
  if (t1 >= 0 && t1 <= 1) return t1;
  const t2 = (-b + disc) / (2 * a); // starting already inside → entry is behind us; exit root ≥ 0 means overlap at t=0
  if (t1 < 0 && t2 >= 0) return 0; // segment starts inside the circle (a point-blank shot) → immediate hit
  return null;
}
