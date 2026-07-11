import { Abilities, abilityRange, AI_ROLE_DISENGAGE, AI_ROLE_POINT_BLANK } from '../combat/Ability';
import type { ContentId } from '../core/Registry';
import { TILE } from '../config/constants';
import { isRanged } from '../combat/equip';
import { ABILITY_BLOCK, endGuard, PARRY_WINDOW, tryGuard } from '../combat/guard';
import { phaseAt } from '../combat/phases';
import { trySprint } from '../combat/stamina';
import { attackMoveSpeed } from '../combat/attackMove';
import { facesTarget, heavyHeading, isHeavy, steerFacing } from './steering';
import { angleDiff, dist, norm, smoothFactor } from '../core/math';
import { events } from '../core/EventBus';
import { combatStance, type AIProfileDef } from '../defs/aiProfiles';
import { Bodies } from '../defs/bodies';
import { Races } from '../defs/races';
import { Sizes } from '../defs/sizes';
import { factions } from '../defs/factions';
import { ShipHulls } from '../defs/ships';
import type { Entity, Loadout } from '../ecs/components';
import type { AIContext } from './Brain';
import { FsmBrain, type FsmState } from './FsmBrain';
import { perceives } from './perception';

// All AI tuning now lives per-unit in the AIProfileDef (data), read via `p` below — no global behaviour knobs.
const profileOf = (e: Entity): AIProfileDef => e.ai!.bb.profile;

/** Daylight (px) beyond touching within which the separation push applies — ONE const shared by the
 *  prefilter and the per-pair test, so the two can never drift apart. */
const SEPARATION_GAP = 6;

/** Below this range (px) a ranged unit's predictive LEAD-AIM fades to 0 — up close the shot is near-instant and
 *  a lead would aim BEHIND a target walking into you (it shoots backward). Full lead only at/beyond this. ~4 tiles. */
const LEAD_FADE_RANGE = 130;

/** A recruited FOLLOWER heels to its leader with HYSTERESIS (two thresholds, not one) so it doesn't buzz
 *  in/out at a single tether line: it starts closing once it drifts past FOLLOW_FAR, and only stops once it's
 *  caught up inside FOLLOW_NEAR. The band between them is where it just idles at the leader's side. */
const FOLLOW_FAR = 90; // px from the leader → start walking to them
const FOLLOW_NEAR = 44; // px → close enough, stop (idle near the leader)
/** Widest transform.r any ally can have — the biggest BODY baseline × biggest race mult × biggest size band,
 *  AND ship hulls (allied ships are transform+faction entities too, and the old full scan pushed away from
 *  them; the prefilter must not silently stop). Bounds the separation() prefilter from DATA — all finite. */
const MAX_UNIT_R = Math.max(...Bodies.all().map((b) => b.r))
  * Math.max(...Races.all().map((r) => r.sizeMul))
  * Math.max(...Sizes.all().map((s) => s.mult));
const MAX_NEIGHBOR_R = Math.max(MAX_UNIT_R, ...ShipHulls.all().map((s) => s.r));

/** Turn `t.angle` toward `want` at up to `rate` rad/s (a heavy body can't snap its heading), then return the
 *  resulting FACING unit vector. Moving along this — instead of straight at the goal — makes a low-turn-rate
 *  critter lumber/arc into place, like moomoo's cows/pigs (which move along `dir`, not toward the target). */
function faceAndHeading(e: Entity, want: number, rate: number, dt: number): [number, number] {
  const t = e.transform!;
  const max = rate * dt;
  t.angle += Math.max(-max, Math.min(max, angleDiff(want, t.angle)));
  return [Math.cos(t.angle), Math.sin(t.angle)];
}

/**
 * ABILITY ROTATION (the AI moveset): the brain's default is to spam `loadout.primary` (a fast jab). A profile
 * with `specialChance > 0` instead WEAVES IN its heavier moves — the loadout's `heavy` and the `slots` (a
 * fruit's Stamp/Gatling/Rocket, a style's committed strike). Generic on purpose: the candidates come from the
 * unit's OWN loadout (the truth), never a per-unit list — so soldier/brawler/Luffy all rotate with the SAME
 * code, and any future fruit/style/weapon a unit carries joins the rotation automatically (the Moat).
 *
 * Returns the special to throw THIS swing, or undefined to fall through to the primary. A special is eligible
 * only when it's OFF cooldown, AFFORDABLE (stamina), and the target is inside THAT ability's own reach (a
 * 140px Stamp is usable from far; an 85px Gatling only up close). Slots are tried before `heavy` (the flashy
 * specials read as the payoff; the heavy is the fallback). The `specialChance` roll (seeded `ai` stream) gates
 * how often it reaches for one at all — so it still throws the quick primary most of the time, punctuated by a
 * special, rather than only ever casting the biggest move it can afford.
 */
export function pickAttack(e: Entity, ctx: AIContext, targetDist: number): ContentId {
  const lo = e.loadout!;
  const p = profileOf(e);
  // REGROUPING = conserve: a harrying regrouper only throws its CHEAP primary (a jab), never a pricey special —
  // else it'd blow the bar it's trying to refill. The whole point of the reset survives the harry pressure.
  if (e.ai?.bb.regrouping === true) return lo.primary;
  const chance = p.specialChance ?? 0;
  if (chance <= 0 || ctx.rng.next() >= chance) return lo.primary; // fodder (chance 0) always jabs; else roll to reach for a special
  const reach = e.attributes?.get('reach') ?? 0;
  const stam = e.combatant?.stam ?? 0;
  // slots (fruit specials / style payoff) first, then the heavy as the fallback — the rotation's priority order
  const candidates = [...lo.slots, lo.heavy];
  for (const id of candidates) {
    if (!id || id === lo.primary) continue;
    const ab = Abilities.get(id);
    if ((ab.costStam ?? 0) > stam) continue; // can't pay for it — skip (don't stall on an unaffordable move)
    if (!ctx.abilities.ready(e, id)) continue; // on cooldown
    // the target must be inside THIS ability's own range — a special has its own reach, not the primary's (a
    // 140px Stamp reaches far, an 85px Gatling only close). Center-to-center vs ability range; the strike-point
    // already ensured we're in primary reach, this just filters which specials can also connect from here.
    if (targetDist <= abilityRange(ab, reach)) return id;
  }
  return lo.primary; // nothing special is ready/in-range → the reliable jab
}

/** What a PINNED regrouper does this beat about the Rocket-reposition — a COMMIT-then-conserve mini-intent
 *  (bb.plannedSpecial), the answer to "how does he ever reach the Rocket instead of jabbing it away?":
 *   - 'fire'    — a plan is set AND he can now pay for it (+ facing) → activate the heavy, clear the plan.
 *   - 'conserve'— a plan is set but the heavy is NOT yet affordable/ready → do NOT jab (jabbing spends the very
 *                 stamina the plan is saving); hold/juke to regen until it becomes affordable.
 *   - 'jab'     — no plan (either never rolled one, or rolled against it) → the normal cheap harry jab.
 *  The 1-in-N roll happens ONCE at commit (not per beat), so the decision persists and the jab logic can defer
 *  to it — that persistence is the whole point (a per-beat re-roll would let the jab starve the Rocket). */
/** The loadout ability that LEAPS the body (Gomu Rocket): a launch/dash move — `selfImpulse` set. That's what
 *  makes the reposition work (jump THROUGH the target, land behind); a non-leaping heavy like Stamp just stomps
 *  in place. Scanned generically from the loadout (heavy + slots) by the leap PROPERTY, not hardcoded to Rocket,
 *  so any future fruit/style with a launching special repositions the same way. Undefined ⇒ no leaper in kit. */
function leapSpecial(e: Entity): ContentId | undefined {
  const lo = e.loadout;
  if (!lo) return undefined;
  for (const id of [lo.heavy, ...lo.slots]) {
    if (!id || id === lo.primary) continue;
    const ab = Abilities.get(id);
    if (ab.selfImpulse && ab.selfImpulse > 0) return id; // it launches the body → a real reposition
  }
  return undefined;
}

