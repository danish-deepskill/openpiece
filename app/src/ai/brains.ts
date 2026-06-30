import { Abilities, abilityRange } from '../combat/Ability';
import { TILE } from '../config/constants';
import { dist, norm, rand } from '../core/math';
import { combatStance, type AIProfileDef } from '../defs/aiProfiles';
import { factions } from '../defs/factions';
import type { Entity } from '../ecs/components';
import type { Waypoint } from '../world/Pathfinder';
import type { AIContext } from './Brain';
import { FsmBrain, type FsmState } from './FsmBrain';

const profileOf = (e: Entity): AIProfileDef => e.ai!.bb.profile as AIProfileDef;

/** Boids-style separation from same-faction allies, so they don't stack on a target. */
function separation(e: Entity, ctx: AIContext): [number, number] {
  const t = e.transform!;
  const mine = e.faction!.id;
  let sx = 0;
  let sy = 0;
  for (const o of ctx.world.with('transform', 'faction')) {
    if (o === e || !factions.isAlly(mine, o.faction!.id)) continue;
    const ot = o.transform!;
    const d = dist(t.x, t.y, ot.x, ot.y);
    if (d > 0 && d < t.r + ot.r + 6) {
      sx += (t.x - ot.x) / d;
      sy += (t.y - ot.y) / d;
    }
  }
  return [sx, sy];
}

/** Can this entity actually perceive the target? Within sight radius AND with line-of-sight (walls hide). */
function spot(e: Entity, ctx: AIContext): Entity | undefined {
  const t = e.transform!;
  const p = profileOf(e);
  const foe = ctx.query.nearestHostile(t.x, t.y, p.sight, e.faction!.id);
  if (foe && ctx.pathfinder.lineOfSight(t.x, t.y, foe.transform!.x, foe.transform!.y, e.mover!.mode)) return foe;
  return undefined;
}

/** Can this entity see a specific target right now (within sight + line-of-sight)? */
function canSee(e: Entity, target: Entity, ctx: AIContext): boolean {
  const tr = target.transform;
  if (!tr) return false;
  const t = e.transform!;
  if (dist(t.x, t.y, tr.x, tr.y) > profileOf(e).sight) return false;
  return ctx.pathfinder.lineOfSight(t.x, t.y, tr.x, tr.y, e.mover!.mode);
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
      bb.px = foe.transform!.x; // seed perceived position = actual on first sighting
      bb.py = foe.transform!.y;
      return 'chase';
    }

    bb.wanderT -= dt;
    if (bb.wanderT <= 0) {
      bb.wanderT = rand(1.5, 3);
      if (Math.random() < 0.5) {
        const a = Math.random() * Math.PI * 2;
        bb.wdx = Math.cos(a) * 30;
        bb.wdy = Math.sin(a) * 30;
      } else {
        bb.wdx = 0;
        bb.wdy = 0;
      }
    }
    const tether = p.approach === 'guard' ? 70 : 120; // guards hug their post
    if (dist(t.x, t.y, bb.home.x, bb.home.y) > tether) {
      const [hx, hy] = norm(bb.home.x - t.x, bb.home.y - t.y);
      bb.wdx = hx * 30;
      bb.wdy = hy * 30;
    }
    m.vx = bb.wdx;
    m.vy = bb.wdy;
  },
};

