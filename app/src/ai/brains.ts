import { Abilities, abilityRange } from '../combat/Ability';
import { TILE } from '../config/constants';
import { trySprint } from '../combat/stamina';
import { angleDiff, dist, norm, smoothFactor } from '../core/math';
import { combatStance, type AIProfileDef } from '../defs/aiProfiles';
import { Bodies } from '../defs/bodies';
import { factions } from '../defs/factions';
import { ShipHulls } from '../defs/ships';
import type { Entity } from '../ecs/components';
import type { AIContext } from './Brain';
import { FsmBrain, type FsmState } from './FsmBrain';
import { perceives } from './perception';

// All AI tuning now lives per-unit in the AIProfileDef (data), read via `p` below — no global behaviour knobs.
const profileOf = (e: Entity): AIProfileDef => e.ai!.bb.profile;

/** Daylight (px) beyond touching within which the separation push applies — ONE const shared by the
 *  prefilter and the per-pair test, so the two can never drift apart. */
const SEPARATION_GAP = 6;
/** Widest transform.r any ally can have — bodies AND ship hulls (allied ships are transform+faction
 *  entities too, and the old full scan pushed away from them; the prefilter must not silently stop).
 *  Bounds the separation() prefilter radius from DATA, not a magic number. */
const MAX_NEIGHBOR_R = Math.max(...Object.values(Bodies).map((b) => b.r), ...ShipHulls.all().map((s) => s.r));

/** Turn `t.angle` toward `want` at up to `rate` rad/s (a heavy body can't snap its heading), then return the
 *  resulting FACING unit vector. Moving along this — instead of straight at the goal — makes a low-turn-rate
 *  critter lumber/arc into place, like moomoo's cows/pigs (which move along `dir`, not toward the target). */