/** The first GRANTED ability carrying an AI role tag (AbilityDef.tags) — the role lives on the ABILITY, never on
 *  a slot POSITION (a weapon reordering its slots must not silently change AI behavior). Same scan-by-property
 *  pattern as leapSpecial above. Undefined ⇒ the kit has no ability in that role. */
function grantedWithRole(lo: Loadout, role: string): ContentId | undefined {
  for (const id of lo.granted) if (Abilities.get(id).tags?.includes(role)) return id;
  return undefined;
}

/** Re-arm gap (s) for a chance-gated attack DECISION — how long between rolls, so a `chance` is per-decision not
 *  per-tick. Matches the guardCd cadence (0.8s): about one decision per attack beat, never a re-roll-until-it-hits. */
export const DECIDE_CADENCE = 0.8;

/** KITE beat ENGINE limit: the longest a reposition runs before it gives up + re-aims (never marches forever).
 *  The beat PERSONALITY knobs (aim time, pause, step, comfort width, juke chance, chase budget) are per-profile
 *  DATA — AIProfileDef.kite* (a sniper and a skirmisher differ on exactly those), not engine consts. */
const KITE_REPOSITION_MAX = 1.1;
/** KITE stuck give-up (s): if a repositioning kiter has been PINNED (trying to move, going nowhere) this long, it
 *  abandons the move and re-plants (stands to fight) — no more sprinting-in-place in a corner. */
const KITE_STUCK_GIVEUP = 0.4;
/** A kiter's BUCKSHOT (slot 0) trigger radius as a FRACTION of the blast's own range — so a scatter can fire
 *  from meaningfully inside its cone, not just point-blank, and reaches FARTHER than the melee butt-jab. 0.7 =
 *  commit once you're within ~70% of the pellets' reach (not at the lip where the spread has thinned). */
const BUCKSHOT_TRIGGER_FRAC = 0.7;

/** Pick a committed reposition DESTINATION for a kiter's beat, stored on the blackboard as a fixed point (NOT a
 *  per-frame vector — so the move ignores the target's micro-movements, the anti-bot property). Three cases by
 *  spacing to the foe (foeX/foeY, at distance d):
 *   - TOO CLOSE (< preferredRange): back away (or back-diagonal) to MAKE SPACE.
 *   - TOO FAR (> preferredRange, roughly): CLOSE THE GAP — a committed step to a spot ~preferredRange out along
 *     the line to the foe (so it advances in DISCRETE beats, not a per-pixel follow).
 *   - GOOD SPACING: a lateral JUKE (reposition without giving/closing ground).
 *  Seeded off the ai stream for determinism, varied per unit by id. */
function planKiteReposition(e: Entity, ctx: AIContext, foeX: number, foeY: number, d: number, pref: number): void {
  const t = e.transform!;
  const bb = e.ai!.bb;
  const p = profileOf(e); // the beat personality (step distance, comfort width) is profile data
  const faceFoe = Math.atan2(foeY - t.y, foeX - t.x);
  const away = faceFoe + Math.PI;
  const side = (e.id % 2 === 0 ? 1 : -1) * (Math.PI / 2);
  const roll = ctx.rng.next();
  if (d > pref + p.kiteComfortWidth) {
    // TOO FAR → advance a FIXED kiteStep toward the foe (a reachable committed step, NOT a spot at the foe that
    // a fleeing target outruns — that made it creep). It re-evaluates after each step, capped by kiteChaseSteps.
    bb.kiteDestX = t.x + Math.cos(faceFoe) * p.kiteStep;
    bb.kiteDestY = t.y + Math.sin(faceFoe) * p.kiteStep;
  } else if (d < pref) {
    // TOO CLOSE (inside the band's near edge) → back off toward the band middle (or a back-diagonal).
    const dir = roll < 0.6 ? away : away + (roll < 0.8 ? side : -side);
    bb.kiteDestX = t.x + Math.cos(dir) * p.kiteStep;
    bb.kiteDestY = t.y + Math.sin(dir) * p.kiteStep;
  } else {
    // INSIDE the band → a lateral JUKE (reposition without giving/closing ground, to look alive + dodge).
    const dir = roll < 0.5 ? faceFoe + side : faceFoe - side;
    bb.kiteDestX = t.x + Math.cos(dir) * p.kiteStep;
    bb.kiteDestY = t.y + Math.sin(dir) * p.kiteStep;
  }
}

/** JUKE-ROLL a kiter's reposition (profile.jukeRollChance): a chance to DASH to the just-planned destination
 *  instead of walking there — a trained, evasive relocate (a marine dive-rolling to cover). Seeds velocity
 *  toward `kiteDestX/Y` (the velocity-following dash impulse tumbles that way), then fires the dash. Returns true
 *  if it rolled (so the caller knows a burst is underway; the normal walk-to-dest still finishes any remainder).
 *  No-ops (returns false) when: no dash, on cooldown, mid-dodge, no destination, or the roll misses. */
function tryKiteRoll(e: Entity, ctx: AIContext): boolean {
  const bb = e.ai!.bb;
  const p = profileOf(e);
  const m = e.mover!;
  const t = e.transform!;
  if (!((p.jukeRollChance ?? 0) > 0) || bb.kiteDestX === undefined) return false;
  const dash = e.loadout?.dash;
  if (!dash || !ctx.abilities.ready(e, dash) || m.dodgeT > 0) return false;
  if (!ctx.rng.chance(p.jukeRollChance!)) return false; // ! : proven > 0 by the first guard of this fn
  const [dx, dy] = norm(bb.kiteDestX - t.x, (bb.kiteDestY ?? t.y) - t.y);
  m.vx = dx * m.speed; // seed the roll direction so the velocity-following impulse tumbles toward the dest
  m.vy = dy * m.speed;
  ctx.abilities.activate(e, dash);
  return true;
}

export type RegroupAct = 'fire' | 'conserve' | 'jab';
export function planRegroupSpecial(e: Entity, ctx: AIContext): RegroupAct {
  const bb = e.ai!.bb;
  const p = profileOf(e);
  const chance = p.rocketEscapeChance ?? 0;
  // an existing plan drives everything until it fires or is abandoned (the persisted commitment) — runs EVERY
  // tick (the decision is already made; we're just waiting for it to become affordable, then firing it).
  if (bb.plannedSpecial) {
    if (ctx.abilities.ready(e, bb.plannedSpecial)) return 'fire'; // affordable + off cooldown → take it
    return 'conserve'; // saving up — must NOT jab, or we spend the stamina the plan needs
  }
  const leap = leapSpecial(e);
  if (chance <= 0 || !leap) return 'jab'; // no repositioning (leaping) special in kit → just jab
  // CADENCE GATE (the fix for the per-tick snowball): only ROLL when the decision clock is ready, then re-arm it
  // whether the roll hits or misses — so a miss WAITS OUT the cadence (jabbing meanwhile) instead of re-rolling
  // next tick until it trivially succeeds. THIS is what makes `chance` mean "~35% per decision", not "per frame".
  if ((bb.decideCd ?? 0) > 0) return 'jab'; // not time to re-decide yet → the normal jab
  bb.decideCd = DECIDE_CADENCE; // consume this decision slot (armed regardless of the roll outcome below)
  if (ctx.rng.next() < chance) {
    bb.plannedSpecial = leap; // committed — now conserve toward it (or fire if already affordable)
    return ctx.abilities.ready(e, leap) ? 'fire' : 'conserve';
  }
  return 'jab'; // rolled against it this decision → jab, and don't roll again until the cadence re-opens
}

/** Boids-style separation from same-faction allies, so they don't stack on a target.
 *  Goes through SpatialQuery — the ONE swap point for the future uniform grid — never world.with() directly:
 *  a neighbor scan that bypasses the chokepoint would silently stay O(N) after the grid lands. */
