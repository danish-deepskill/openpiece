import { TAG_PHASING } from '../combat/Effect';
import { DOWNED_TORSO_R, isDowned, PART_R, pushPart } from '../combat/ragdoll';
import { deckOf, deckToWorld } from '../defs/decks';
import { ShipHulls } from '../defs/ships';
import { deckTryMove } from '../world/deckCollision';
import type { Entity } from '../ecs/components';
import type { World } from '../ecs/World';
import type { Collision } from '../world/Collision';
import type { SpatialQuery } from '../world/SpatialQuery';

const MAX_BODY_R = 20; // largest body radius (+ margin) — bounds the neighbor-search window

/**
 * Hard body-vs-body collision with weight, FRAME-AWARE. After movement integrates, any two overlapping FOOT
 * actors IN THE SAME MOVEMENT FRAME (both ashore, or both on the SAME deck) are pushed apart along the line
 * between their centers, split by INVERSE MASS — the lighter one yields more, so a heavy body shoves a light
 * one aside and a light one can't walk through a heavy one. Applies to EVERY foot actor including the player —
 * the Moat: the player is just another body. Dead bodies are skipped (you can walk over a corpse).
 *
 * The frame rule (reads-free / writes-owned) — applied to BOTH sides of the job: OVERLAP is MEASURED and the
 * PUSH is WRITTEN in the frame that OWNS each pair's positions. Ashore that's transform + world Collision;
 * aboard it's onDeck.lx/ly + deckTryMove against the DECK grid, in deck axes end to end — so nobody is
 * shoved into a wall or a rail (they press, not clip). Measuring riders on the world projection instead was
 * a subtle trap: this system runs BETWEEN movement and ships-parenting in the tick, so a rider's transform
 * is one movement step STALE here — closing bodies sank a couple px into each other before the overlap was
 * even seen (ashore stayed pixel-tight, deck didn't). The write-side trap is why riders used to be excluded
 * outright (a transform write on a parented body is a dead write), which made deck bodies GHOSTS to each
 * other. CROSS-frame pairs (one at the door straddle, one aboard) are skipped on purpose: one body-width of
 * transient overlap at a handoff line beats resolving a push across two grids in relative motion. One
 * pass/frame; multi-body stacks settle over a few frames.
 */
/** The mass a DOWNED body collides with — effectively none, so it yields the full overlap (combat/ragdoll). */
const DOWNED_MASS = 0.001;
/** How a downed body SLIDES when walked into: px/s along the push, carried this long (the dodge channel decays it). */
const DOWNED_SLIDE = 110;
const DOWNED_SLIDE_T = 0.14;

export class BodyCollisionSystem {
  constructor(
    private readonly world: World,
    private readonly query: SpatialQuery,
    private readonly collision: Collision,
  ) {}

  /** A solid, pushable body: a living, GROUNDED foot actor. An AIRBORNE actor (a jumper —
   *  docs/design/MOVEMENT_AIR.md) is NOT solid: it's above the crowd, so it neither pushes others nor is pushed —
   *  you jump OVER units. Excluding it here covers both directions at once (skipped as `e`, filtered from neighbors). */
  private solid = (e: Entity): boolean =>
    !!e.transform && !!e.mover && e.mover.mode === 'foot' && e.mover.layer !== 'air' && !e.health?.dead && !e.tags?.has(TAG_PHASING); // a PHASING body (a pass-through step) is as un-solid as an airborne one

  /** A DOWNED body has no footing: it yields the WHOLE overlap to whoever walks into it (combat/ragdoll — the
   *  Roblox rule: a ragdoll is a thing you shove along the floor). Everyone else pushes by mass. */
  private yieldMass = (e: Entity): number => (isDowned(e) ? DOWNED_MASS : e.mover!.mass);