function faceAndHeading(e: Entity, want: number, rate: number, dt: number): [number, number] {
  const t = e.transform!;
  const max = rate * dt;
  t.angle += Math.max(-max, Math.min(max, angleDiff(want, t.angle)));
  return [Math.cos(t.angle), Math.sin(t.angle)];
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
  const foe = ctx.query.nearestHostile(t.x, t.y, p.sight, e.faction!.id);
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

const wander: FsmState = {
  update(e, ctx, dt) {
    const t = e.transform!;
    const m = e.mover!;
    const bb = e.ai!.bb;
    const p = profileOf(e);

    const foe = spot(e, ctx);
    if (foe) {
      bb.lastSeenX = foe.transform!.x;
      bb.lastSeenY = foe.transform!.y;
      bb.lostT = 0;
      bb.perceivedX = foe.transform!.x; // seed perceived position = actual on first sighting
      bb.perceivedY = foe.transform!.y;
      return 'chase';
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
    if (rd > 4) {
      const want = Math.atan2(rdy, rdx);
      if (p.turnSpeed != null) {
        // heavy-body lumber: turn at a capped rate, then amble along the FACING so it arcs into place
        const [hx, hy] = faceAndHeading(e, want, p.turnSpeed, dt);
        m.vx = hx * p.wanderSpeed;
        m.vy = hy * p.wanderSpeed;
      } else {
        // face the way it walks — don't moonwalk; also points the vision cone where it's headed
        t.angle += angleDiff(want, t.angle) * smoothFactor(p.wanderTurn, dt);
        m.vx = (rdx / rd) * p.wanderSpeed;
        m.vy = (rdy / rd) * p.wanderSpeed;
      }
    } else {
      m.vx = 0;
      m.vy = 0;
    }
  },
};

const chase: FsmState = {
  update(e, ctx, dt) {
    const t = e.transform!;
    const m = e.mover!;
    const bb = e.ai!.bb;
    const p = profileOf(e);
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

    // out of sight: pursue the quarry's ACTUAL position. The pathfinder routes via where they vanished (the
    // block's corner) and on to them, so it reads as "went after you" AND actually rounds the block — rather
    // than looping at a last-seen point it can't stand on next to a wall. Last-seen is only the fallback for
    // a quarry that's gone. The give-up timer still bounds how long it can pursue blind.
    let rx: number;
    let ry: number;
    const quarry = bb.quarryId !== undefined ? ctx.world.byId(bb.quarryId) : undefined;
    if (foe) {
      rx = foe.transform!.x;
      ry = foe.transform!.y;
    } else if (quarry?.transform && !quarry.health?.dead) {
      rx = quarry.transform.x;
      ry = quarry.transform.y;
    } else {
      rx = bb.lastSeenX;
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
    const px = bb.perceivedX;
    const py = bb.perceivedY;
    // weave/sway phase (each unit offset by id so a group doesn't sync); also drives the serpentine approach below
    bb.weaveT = ((bb.weaveT) ?? e.id % 7) + dt * p.weaveFreq;
    t.angle = Math.atan2(py - t.y, px - t.x) + Math.sin(bb.weaveT) * p.faceSway; // lagged aim + a living sway

    const d = dist(t.x, t.y, rx, ry);
    const ability = Abilities.get(loadout.primary);
    const range = abilityRange(ability, e.attributes?.get('reach') ?? 0);
    const reach = (range || 16) + (foe?.transform?.r ?? 11);
    const strike = reach * p.strikeFrac; // where it actually stops to attack — inside the edge so blows land
    const hpRatio = e.health ? e.health.hp / e.health.maxHp : 1;
    const broken = e.squad ? bb.broken === true : false;
    let stance = combatStance(p, d, strike, hpRatio, dist(rx, ry, bb.home.x, bb.home.y));
    // routing (squad morale broke, or a low-HP coward): flee — but a CORNERED animal turns and fights
    const fleeing = broken || (p.fleeBelowHp != null && hpRatio <= p.fleeBelowHp);
    const cornered = fleeing && !!foe && d <= strike;
    if (fleeing) stance = cornered ? { move: 'hold', attack: true } : { move: 'away', attack: false };

    // squad attack token: solo enemies attack freely; squad members must hold a token, else they circle.
    const hasToken = cornered || (e.squad ? bb.attackOk === true : true); // a cornered router swings regardless of token
    const engaging = !!foe && stance.move !== 'away' && stance.move !== 'home';

    // sprint-charge: a sprinter periodically COMMITS a burst to close a kiting target (otherwise it walks the
    // final stretch at the target's pace and can never catch a back-pedalling player). Cooldown-gated so it
    // reads as a rhythmic lunge. While charging it aims straight + sprints (weave/lane drop below).
    bb.chargeCd = Math.max(0, ((bb.chargeCd) ?? 0) - dt);
    let charging = ((bb.chargeT) ?? 0) > 0;
    if (!charging && engaging && bb.canSprint === true && d > reach && d < p.chargeMax && (bb.chargeCd) <= 0 && (e.combatant?.stam ?? 0) > p.chargeStam) {
      bb.chargeT = p.chargeDur;
      bb.chargeCd = p.chargeCd;
      charging = true;
    }
    if (charging) bb.chargeT = Math.max(0, (bb.chargeT ?? 0) - dt);

    // gap-closer dash (tier-gated): when granted + ready, lunge across mid-range to close on the target
    if (loadout.dash && stance.move === 'approach' && d > reach && d < reach + p.dashMax && ctx.abilities.ready(e, loadout.dash)) {
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
        // SAME instant punch the player throws; the reaction-lagged aim can still whiff a moving target
        ctx.abilities.activate(e, loadout.primary);
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
    const [mx, my] = norm(wnx + sx * 0.5, wny + sy * 0.5); // final move direction (`fx` is reserved for FX)
    // sprint (tier-gated): burn stamina to close a big gap (or flee fast), then recover by walking
    let moveSpeed = m.speed;
    if (bb.canSprint === true && (charging || d > reach * 2.2 || away)) {
      moveSpeed = trySprint(e, moveSpeed, dt); // gate+drain+boost — the SAME rule the player's input uses
    }
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
export const actorBrain = new FsmBrain({ wander, chase, flee }, 'wander');