function separation(e: Entity, ctx: AIContext): [number, number] {
  const t = e.transform!;
  const mine = e.faction!.id;
  let sx = 0;
  let sy = 0;
  // prefilter radius covers the widest possible pair (own r + widest neighbor + the gap); the exact
  // per-pair test below still decides — the query only bounds WHO we look at
  const near = ctx.query.within(t.x, t.y, t.r + MAX_NEIGHBOR_R + SEPARATION_GAP, (o) => o !== e && !!o.faction && factions.isAlly(mine, o.faction.id));
  for (const o of near) {
    const ot = o.transform!;
    const d = dist(t.x, t.y, ot.x, ot.y);
    if (d > 0 && d < t.r + ot.r + SEPARATION_GAP) {
      sx += (t.x - ot.x) / d;
      sy += (t.y - ot.y) / d;
    }
  }
  return [sx, sy];
}

/** Can this entity actually perceive the target? In the cone/near radius, AND with line-of-sight (walls hide). */
function spot(e: Entity, ctx: AIContext): Entity | undefined {
  const t = e.transform!;
  const p = profileOf(e);
  const foe = ctx.query.nearestHostile(e, p.sight);
  if (!foe || !perceives(e, foe, p)) return undefined;
  return ctx.pathfinder.lineOfSight(t.x, t.y, foe.transform!.x, foe.transform!.y, e.mover!.mode) ? foe : undefined;
}

/** Can this entity see a specific target right now (in cone/near radius + line-of-sight)? */
function canSee(e: Entity, target: Entity, ctx: AIContext): boolean {
  const tr = target.transform;
  if (!tr) return false;
  const t = e.transform!;
  const p = profileOf(e);
  if (dist(t.x, t.y, tr.x, tr.y) > p.sight || !perceives(e, target, p)) return false;
  return ctx.pathfinder.lineOfSight(t.x, t.y, tr.x, tr.y, e.mover!.mode);
}

/**
 * Steer toward (ax,ay): straight if the body can clear the direct line, else A* around walls (cached, repathed
 * every 0.5s). Returns a raw (dx,dy) toward the next waypoint. Shared by chase (pursuit) and wander (returning
 * to post), so both route around blocks identically. Manages bb.path / pathIdx / repathT.
 */
function routeTo(e: Entity, ctx: AIContext, dt: number, ax: number, ay: number): [number, number] {
  const t = e.transform!;
  const m = e.mover!;
  const bb = e.ai!.bb;
  if (ctx.pathfinder.clearLine(t.x, t.y, ax, ay, m.mode, t.r)) {
    bb.path = null;
    return [ax - t.x, ay - t.y];
  }
  let path = bb.path;
  const rep = ((bb.repathT) ?? 0) - dt;
  if (!path || rep <= 0) {
    path = ctx.pathfinder.findPath(t.x, t.y, ax, ay, m.mode);
    bb.path = path;
    bb.pathIdx = 0;
    bb.repathT = 0.5;
  } else {
    bb.repathT = rep;
  }
  let wx = ax;
  let wy = ay;
  if (path && path.length) {
    let idx = (bb.pathIdx) ?? 0;
    while (idx < path.length && dist(t.x, t.y, path[idx].x, path[idx].y) < TILE * 0.5) idx++;
    bb.pathIdx = idx;
    if (idx < path.length) {
      wx = path[idx].x;
      wy = path[idx].y;
    }
  }
  return [wx - t.x, wy - t.y];
}

/** A recruited follower's "post" is its leader: track the leader's position into `bb.home` each tick, so the
 *  existing wander/return-home logic keeps it near the player (and chase-on-sight still fights). Leader gone
 *  (dead/despawned) ⇒ stop following, hold the last spot. */
function syncFollow(e: Entity, ctx: AIContext): void {
  const bb = e.ai!.bb;
  if (bb.followId === undefined) return;
  const leader = ctx.world.byId(bb.followId);
  if (leader?.transform && !leader.health?.dead) {
    bb.home.x = leader.transform.x;
    bb.home.y = leader.transform.y;
  } else {
    bb.followId = undefined; // leader gone → become a normal post-holder at the current home
  }
}

const wander: FsmState = {
  update(e, ctx, dt) {
    const t = e.transform!;
    const m = e.mover!;
    const bb = e.ai!.bb;
    const p = profileOf(e);
    syncFollow(e, ctx); // a follower's home tracks its leader (the player)

    const foe = spot(e, ctx);
    if (foe) {
      bb.lastSeenX = foe.transform!.x;
      bb.lastSeenY = foe.transform!.y;
      bb.lostT = 0;
      bb.perceivedX = foe.transform!.x; // seed perceived position = actual on first sighting
      bb.perceivedY = foe.transform!.y;
      bb.quarryId = foe.id;
      // FRESH SIGHTING → the "!" double-take (alert state) before committing. A passive critter (or a
      // spotDelay-0 profile) skips straight to its response — no double-take for a fleeing prey animal.
      return p.passive || p.spotDelay <= 0 ? 'chase' : 'alert';
    }
    // struck → fighters go investigate/retaliate; passive critters bolt away instead
    if (((bb.alertT) ?? 0) > 0) return p.passive ? 'flee' : 'chase';

    bb.path = null;
    if (p.passive) {
      // WILDLIFE has no post — it never marches "home". It picks the next spot relative to WHERE IT IS, so it
      // drifts freely (a slow random walk), grazing wherever it ends up (incl. after a flee). Bounded only by
      // the coast/walls via collision, so it just roams the island.
      bb.wanderT -= dt;
      if (bb.wanderT <= 0 || bb.roamX == null) {
        bb.wanderT = ctx.rng.range(2, 5); // graze / pause a good while between ambles
        if (ctx.rng.chance(0.35)) {
          bb.roamX = t.x; // stand and graze in place
          bb.roamY = t.y;
        } else {
          const a = ctx.rng.range(0, Math.PI * 2);
          const r = ctx.rng.range(50, 130); // a short amble FROM HERE → it slowly wanders over time, never returning to spawn
          bb.roamX = t.x + Math.cos(a) * r;
          bb.roamY = t.y + Math.sin(a) * r;
        }
      }
    } else if (bb.followId !== undefined) {
      // FOLLOWER: heel to the leader (bb.home tracks them via syncFollow) with HYSTERESIS — start closing past
      // FOLLOW_FAR, keep closing until inside FOLLOW_NEAR, then idle. The band stops the buzz-at-one-line jitter.
      const d = dist(t.x, t.y, bb.home.x, bb.home.y);
      if (d > FOLLOW_FAR) bb.heeling = true;
      else if (d < FOLLOW_NEAR) bb.heeling = false;
      if (bb.heeling) {
        const [dx, dy] = routeTo(e, ctx, dt, bb.home.x, bb.home.y);
        const [nx, ny] = norm(dx, dy);
        if (nx !== 0 || ny !== 0) t.angle += angleDiff(Math.atan2(ny, nx), t.angle) * smoothFactor(p.wanderTurn, dt);
        m.vx = nx * m.speed;
        m.vy = ny * m.speed;
        return;
      }
      // in the band → idle-ROAM in a small bubble at the leader's side (a live crew member, not a statue). The
      // roam radius stays WELL inside FOLLOW_FAR so an amble can't drift out and re-trigger heeling (a slow
      // oscillation). Picks a target here, then falls through to the shared amble-toward-roamXY below.
      bb.wanderT -= dt;
      if (bb.wanderT <= 0 || bb.roamX == null) {
        bb.wanderT = ctx.rng.range(1.5, 3);
        if (ctx.rng.chance(0.5)) {
          const a = ctx.rng.range(0, Math.PI * 2);
          const r = ctx.rng.next() * (FOLLOW_FAR * 0.45); // small bubble, safely inside the re-close line
          bb.roamX = bb.home.x + Math.cos(a) * r;
          bb.roamY = bb.home.y + Math.sin(a) * r;
        } else {
          bb.roamX = t.x; // pause in place
          bb.roamY = t.y;
        }
      }
    } else {
      // post-holder (townsfolk / an idle fighter): strayed from its post → route back, pathfinding AROUND any
      // block, at a purposeful walk. Otherwise idle-roam to random spots WITHIN the post radius, pausing between.
      const tether = p.wanderTether; // per-unit data: guards hug their post, roamers range wider
      if (dist(t.x, t.y, bb.home.x, bb.home.y) > tether) {
        const [dx, dy] = routeTo(e, ctx, dt, bb.home.x, bb.home.y);
        const [nx, ny] = norm(dx, dy);
        if (nx !== 0 || ny !== 0) t.angle += angleDiff(Math.atan2(ny, nx), t.angle) * smoothFactor(p.wanderTurn, dt);
        m.vx = nx * m.speed;
        m.vy = ny * m.speed;
        return;
      }
      bb.wanderT -= dt;
      if (bb.wanderT <= 0 || bb.roamX == null) {
        bb.wanderT = ctx.rng.range(1.5, 3);
        if (ctx.rng.chance(0.5)) {
          const a = ctx.rng.range(0, Math.PI * 2);
          const r = ctx.rng.next() * tether * 0.7; // stay comfortably inside the tether
          bb.roamX = bb.home.x + Math.cos(a) * r;
          bb.roamY = bb.home.y + Math.sin(a) * r;
        } else {
          bb.roamX = t.x; // pause in place
          bb.roamY = t.y;
        }
      }
    }
    const rdx = (bb.roamX ?? t.x) - t.x; // roam target is set by the blocks above; ?? satisfies the checker
    const rdy = (bb.roamY ?? t.y) - t.y;
    const rd = Math.hypot(rdx, rdy);
    // a FOLLOWER roams at its full WALK speed (the player can't stroll at grazing pace, so a slow-ambling crew
    // member reads inconsistent); townsfolk/wildlife keep the slower wanderSpeed graze.
    const roamSpeed = bb.followId !== undefined ? m.speed : p.wanderSpeed;
    if (rd > 4) {
      const want = Math.atan2(rdy, rdx);
      if (p.turnSpeed != null) {
        // heavy-body lumber: turn at a capped rate, then amble along the FACING so it arcs into place
        const [hx, hy] = faceAndHeading(e, want, p.turnSpeed, dt);
        m.vx = hx * roamSpeed;
        m.vy = hy * roamSpeed;
      } else {
        // face the way it walks — don't moonwalk; also points the vision cone where it's headed
        t.angle += angleDiff(want, t.angle) * smoothFactor(p.wanderTurn, dt);
        m.vx = (rdx / rd) * roamSpeed;
        m.vy = (rdy / rd) * roamSpeed;
      }
    } else {
      m.vx = 0;
      m.vy = 0;
    }
  },
};