  update(): void {
    for (const e of this.world.with('transform', 'mover')) {
      if (!this.solid(e)) continue;
      const t = e.transform!;
      const massE = this.yieldMass(e);
      // each unordered pair resolved once (only neighbors with a higher id), SAME FRAME only — shipId equality
      // also pairs two undefineds, so ashore×ashore and same-deck both pass; mixed and different-deck never do
      const neighbors = this.query.within(t.x, t.y, t.r + MAX_BODY_R + MAX_BODY_R, (o) => o.id > e.id && this.solid(o) && o.onDeck?.shipId === e.onDeck?.shipId);
      for (const o of neighbors) {
        const ot = o.transform!;
        // a DOWNED body's limbs are their own little bodies (combat/ragdoll): the other walker shoves whichever part it
        // steps into, and the joints drag the torso after it (MovementSystem.relaxRagdoll). Ashore only (a rag on a deck
        // keeps the one-lump rule — deck-local part frames are not worth it yet).
        if (!e.onDeck) {
          if (isDowned(e)) this.pushParts(e, ot.x, ot.y, ot.r);
          if (isDowned(o)) this.pushParts(o, t.x, t.y, t.r);
        }
        const re = isDowned(e) ? t.r * DOWNED_TORSO_R : t.r; // the trunk alone while down — the limbs were handled above
        const ro = isDowned(o) ? ot.r * DOWNED_TORSO_R : ot.r;
        // measure in the OWNING frame: onDeck coords for a deck pair (this pass runs before ships-parenting,
        // so rider transforms are one movement step stale — good enough for the search window above, NOT for
        // the touch test), transform for a world pair. Same-frame guarantees the coords are comparable.
        const dx = e.onDeck ? e.onDeck.lx - o.onDeck!.lx : t.x - ot.x;
        const dy = e.onDeck ? e.onDeck.ly - o.onDeck!.ly : t.y - ot.y;
        const d = Math.hypot(dx, dy);
        const overlap = re + ro - d;
        if (overlap <= 0) continue;
        // separation direction (in the owning frame's axes); if exactly stacked, pick a deterministic one so
        // they still split
        let nx: number;
        let ny: number;
        if (d > 0.01) {
          nx = dx / d;
          ny = dy / d;
        } else {
          const a = ((e.id % 8) / 8) * Math.PI * 2;
          nx = Math.cos(a);
          ny = Math.sin(a);
        }
        const massO = this.yieldMass(o);
        const total = massE + massO;
        // each body moves by the OTHER's share of the overlap → the lighter body yields more
        if (e.onDeck) {
          this.pushAboard(e, nx * overlap * (massO / total), ny * overlap * (massO / total));
          this.pushAboard(o, -nx * overlap * (massE / total), -ny * overlap * (massE / total));
        } else {
          this.collision.tryMove(t, nx * overlap * (massO / total), ny * overlap * (massO / total), t.r, e.mover!.mode);
          this.collision.tryMove(ot, -nx * overlap * (massE / total), -ny * overlap * (massE / total), ot.r, o.mover!.mode);
        }
        // a DOWNED body also SLIDES a little along the push (it's shoved, not just displaced) — on the impulse channel,
        // so walls still stop it. Only the downed side slides; the walker is unaffected.
        if (isDowned(e)) this.slide(e, nx, ny);
        if (isDowned(o)) this.slide(o, -nx, -ny);
      }
    }
  }

  /** Shove each limb PART of a downed body that the circle (px, py, pr) overlaps, out along the contact normal by the
   *  overlap — the part moves, the walker doesn't (a limb has no mass to push back with). */
  private pushParts(downed: Entity, px: number, py: number, pr: number): void {
    const m = downed.mover!;
    const t = downed.transform!;
    const parts = m.ragdoll?.parts;
    if (!parts) return;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]!;
      const wx = t.x + p.x;
      const wy = t.y + p.y;
      const dx = wx - px;
      const dy = wy - py;
      const d = Math.hypot(dx, dy);
      const overlap = PART_R[i]! * t.r + pr - d;
      if (overlap <= 0) continue;
      const nx = d > 0.01 ? dx / d : 1;
      const ny = d > 0.01 ? dy / d : 0;
      pushPart(m, i, nx * overlap, ny * overlap);
    }
  }

  private slide(e: Entity, nx: number, ny: number): void {
    const m = e.mover!;
    m.dvx = nx * DOWNED_SLIDE;
    m.dvy = ny * DOWNED_SLIDE;
    m.dodgeT = Math.max(m.dodgeT, DOWNED_SLIDE_T);
  }

  /** Apply a DECK-LOCAL push to a rider IN THE FRAME THAT OWNS ITS POSITION: resolve against the DECK grid
   *  (rails/holes press back exactly like world walls — a perched body keeps its perch mask), then refresh the
   *  world projection in place so anything reading transform this tick sees the moved body (parenting only
   *  re-derives it in ShipSystem, later in the tick). */
  private pushAboard(e: Entity, plx: number, ply: number): void {
    const ship = this.world.byId(e.onDeck!.shipId); // caller pairs only same-frame bodies — onDeck is proven
    if (!ship?.ship || !ship.transform) return;
    const grid = deckOf(ship.ship.hull, ShipHulls.get(ship.ship.hull).deck);
    deckTryMove(e.onDeck!, plx, ply, grid, e.transform!.r, false, e.mover!.onLedge ?? false);
    const w = deckToWorld(ship.transform, e.onDeck!.lx, e.onDeck!.ly);
    e.transform!.x = w.x;
    e.transform!.y = w.y;
  }
}