const chase: FsmState = {
  update(e, ctx, dt) {
    const t = e.transform!;
    const m = e.mover!;
    const bb = e.ai!.bb;
    const p = profileOf(e);

    // squad focus-fire: engage the squad's chosen target if I can see it, else whatever I can see myself
    const focus = bb.focus as Entity | undefined;
    const foe = focus && !focus.health?.dead && canSee(e, focus, ctx) ? focus : spot(e, ctx);
    if (foe) {
      bb.lastSeenX = foe.transform!.x;
      bb.lastSeenY = foe.transform!.y;
      bb.lostT = 0;
    } else {
      bb.lostT = ((bb.lostT as number) ?? 0) + dt;
    }

    // disengage: lost sight too long, or strayed past the leash with no target in view
    const strayed = dist(t.x, t.y, bb.home.x, bb.home.y) > p.leash;
    if (!foe && ((bb.lostT as number) > p.loseSightSec || strayed)) {
      bb.path = null;
      bb.px = undefined; // forget perceived aim; re-seed fresh on next sighting
      return 'wander';
    }

    const rx = foe ? foe.transform!.x : (bb.lastSeenX as number);
    const ry = foe ? foe.transform!.y : (bb.lastSeenY as number);

    // Perceived (reaction-lagged) target position: the enemy aims & commits to where it THINKS you are.
    // A still target is tracked exactly and gets hit; a moving one is punched where it *was* → natural misses.
    const react = p.reaction ?? 0.18;
    if (bb.px === undefined) {
      bb.px = rx;
      bb.py = ry;
    }
    const lag = Math.min(1, dt / react);
    bb.px = (bb.px as number) + (rx - (bb.px as number)) * lag;
    bb.py = (bb.py as number) + (ry - (bb.py as number)) * lag;
    const px = bb.px as number;
    const py = bb.py as number;
    t.angle = Math.atan2(py - t.y, px - t.x); // face the lagged position, not the real one

    const d = dist(t.x, t.y, rx, ry);
    const ability = Abilities.get(e.loadout!.primary);
    const range = abilityRange(ability, e.attributes?.get('reach') ?? 0);
    const reach = (range || 16) + (foe?.transform?.r ?? 11);
    const hpRatio = e.health ? e.health.hp / e.health.maxhp : 1;
    const broken = e.squad ? bb.broken === true : false;
    let stance = combatStance(p, d, reach, hpRatio, dist(rx, ry, bb.home.x, bb.home.y));
    if (broken || (p.fleeBelowHp != null && hpRatio <= p.fleeBelowHp)) stance = { move: 'away', attack: false };

    // squad attack token: solo enemies attack freely; squad members must hold a token, else they circle.
    const hasToken = e.squad ? bb.attackOk === true : true;
    const engaging = !!foe && stance.move !== 'away' && stance.move !== 'home';
    if (engaging && dist(t.x, t.y, px, py) <= reach) {
      m.vx = 0;
      m.vy = 0;
      bb.path = null;
      if (hasToken) {
        // SAME instant punch the player throws; the reaction-lagged aim can still whiff a moving target
        ctx.abilities.activate(e, e.loadout!.primary);
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
    } else if (p.approach === 'flank' && d > reach) {
      // arc in from the side: a perpendicular offset that shrinks as we close
      const ang = Math.atan2(ry - t.y, rx - t.x);
      const side = e.id % 2 === 0 ? 1 : -1;
      const perp = ang + (side * Math.PI) / 2;
      const w = Math.min(1, d / 300);
      aimX = rx + Math.cos(perp) * 60 * w;
      aimY = ry + Math.sin(perp) * 60 * w;
    }

    let dx: number;
    let dy: number;
    if (away || ctx.pathfinder.lineOfSight(t.x, t.y, aimX, aimY, m.mode)) {
      bb.path = null;
      dx = aimX - t.x;
      dy = aimY - t.y;
    } else {
      // A* around walls toward the aim point
      let path = bb.path as Waypoint[] | null;
      const rep = ((bb.repathT as number) ?? 0) - dt;
      if (!path || rep <= 0) {
        path = ctx.pathfinder.findPath(t.x, t.y, aimX, aimY, m.mode);
        bb.path = path;
        bb.pathIdx = 0;
        bb.repathT = 0.5;
      } else {
        bb.repathT = rep;
      }
      let wx = aimX;
      let wy = aimY;
      if (path && path.length) {
        let idx = (bb.pathIdx as number) ?? 0;
        while (idx < path.length && dist(t.x, t.y, path[idx].x, path[idx].y) < TILE * 0.5) idx++;
        bb.pathIdx = idx;
        if (idx < path.length) {
          wx = path[idx].x;
          wy = path[idx].y;
        }
      }
      dx = wx - t.x;
      dy = wy - t.y;
    }

    const [nx, ny] = norm(dx, dy);
    const [sx, sy] = separation(e, ctx);
    const [fx, fy] = norm(nx + sx * 0.5, ny + sy * 0.5);
    m.vx = fx * m.speed;
    m.vy = fy * m.speed;
  },
};

/** Generic combatant AI driven by the entity's AI profile (rusher / flanker / kiter / guard / coward). */
export const enemyBrain = new FsmBrain({ wander, chase }, 'wander');