/**
 * ALERT — the "!" double-take between SEEING a target and giving chase. On enter, mark the spot delay + fire the
 * "!" marker; then HOLD position (facing the target, turn-capped for a heavy body) while the delay ticks down,
 * and commit to `chase`. Lose sight before it expires → stand down to `wander` (you slipped away). This is the
 * readable "I've been spotted" beat — data-driven via profile.spotDelay (a sharp soldier reacts fast, a dozy
 * thug slow); spotDelay 0 skips this state entirely (wander → chase directly).
 */
const alert: FsmState = {
  enter(e) {
    const bb = e.ai!.bb;
    bb.spotT = profileOf(e).spotDelay;
    const t = e.transform!;
    events.emit('fx:spotted', { x: t.x, y: t.y - t.r - 14, dur: bb.spotT }); // the "!" over the head (presentation draws it)
  },
  update(e, ctx, dt) {
    const t = e.transform!;
    const m = e.mover!;
    const bb = e.ai!.bb;
    const p = profileOf(e);
    m.vx = 0; // the double-take is a HOLD — it stops and registers you before pursuing
    m.vy = 0;

    const foe = spot(e, ctx);
    if (foe) {
      bb.lastSeenX = foe.transform!.x;
      bb.lastSeenY = foe.transform!.y;
      bb.perceivedX = foe.transform!.x;
      bb.perceivedY = foe.transform!.y;
      // turn to face the target during the beat (turn-capped for a heavy body — the Moat / ai/steering)
      const want = Math.atan2(foe.transform!.y - t.y, foe.transform!.x - t.x);
      if (isHeavy(p)) steerFacing(e, want, p, dt, false);
      else t.angle = want;
    } else {
      // lost sight during the double-take → stand down (unless a follower who was told to hold a quarry)
      return 'wander';
    }

    bb.spotT = Math.max(0, (bb.spotT ?? 0) - dt);
    if ((bb.spotT ?? 0) <= 0) return 'chase'; // registered → commit to the pursuit
  },
};

