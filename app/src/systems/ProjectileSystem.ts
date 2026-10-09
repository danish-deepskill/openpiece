import { Abilities } from '../combat/Ability';
import { applyEffect, Effects } from '../combat/Effect';
import { entityHostile, harmableBy } from '../combat/targeting';
import { effectiveTier } from '../combat/dominance';
import { letters } from '../combat/PowerTier';
import { segSegClosest } from '../core/math';
import { DEFLECT_STAT } from '../combat/stats';
import { BLOCK_DEFLECT_ARC, BLOCK_DEFLECT_CHANCE, guardCovers } from '../combat/guard';
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
/** Shot-vs-shot pre-check (px): two shots farther apart than this on either axis can't meet this tick (the largest radii +
 *  a tick of the fastest flight are well under it) — skips the owner lookups and the geometry for the far pairs. */
const DUEL_GATE = 96;

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
    const live = [...this.world.with('projectile', 'transform')];
    if (live.length > 1) this.duels(live, dt);
    for (const e of live) {
      if (!e.projectile) continue; // lost to a duel this tick
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
      if (!owner) {
        // the shooter (or the deflector who now owns it) is GONE: without an owner there is no harm predicate, and
        // an inert ball flying through everyone is a silent failure — it fizzles instead
        this.despawn(e, null);
        continue;
      }
      const bodyHit = this.bodySweep(e, owner, x0, y0, x1, y1, wallT);

      // CLOSE-RANGE PASS-THROUGH (chance baked at FIRE time, AbilitySystem.closePass): a shot fired point-blank
      // can FUMBLE — phase THROUGH this body doing nothing (the reload's still spent, so it's punishable). Record
      // the body as hit so it can't re-trigger, then FALL THROUGH to the wall check below — the fumbled ball keeps
      // flying but still respects THIS segment's wall (jumping to the segment end skipped it: a point-blank-
      // against-a-wall fumble advanced the ball INTO the wall face, and a fast round tunneled cover outright).
      const fumbled = bodyHit && (pr.passChance ?? 0) > 0 && this.rng.chance(pr.passChance!);
      // DEFLECT (the target's `deflectChance` stat — a shukuchi window, a Haki later): the ball TURNS at the point
      // of contact and flies back at wherever its shooter is NOW, as the deflector's OWN shot — new owner (so the
      // shooter is a legal target and the deflector isn't), a fresh range, and no pass-through fumble (a returned
      // ball is a clean shot). Rolled on the seeded combat stream; the near-miss fumble is checked first.
      if (bodyHit && !fumbled) {
        const target = bodyHit.target;
        // 1) the dash-deflect STAT (a shukuchi window, a Haki later): a true RETURN at wherever the shooter is NOW
        const returnChance = target.attributes?.get(DEFLECT_STAT) ?? 0;
        if (returnChance > 0 && this.rng.chance(returnChance)) {
          const sx = owner.transform!.x; // transform: every shooter is a placed body
          const sy = owner.transform!.y;
          this.deflect(e, target, bodyHit.x, bodyHit.y, Math.atan2(sy - bodyHit.y, sx - bodyHit.x));
          continue;
        }
        // 2) a raised GUARD facing the ball: a GLANCE — the ball ricochets along the blocker's facing, scattered
        //    within ±BLOCK_DEFLECT_ARC (so it only sometimes finds the shooter); the other times the block stops it
        //    as normal (resolveHit → resolveGuard → 'blocked'). Seeded roll (determinism).
        if (guardCovers(target, bodyHit.x, bodyHit.y) && this.rng.chance(BLOCK_DEFLECT_CHANCE)) {
          const facing = target.transform!.angle; // guardCovers proved the transform
          this.deflect(e, target, bodyHit.x, bodyHit.y, facing + (this.rng.next() * 2 - 1) * BLOCK_DEFLECT_ARC);
          continue;
        }
      }
      if (fumbled) {
        pr.hit.push(bodyHit.target.id);
        events.emit('fx:burst', { x: bodyHit.x, y: bodyHit.y, color: FX_COLOR.spark, n: 3, speed: 70 }); // a near-miss puff
      } else if (bodyHit) {
        t.x = bodyHit.x; // stop AT the body it struck
        t.y = bodyHit.y;
        this.resolveHit(e, owner, bodyHit.target);
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

  /** The first harmable body the ball's swept DISC (its own radius — `shotRadius`, a point for a musket ball — grown
   *  onto the body's circle) crosses along the segment up to `maxF`, and the point on the path where it's first
   *  touched. Null if the lane is clear. Skips bodies already hit (pierce-safe) and ships. */
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
      const f = segCircleF(x0, y0, x1, y1, ot.x, ot.y, ot.r + e.transform!.r); // earliest fraction the ball's disc touches the body (Minkowski: body grown by the ball's radius) — `e` is a transform-bearing projectile (the update loop's query)
      if (f !== null && f <= bestF) {
        bestF = f;
        best = o;
      }
    }
    if (!best) return null;
    return { target: best, x: x0 + (x1 - x0) * bestF, y: y0 + (y1 - y0) * bestF };
  }

  /** Turn the ball at the point of contact toward `heading` as `deflector`'s OWN shot — new owner (so the old
   *  shooter is a legal target and the deflector isn't), a fresh range, no pass-through fumble (a deflected ball
   *  is a clean shot), the art turned with it, and a steel clang. Shared by the stat RETURN and the guard GLANCE. */
  private deflect(e: Entity, deflector: Entity, hx: number, hy: number, heading: number): void {
    const pr = e.projectile!;
    const t = e.transform!;
    const shape = Abilities.get(pr.ability).shape!; // a projectile only spawns from a boot-validated 'shot' row (range > 0, shotSpeed > 0)
    const speed = Math.hypot(pr.vx, pr.vy) || 1;
    pr.vx = Math.cos(heading) * speed;
    pr.vy = Math.sin(heading) * speed;
    pr.owner = deflector.id;

    pr.rung = effectiveTier(deflector); // it is their shot now — it flies at THEIR rung (a coated body's return is a coated shot)
    pr.hit = [];
    pr.passChance = undefined;
    pr.life = shape.range! / shape.shotSpeed!; // both boot-validated > 0 for a shot. A FULL range for the new trip (not the remaining life — a near-spent ball would fizzle a few px on)
    t.x = hx;
    t.y = hy;
    t.angle = heading; // the art turns with the ball
    events.emit('fx:burst', { x: hx, y: hy, color: FX_COLOR.spark, n: 10, speed: 180 }); // the steel clang
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

  /** SHOT MEETS SHOT (the flying-slash duel): for every pair of live projectiles whose owners are enemies and whose paths
   *  this tick come within their two radii, the LADDER decides first — a letter or more apart (the rungs stamped at fire),
   *  the dominant shot destroys the other and flies on untouched; at the same rung the CLASS decides — a slash cuts a ball
   *  and flies on, equals burst each other. No dice. A coated 72-Pound erases an uncoated gale and keeps going; two coated
   *  gales meet in a mutual burst. */
  private duels(live: Entity[], dt: number): void {
    for (let i = 0; i < live.length; i++) {
      const a = live[i]!;
      if (!a.projectile) continue;
      for (let j = i + 1; j < live.length; j++) {
        const b = live[j]!;
        if (!a.projectile || !b.projectile) continue;
        const pa = a.projectile;
        const pb = b.projectile;
        if (pa.owner === pb.owner) continue;
        const at = a.transform!;
        const bt = b.transform!;
        if (Math.abs(at.x - bt.x) > DUEL_GATE || Math.abs(at.y - bt.y) > DUEL_GATE) continue; // the cheap gate first: most pairs are nowhere near each other
        const oa = this.world.byId(pa.owner);
        const ob = this.world.byId(pb.owner);
        if (!oa || !ob || !entityHostile(oa, ob)) continue; // your own volley never eats itself; neutral shots pass
        const c = segSegClosest(at.x, at.y, at.x + pa.vx * dt, at.y + pa.vy * dt, bt.x, bt.y, bt.x + pb.vx * dt, bt.y + pb.vy * dt);
        if (c.d > at.r + bt.r) continue;
        const gap = (pa.rung ?? pb.rung ?? 0) - (pb.rung ?? pa.rung ?? 0); // a tier-less shot meets anything as an equal
        let loserA = false;
        let loserB = false;
        if (gap >= letters(1)) loserB = true;
        else if (gap <= -letters(1)) loserA = true;
        else if (pa.kind !== pb.kind) { if (pa.kind === 'slash') loserB = true; else loserA = true; } // a slash cuts a ball
        else { loserA = true; loserB = true; } // equals burst each other
        const theme = (loserA ? pb.theme : pa.theme) ?? pa.theme ?? pb.theme; // the survivor's look colors the burst
        events.emit('fx:burst', { x: c.x, y: c.y, color: FX_COLOR.spark, n: loserA && loserB ? 14 : 9, speed: 220, theme });
        if (loserA) this.despawn(a, null);
        if (loserB) this.despawn(b, null);
        if (loserA) break; // a is gone — on to the next shot
      }
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