const chase: FsmState = {
  update(e, ctx, dt) {
    const t = e.transform!;
    const m = e.mover!;
    const bb = e.ai!.bb;
    const p = profileOf(e);
    syncFollow(e, ctx); // keep a follower's home on the leader, so it returns to the player after a fight
    const loadout = e.loadout; // the AI query doesn't guarantee a loadout — a kit-less actor can't fight
    if (!loadout) return 'wander';

    // squad focus-fire: engage the squad's chosen target if I can see it, else whatever I can see myself
    // (ids at rest → resolve to a live entity per tick; a destroyed target simply reads as undefined)
    const focus = bb.focusId !== undefined ? ctx.world.byId(bb.focusId) : undefined;
    const foe = focus && !focus.health?.dead && canSee(e, focus, ctx) ? focus : spot(e, ctx);
    bb.alertT = Math.max(0, ((bb.alertT) ?? 0) - dt); // "I was hit" investigate-timer ticks down
    if (foe) {
      bb.quarryId = foe.id; // remember who we're after, so we can keep pursuing once sight breaks
      bb.lastSeenX = foe.transform!.x;
      bb.lastSeenY = foe.transform!.y;
      bb.lostT = 0;
    } else {
      bb.lostT = ((bb.lostT) ?? 0) + dt;
    }

    // disengage: lost sight too long (and no longer alerted), or strayed past the leash with no target
    const strayed = dist(t.x, t.y, bb.home.x, bb.home.y) > p.leash;
    if (!foe && (bb.alertT) <= 0 && ((bb.lostT) > p.loseSightSec || strayed)) {
      bb.path = null;
      bb.perceivedX = undefined; // forget perceived aim; re-seed fresh on next sighting
      bb.quarryId = undefined;
      return 'wander';
    }

    // GUARD: read the foe's windup and answer with a block or a parry — the SAME tryGuard the player's
    // F key calls (the Moat); skill is the profile's blockChance/parryChance, not privileged timing.
    bb.guardCd = Math.max(0, (bb.guardCd ?? 0) - dt);
    if ((bb.guardT ?? 0) > 0) {
      bb.guardT = (bb.guardT ?? 0) - dt;
      if ((bb.guardT ?? 0) > 0 && foe) {
        // square up and stand ground — the guard is an ARC of facing, so turning to the attacker IS the block
        t.angle = Math.atan2(foe.transform!.y - t.y, foe.transform!.x - t.x);
        m.vx = 0;
        m.vy = 0;
        bb.path = null;
        return;
      }
      endGuard(e); // hold expired (or the foe vanished mid-guard) — arms down, back to the fight
      bb.guardT = 0;
    } else if (foe?.melee && !e.melee && e.loadout?.granted.has(ABILITY_BLOCK) && (p.blockChance > 0 || p.parryChance > 0) && (bb.guardCd ?? 0) <= 0) {
      // CAPABILITY first (the grant — same generic granted.has() check every ability uses), then POLICY
      // (blockChance/parryChance — how often to use a guard it HAS). Cleanly split: no guard unless it's in
      // the kit, and the profile only tunes frequency. A parry roll on a block-only unit falls back to a block.
      const fm = foe.melee;
      const fp = fm.dur > 0 ? Math.min(1, fm.t / fm.dur) : 1;
      const windupLeft = (fm.phases.windup - fp) * fm.dur; // seconds until his strike goes LIVE
      const fd = Abilities.get(fm.ability);
      const threat = abilityRange(fd, foe.attributes?.get('reach') ?? 0) + t.r + 20; // his steel can actually reach us (+ a step)
      // decide at the END of his windup (once the parry window can cover his active phase) — one roll per
      // swing (guardCd), so a low chance means "usually doesn't", never "re-rolls until it does"
      if (phaseAt(fm.phases, fp) === 'windup' && windupLeft <= PARRY_WINDOW && dist(t.x, t.y, foe.transform!.x, foe.transform!.y) <= threat) {
        bb.guardCd = 0.8;
        const roll = ctx.rng.next();
        if (roll < p.parryChance) {
          if (tryGuard(e, true)) bb.guardT = PARRY_WINDOW; // PARRY: open the deflection window, ride it, arms down
        } else if (roll < p.parryChance + p.blockChance) {
          if (tryGuard(e, false)) bb.guardT = Math.max(0.3, fm.dur - fm.t + 0.15); // BLOCK: pure hold, NO parry window (rolled block ≠ a free parry)
        }
      }
    }

    // out of sight: pursue the quarry's ACTUAL position. The pathfinder routes via where they vanished (the
    // block's corner) and on to them, so it reads as "went after you" AND actually rounds the block — rather
    // than looping at a last-seen point it can't stand on next to a wall. Last-seen is only the fallback for
    // a quarry that's gone. The give-up timer still bounds how long it can pursue blind.
    let rx: number;
    let ry: number;
    const quarry = bb.quarryId !== undefined ? ctx.world.byId(bb.quarryId) : undefined;
    // A KITER that's lost sight does NOT track your live position through cover — a marksman can't shoot what he
    // can't see, so chasing your exact coords behind a wall reads as an omniscient per-pixel bot. He instead
    // routes to the LAST-SEEN spot (the corner you vanished behind) to try to re-acquire a lane, then gives up
    // (loseSightSec). A rusher still pursues the live quarry (line-of-sight-blind melee chase IS its job).
    const kiterLostSight = !foe && isRanged(e) && p.approach === 'kite';
    if (foe) {
      rx = foe.transform!.x;
      ry = foe.transform!.y;
    } else if (!kiterLostSight && quarry?.transform && !quarry.health?.dead) {
      rx = quarry.transform.x;
      ry = quarry.transform.y;
    } else {
      rx = bb.lastSeenX; // the stale spot — investigate it, don't mirror the live target
      ry = bb.lastSeenY;
    }

    // Perceived (reaction-lagged) target position: the enemy aims & commits to where it THINKS you are.
    // A still target is tracked exactly and gets hit; a moving one is punched where it *was* → natural misses.
    const react = p.reaction;
    if (bb.perceivedX === undefined || bb.perceivedY === undefined) {
      bb.perceivedX = rx;
      bb.perceivedY = ry;
    }
    const lag = smoothFactor(1 / react, dt); // exp form: same convergence per real second at any fps
    bb.perceivedX += (rx - bb.perceivedX) * lag;
    bb.perceivedY += (ry - bb.perceivedY) * lag;
    let px = bb.perceivedX;
    let py = bb.perceivedY;
    // LEAD AIM (predictive): aim where the target WILL be — the perceived pos pushed along its velocity × leadAim
    // (the Calamity-boss trick that beats circle-kiting: steady orbiting just feeds the boss your future spot, so
    // the counter becomes CHANGING speed/direction, not merely circling). Reads the visible target's mover; falls
    // back to no lead if the target isn't currently visible (we don't know its velocity, only a stale position).
    // FADE THE LEAD BY RANGE: a slow ranged shot needs lead at DISTANCE (the ball travels), but point-blank the
    // ball lands instantly AND the lead lands BEHIND the target (a target walking INTO you would be aimed at
    // where it'd be past your back) — so shrink the lead to 0 within LEAD_FADE_RANGE. Aim right at a close foe.
    if (p.leadAim && p.leadAim > 0 && foe?.mover) {
      const d0 = dist(t.x, t.y, rx, ry);
      const leadScale = Math.min(1, d0 / LEAD_FADE_RANGE); // 0 point-blank → 1 at/after the fade range
      px += foe.mover.vx * p.leadAim * leadScale;
      py += foe.mover.vy * p.leadAim * leadScale;
    }
    // weave/sway phase (each unit offset by id so a group doesn't sync); also drives the serpentine approach below
    bb.weaveT = ((bb.weaveT) ?? e.id % 7) + dt * p.weaveFreq;
    const wantAim = Math.atan2(py - t.y, px - t.x) + Math.sin(bb.weaveT) * p.faceSway; // (lagged, optionally led) aim + a living sway
    // FACING: a heavy body (bull) eases at its turn cap and FREEZES mid-swing (a committed headbutt can't re-aim);
    // a light fighter pivots instantly. All the heavy-body rules live in ai/steering (the ONE home).
    if (isHeavy(p)) steerFacing(e, wantAim, p, dt, !!e.melee);
    else t.angle = wantAim;

    const d = dist(t.x, t.y, rx, ry);
    const ability = Abilities.get(loadout.primary);
    const range = abilityRange(ability, e.attributes?.get('reach') ?? 0);
    const reach = (range || 16) + (foe?.transform?.r ?? 11);
    const strike = reach * p.strikeFrac; // where it actually stops to attack — inside the edge so blows land
    const hpRatio = e.health ? e.health.hp / e.health.maxHp : 1;
    const broken = e.squad ? bb.broken === true : false;
    const stamFrac = e.combatant && e.combatant.maxStam > 0 ? e.combatant.stam / e.combatant.maxStam : 1;
    let stance = combatStance(p, d, strike, hpRatio, dist(rx, ry, bb.home.x, bb.home.y), stamFrac, bb.regrouping === true);
    // KITER INVESTIGATING (lost sight → rx/ry is the last-seen corner): the kite stance would read that nearby
    // point as "a target too close" and BACK AWAY from it — so he'd never peek the corner. Override: walk TO the
    // spot to re-acquire (approach), then HOLD once on it (no phantom target to shoot). loseSightSec still bounds it.
    if (kiterLostSight) stance = { move: d > TILE * 0.75 ? 'approach' : 'hold', attack: false, regroup: false };
    bb.regrouping = stance.regroup; // persist the stamina-hysteresis state (pure fn decides, brain remembers)
    if (!bb.regrouping) bb.plannedSpecial = undefined; // re-engaged (bar recovered) → abandon any saved-for Rocket plan
    bb.decideCd = Math.max(0, (bb.decideCd ?? 0) - dt); // tick the attack-decision clock (gates chance-rolls per DECISION, not per tick)

    // STUCK DETECTION (anti "sprint into the wall forever"): if it TRIED to move last tick (had velocity) but its
    // position barely changed, it's pinned (a wall/corner). Accumulate stuckT; the kite-commitment below reads it
    // to STOP fleeing and stand+fight instead of running in place. Reset when it makes real progress.
    const moved = bb.pinX !== undefined ? Math.hypot(t.x - bb.pinX, t.y - (bb.pinY ?? t.y)) : 1;
    const tryingToMove = Math.hypot(m.vx, m.vy) > 8;
    bb.stuckT = tryingToMove && moved < 1.2 ? (bb.stuckT ?? 0) + dt : 0; // < ~1.2px while pushing = pinned
    bb.pinX = t.x;
    bb.pinY = t.y;

    // routing state (also gates the kite beat loop below — a low-HP kiter FLEES, it doesn't stand and plink)
    const fleeing = broken || (p.fleeBelowHp != null && hpRatio <= p.fleeBelowHp);

    // ── DISCRETE KITE BEAT LOOP (the anti-"per-pixel bot" model) ────────────────────────────────────────────
    // A ranged kiter does NOT continuously mirror your position (the bot tell). It cycles in DISCRETE BEATS:
    //   PLANT  — stand still, aim, fire when ready.
    //   PAUSE  — a short beat after firing (the deliberate breath).
    //   REPOSITION — pick ONE destination (back / juke L / juke R) and COMMIT, moving there via pathfinding,
    //                ignoring your micro-movements. Arrive (or time out) → back to PLANT.
    // Because it moves to a CHOSEN SPOT, inching toward it doesn't make it twitch — it's mid-plan. That reads
    // as tactical (predictable, punishable) instead of glued to your exact distance. Point-blank it Buttstrokes.
    if (p.approach === 'kite' && foe && isRanged(e) && !fleeing) {
      const ft = foe.transform!;
      const face = Math.atan2(ft.y - t.y, ft.x - t.x);
      t.angle = wantAim; // keep the (led/lagged) aim from above — it shoots where it looks
      bb.kiteBeatT = Math.max(0, (bb.kiteBeatT ?? 0) - dt);
      // default first phase = reposition with a spent timer → it flips to AIM next tick and ARMS the settle, so
      // the very first shot also lines up (never a free instant snap on acquisition).
      if (bb.kitePhase === undefined) { bb.kitePhase = 'reposition'; bb.kiteBeatT = 0; }
      const phase = bb.kitePhase;
      const cb = e.combatant;

      // CLOSE-RANGE ANSWER — a TWO-TIER close game (the marine's identity):
      //   • BUCKSHOT BAND (out to the scatter's own reach): the pellets FLY, so he can blast from farther than a
      //     butt-jab. Inside this band but not yet point-blank, he MAY blast (pointBlankSlotChance roll); if it
      //     misses / Buckshot's on cd, he falls through to normal kiting (keep shooting).
      //   • POINT-BLANK (≤ meleeRange): someone's on top → he answers for sure — the shove-or-blast GAMBLE (same
      //     roll picks Buckshot vs the Buttstroke; falls back to whichever is off cooldown so he never freezes).
      // The blast's trigger radius is DATA (the slot ability's own range × a fraction — commit when meaningfully
      // inside the cone, not at its lip), NOT a magic number. Then force a fresh reposition (one decision/moment).
      // The kit's close-game moves come from ROLE TAGS on the abilities (AI_ROLE_*), never slot positions — a
      // weapon reordering its slots must not silently swap which move is "the blast" (the leapSpecial pattern).
      const blast = grantedWithRole(loadout, AI_ROLE_POINT_BLANK); // the ranged close answer (Buckshot)
      const disengage = grantedWithRole(loadout, AI_ROLE_DISENGAGE); // the space-maker (Shock Kick)
      const melee = p.meleeRange ?? 0;
      const heavyReady = ctx.abilities.ready(e, loadout.heavy);
      const blastReady = blast !== undefined && ctx.abilities.ready(e, blast);
      const blastBand = blast !== undefined ? abilityRange(Abilities.get(blast), e.attributes?.get('reach') ?? 0) * BUCKSHOT_TRIGGER_FRAC : 0;
      // ONE roll per close ENGAGEMENT, edge-triggered: latch the gamble when the target ENTERS the close band,
      // clear it when they leave or after an answer fires. A per-tick Bernoulli here re-rolls 60×/s, turning a
      // 40% "gamble" into a near-certainty within 0.1s (the re-roll-until-it-hits bug the decide-cadence rule
      // exists to prevent) — the latch is what makes pointBlankSlotChance mean what it says.
      const inCloseBand = (melee > 0 && d <= melee) || (blastBand > 0 && d <= blastBand);
      if (inCloseBand && bb.closeRoll === undefined) bb.closeRoll = ctx.rng.chance(p.pointBlankSlotChance ?? 0);
      else if (!inCloseBand) bb.closeRoll = undefined; // left the band — the next engagement re-rolls
      const rollsBlast = bb.closeRoll === true;
      // pick the close move: at point-blank either move (gamble → shove/blast, fall back to the ready one); in the
      // wider blast band ONLY a blast, and only if the roll wants it (else undefined → normal kite takes over).
      // LAST-DITCH: if crowded but BOTH the blast + the heavy are on cooldown, the DISENGAGE kick is the fallback
      // — so a crowded marine with everything down still creates space, never just gets hit.
      const disengageReady = disengage !== undefined && ctx.abilities.ready(e, disengage);
      let closeMove: ContentId | undefined;
      if (melee > 0 && d <= melee) closeMove = rollsBlast && blastReady ? blast : heavyReady ? loadout.heavy : blastReady ? blast : disengageReady ? disengage : undefined;
      else if (blastReady && rollsBlast && d <= blastBand) closeMove = blast;
      if (closeMove !== undefined) {
        if (cb) cb.aiming = false; // dropping the aim to bash/blast
        t.angle = face;
        ctx.abilities.activate(e, closeMove);
        bb.closeRoll = undefined; // the answer fired — this engagement's gamble is SPENT (the next one re-rolls)
        bb.kitePhase = 'reposition';
        bb.kiteBeatT = 0; // pick a new spot next tick
      } else if (phase === 'reposition') {
        if (cb) cb.aiming = false; // gun DOWN while relocating (the cone blooms — it's not aiming on the run)
        // MOVE to the committed destination (pathfound). Arrive (close enough) or time out → AIM (arm the settle).
        const dest = bb.kiteDestX !== undefined ? [bb.kiteDestX, bb.kiteDestY ?? t.y] : null;
        const arrived = dest ? dist(t.x, t.y, dest[0], dest[1]) < TILE * 0.6 : true;
        if (arrived || (bb.kiteBeatT ?? 0) <= 0 || (bb.stuckT ?? 0) > KITE_STUCK_GIVEUP) {
          bb.kitePhase = 'aim';
          bb.kiteBeatT = p.kiteAimTime; // arm the settle window ON ENTRY — it counts DOWN, then fires (never re-armed)
        } else {
          const [dx, dy] = routeTo(e, ctx, dt, dest![0], dest![1]); // ! : arrived is true when dest is null, so this branch proves it
          const [nx, ny] = norm(dx, dy);
          const sp = attackMoveSpeed(e, m.speed); // no sprint — a calmer, tactical relocate
          m.vx = nx * sp;
          m.vy = ny * sp;
        }
      } else {
        // AIM → FIRE → PAUSE (planted): stand still, RAISE the aim (cb.aiming = true → the braced stance + the
        // spread cone SETTLES over a beat), hold it for kiteAimTime so the shot is TIGHT, THEN fire. No more
        // snap hip-shots. After firing, a PAUSE breath, then reposition.
        m.vx = 0;
        m.vy = 0;
        // STEADY aim while planted: track the (lead-adjusted) target WITHOUT the idle facing sway — a marksman
        // lining up holds still, not wobbling. Ease toward it so it's smooth, not a snap.
        t.angle += angleDiff(Math.atan2(py - t.y, px - t.x), t.angle) * smoothFactor(10, dt);
        const pref = p.preferredRange ?? 200;
        const inRange = d <= reach && facesTarget(e, ft.x, ft.y, p);
        if (cb) cb.aiming = inRange; // hold the braced aim while lining up (the cone tightens as it settles)
        // WHY it would move (the hysteresis + no-dogged-chase decision):
        //  - TOO CLOSE (< pref): back off to make space → reposition (resets the chase counter).
        //  - INSIDE [pref, pref+width]: STAND AND SHOOT — the comfort band; reset the chase counter.
        //  - TOO FAR but the shot still reaches: take up to kiteMaxChase committed advance steps, THEN STOP
        //    chasing and just shoot from range (a marksman holds a line, doesn't dog you per-pixel).
        //  - OUT OF SHOT RANGE entirely: advance a couple steps to try to re-acquire, else it stays put shooting-less.
        const tooClose = d < pref;
        const inBand = !tooClose && d <= pref + p.kiteComfortWidth;
        // CHASE BUDGET (sticky, so no per-pixel creep): reset ONLY when the target crowds back inside `pref` (it
        // stopped fleeing / came to you). Being merely in shot range does NOT reset it — else advancing into
        // range would refill the budget and it'd creep forever. Once the 2 steps are spent, it HOLDS and shoots
        // (or, if out of shot range, just holds) until you close the distance yourself.
        if (tooClose) bb.kiteChaseSteps = 0;
        const chasedOut = (bb.kiteChaseSteps ?? 0) >= p.kiteMaxChase;
        // reposition when: crowded (back off), OR out of SHOT range and still has chase budget (a committed advance).
        // If it can already shoot (in reach) or has spent its chase budget → HOLD and fire from here, never creep.
        const wantReposition = tooClose || (d > reach && !chasedOut);
        if (phase === 'aim') {
          if ((bb.kiteBeatT ?? 0) <= 0) {
            if (inRange && ctx.abilities.ready(e, loadout.primary)) {
              ctx.abilities.activate(e, loadout.primary); // the SETTLED aimed shot
              bb.kitePhase = 'pause';
              bb.kiteBeatT = p.kitePause; // a deliberate breath after firing
            } else if (wantReposition) {
              if (!tooClose) bb.kiteChaseSteps = (bb.kiteChaseSteps ?? 0) + 1; // count the advance toward the cap
              planKiteReposition(e, ctx, ft.x, ft.y, d, pref);
              tryKiteRoll(e, ctx); // maybe DASH to the spot instead of walking (evasive relocate)
              bb.kitePhase = 'reposition';
              bb.kiteBeatT = KITE_REPOSITION_MAX;
            } else {
              bb.kiteBeatT = p.kiteAimTime; // HOLD + keep lining up (in band, or chased-out → shoot from range)
            }
          }
        } else if ((bb.kiteBeatT ?? 0) <= 0) {
          // PAUSE elapsed. Reposition if the spacing wants it (back off / a capped advance), OR — while comfortably
          // in-band — an occasional juke to stay lively. Otherwise re-AIM in place (hold ground, keep shooting;
          // never creep after a target that's in the band or that we've already chased our budget for).
          if (wantReposition || (inBand && ctx.rng.chance(p.kiteJukeChance))) {
            if (wantReposition && !tooClose) bb.kiteChaseSteps = (bb.kiteChaseSteps ?? 0) + 1;
            planKiteReposition(e, ctx, ft.x, ft.y, d, pref);
            tryKiteRoll(e, ctx); // maybe DASH to the spot instead of walking (evasive relocate)
            bb.kitePhase = 'reposition';
            bb.kiteBeatT = KITE_REPOSITION_MAX;
          } else {
            bb.kitePhase = 'aim'; // hold ground, line up the next shot in place
            bb.kiteBeatT = p.kiteAimTime;
          }
        }
      }
      return; // the beat loop OWNS a kiter's movement + firing — skip the continuous chase steering below
    }

    // routing (squad morale broke, or a low-HP coward): flee — but a CORNERED animal turns and fights
    const cornered = fleeing && !!foe && d <= strike;
    if (fleeing) stance = cornered ? { move: 'hold', attack: true } : { move: 'away', attack: false };

    // squad attack token: solo enemies attack freely; squad members must hold a token, else they circle.
    const hasToken = cornered || (e.squad ? bb.attackOk === true : true); // a cornered router swings regardless of token
    const engaging = !!foe && stance.move !== 'away' && stance.move !== 'home';

    // sprint-charge: a sprinter periodically COMMITS a burst to close a kiting target (otherwise it walks the
    // final stretch at the target's pace and can never catch a back-pedalling player). Cooldown-gated so it
    // reads as a rhythmic lunge. While charging it aims straight + sprints (weave/lane drop below).
    // FACING GATE: a heavy body can only COMMIT a charge/strike when the target is in its front arc (ai/steering);
    // a light fighter can commit at any angle (instant pivot).
    const facingTarget = facesTarget(e, rx, ry, p);

    // RANGED AIM: a gunner raises the braced firing stance while it has a live foe it's facing and within
    // shot range (the same `combatant.aiming` the player's RMB-hold sets — presentation reads it for the
    // shouldered pose). It lowers to the low port carry otherwise (no foe / turned away / out of range).
    if (e.combatant && isRanged(e)) e.combatant.aiming = !!foe && facingTarget && d <= range;

    bb.chargeCd = Math.max(0, ((bb.chargeCd) ?? 0) - dt);
    let charging = ((bb.chargeT) ?? 0) > 0;
    if (!charging && engaging && facingTarget && bb.canSprint === true && d > reach && d < p.chargeMax && (bb.chargeCd) <= 0 && (e.combatant?.stam ?? 0) > p.chargeStam) {
      bb.chargeT = p.chargeDur;
      bb.chargeCd = p.chargeCd;
      charging = true;
    }
    if (charging) bb.chargeT = Math.max(0, (bb.chargeT ?? 0) - dt);

    // gap-closer dash (tier-gated): when granted + ready, lunge across mid-range to close on the target. A HEAVY
    // body (bull) does NOT dash — it lumbers; a dash would SNAP its facing to the target (bypassing the turn cap),
    // instantly facing you after an attack (the flanking-counter bug). Its gap-closer is the sprint-charge instead.
    if (!isHeavy(p) && loadout.dash && stance.move === 'approach' && d > reach && d < reach + p.dashMax && ctx.abilities.ready(e, loadout.dash)) {
      t.angle = Math.atan2(ry - t.y, rx - t.x); // aim the lunge at the real target, not the lagged guess
      m.vx = 0;
      m.vy = 0;
      ctx.abilities.activate(e, loadout.dash);
      return;
    }
    if (engaging && dist(t.x, t.y, px, py) <= strike) {
      m.vx = 0;
      m.vy = 0;
      bb.path = null;
      if (hasToken) {
        // HOLD AT BLADE DISTANCE: if crowded well inside strike range (momentum/body-push shoved us point-blank),
        // lean back OUT toward blade distance — but keep swinging. Attacking-while-leaning means a target that
        // walks into us just eats a point-blank hit; we never backpedal forever (answers "will he retreat if I
        // keep pushing?" — no, he commits). The gap to 1.0 is the no-jitter band. A short-blade fist (reach≈r)
        // never triggers it; a long blade drifts to its tip.
        const backoff = p.holdBackoffFrac ?? 0.72;
        if (d < strike * backoff && d > 0.01) {
          const [ax, ay] = norm(t.x - rx, t.y - ry); // away from the target
          const driftSpeed = attackMoveSpeed(e, m.speed * 0.6); // gentle drift (spacing, not a retreat) — but a rooted mid-swing unit can't drift
          m.vx = ax * driftSpeed;
          m.vy = ay * driftSpeed;
        }
        // ROCKET REPOSITION (a committed mini-intent — see planRegroupSpecial): a PINNED regrouper can plan to
        // LEAP THROUGH the target with its heavy (Rocket aims at the target; the long jump overshoots → he lands
        // BEHIND them, slam hit on the way). It COMMITS the plan once, then CONSERVES (stops jabbing) until the
        // heavy is affordable, then fires — so his own jabs can't starve the stamina the Rocket needs. Only a
        // regrouping unit plans; otherwise it's the normal attack choice.
        const act = bb.regrouping === true ? planRegroupSpecial(e, ctx) : 'jab';
        if (act === 'fire' && facingTarget && bb.plannedSpecial) {
          ctx.abilities.activate(e, bb.plannedSpecial); // whoosh — leap through the target
          bb.plannedSpecial = undefined; // plan spent
        } else if (act === 'conserve') {
          // saving stamina for the planned Rocket — do NOT jab (a jab spends what we're banking). Hold at range
          // and let regen tick toward affordability; the next beats keep returning 'conserve' until it's ready.
          m.vx = 0;
          m.vy = 0;
        } else if (facingTarget) {
          // SAME instant punch the player throws; the reaction-lagged aim can still whiff a moving target.
          // A heavy body only strikes when the target is in its FACING cone (it must turn to bring you into arc).
          // pickAttack weaves in the loadout's specials for specialChance profiles; while regrouping it forces the
          // cheap primary (conserve). d = center-to-center.
          ctx.abilities.activate(e, pickAttack(e, ctx, d));
        }
      } else {
        // no token — orbit the target at the edge of range, waiting our turn (the "circle of death")
        const side = e.id % 2 === 0 ? 1 : -1;
        const toT = Math.atan2(ry - t.y, rx - t.x);
        const tang = toT + (side * Math.PI) / 2;
        const radial = Math.max(-1, Math.min(1, (d - reach * 0.95) / 40));
        const [snx, sny] = separation(e, ctx);
        const [ox, oy] = norm(
          Math.cos(tang) + Math.cos(toT) * radial * 0.7 + snx * 0.4,
          Math.sin(tang) + Math.sin(toT) * radial * 0.7 + sny * 0.4,
        );
        m.vx = ox * m.speed * 0.85;
        m.vy = oy * m.speed * 0.85;
      }
      return;
    }
    if (stance.move === 'hold') {
      m.vx = 0;
      m.vy = 0;
      return;
    }

    // choose a steer point; `away` moves steer directly (no pathfinding)
    let aimX = rx;
    let aimY = ry;
    let away = false;
    if (stance.move === 'away') {
      aimX = 2 * t.x - rx;
      aimY = 2 * t.y - ry;
      away = true;
    } else if (stance.move === 'home') {
      aimX = bb.home.x;
      aimY = bb.home.y;
    } else if (!charging && p.approach === 'flank' && d > reach) {
      // arc in from the side: a perpendicular offset that shrinks as we close
      const ang = Math.atan2(ry - t.y, rx - t.x);
      const side = e.id % 2 === 0 ? 1 : -1;
      const perp = ang + (side * Math.PI) / 2;
      const w = Math.min(1, d / 300);
      aimX = rx + Math.cos(perp) * 60 * w;
      aimY = ry + Math.sin(perp) * 60 * w;
    }

    // squad lane: each member approaches in its own lateral lane so the group fans in, not single-file
    if (!charging && e.squad && stance.move === 'approach' && bb.lane != null) {
      const ang = Math.atan2(ry - t.y, rx - t.x);
      const off = (bb.lane) * p.laneSpread * Math.max(0, Math.min(1, (d - reach) / 150));
      aimX += Math.cos(ang + Math.PI / 2) * off;
      aimY += Math.sin(ang + Math.PI / 2) * off;
    }

    // route to the aim point: `away` steers straight outward (no pathfinding); otherwise pathfind around walls
    let dx: number;
    let dy: number;
    if (away) {
      bb.path = null;
      dx = aimX - t.x;
      dy = aimY - t.y;
    } else {
      [dx, dy] = routeTo(e, ctx, dt, aimX, aimY);
    }

    const [nx, ny] = norm(dx, dy);
    // serpentine approach: a lateral sine wobble (eased off as we close) so they weave in, not beeline straight
    let wnx = nx;
    let wny = ny;
    if (!charging && !bb.path && stance.move === 'approach') {
      const wob = Math.sin(bb.weaveT) * p.weaveAmp * Math.max(0, Math.min(1, (d - reach) / 120));
      wnx += -ny * wob;
      wny += nx * wob;
    }
    const [sx, sy] = separation(e, ctx);
    const want = norm(wnx + sx * 0.5, wny + sy * 0.5); // desired move direction (`fx` is reserved for FX)
    // RETREAT ROLL (the signature disengage): a regrouping unit with the flag BURSTS with its roll instead of
    // walking. STRATEGIC direction (not just backward): mostly a SIDEWAYS juke — a lateral roll around the
    // target that resets spacing + finds a new angle WITHOUT opening distance, so it reads as circling, not
    // fleeing — and sometimes straight back. The roll's impulse follows current velocity (AbilitySystem.impulse),
    // so we seed velocity along the chosen direction FIRST, then fire. Cooldown-gated (a rhythmic hop, not a
    // blur); he keeps FACING the target (this is movement, not facing) — a dodge with the guard up.
    if (p.retreatRoll === true && bb.regrouping === true && loadout.dash && ctx.abilities.ready(e, loadout.dash) && m.dodgeT <= 0) {
      const toTarget = Math.atan2(ry - t.y, rx - t.x); // toward the player
      const sideways = ctx.rng.next() < (p.rollSidewaysChance ?? 0.7); // mostly juke laterally, sometimes bail straight back
      const dir = sideways
        ? toTarget + (e.id % 2 === 0 ? 1 : -1) * (Math.PI / 2) // ±90° = a lateral roll AROUND the target (per-unit side, stable)
        : toTarget + Math.PI; // straight away — the classic disengage
      m.vx = Math.cos(dir) * m.speed; // seed the roll direction so the velocity-following impulse tumbles that way
      m.vy = Math.sin(dir) * m.speed;
      ctx.abilities.activate(e, loadout.dash);
      return;
    }
    // HEAVY BODY: move ALONG facing (can't slide sideways/backward toward a rear target), crawling→stopping while
    // mis-aimed so it wheels in place first. Light body: move straight at the want dir. All in ai/steering.
    const steer = heavyHeading(e, want[0], want[1], p);
    const mx = steer.mx, my = steer.my;
    const headingAlign = steer.speedScale;
    // sprint (tier-gated): burn stamina to close a big gap (or flee fast), then recover by walking. NOT while
    // regrouping — a tactical retreat exists to REGEN stamina, so it walks back; sprinting would drain the
    // very bar it's trying to refill (the whole point of the regroup).
    let moveSpeed = m.speed;
    if (bb.canSprint === true && bb.regrouping !== true && (charging || d > reach * 2.2 || away)) {
      moveSpeed = trySprint(e, moveSpeed, dt); // gate+drain+boost — the SAME rule the player's input uses
    }
    moveSpeed = attackMoveSpeed(e, moveSpeed); // rooted/slowed mid-swing — the SAME rule the player's input uses
    moveSpeed *= headingAlign; // heavy body: crawl→stop while mis-aimed (turning in place), full speed once facing
    m.vx = mx * moveSpeed;
    m.vy = my * moveSpeed;
  },
};

/** Prey flight: bolt directly away from the last attacker (bb.quarryId) until the scare wears off, then graze
 *  again. No pathfinding — a panicked animal just runs; collision slides it along any wall it hits. */
const flee: FsmState = {
  update(e, ctx, dt) {
    const t = e.transform!;
    const m = e.mover!;
    const bb = e.ai!.bb;
    const p = profileOf(e);
    bb.alertT = Math.max(0, ((bb.alertT) ?? 0) - dt);
    if ((bb.alertT) <= 0) {
      bb.quarryId = undefined;
      return 'wander'; // calmed down → back to grazing
    }
    const threat = bb.quarryId !== undefined ? ctx.world.byId(bb.quarryId) : undefined;
    const alive = threat?.transform && !threat.health?.dead;
    const tx = alive ? threat!.transform!.x : (bb.lastSeenX);
    const ty = alive ? threat!.transform!.y : (bb.lastSeenY);
    const [ax, ay] = norm(t.x - tx, t.y - ty); // direction AWAY from the threat
    if (ax === 0 && ay === 0) {
      m.vx = 0;
      m.vy = 0;
      return;
    }
    const want = Math.atan2(ay, ax);
    // a startled critter WHEELS around (turn-capped) before bolting, then dashes along its facing at full speed
    let hx: number;
    let hy: number;
    if (p.turnSpeed != null) {
      [hx, hy] = faceAndHeading(e, want, p.turnSpeed, dt);
    } else {
      t.angle = want;
      hx = ax;
      hy = ay;
    }
    m.vx = hx * m.speed; // panic dash (faster than the graze stroll)
    m.vy = hy * m.speed;
  },
};

/** Generic combatant AI driven by the entity's AI profile (rusher / flanker / kiter / guard / coward / critter). */
export const actorBrain = new FsmBrain({ wander, alert, chase, flee }, 'wander');
