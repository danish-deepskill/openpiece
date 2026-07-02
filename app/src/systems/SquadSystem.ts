import { dist } from '../core/math';
import type { Entity } from '../ecs/components';
import type { World } from '../ecs/World';
import type { SpatialQuery } from '../world/SpatialQuery';

const ATTACKERS_PER_SQUAD = 2; // how many of a squad may strike at once
const MAX_ATTACKERS_PER_TARGET = 3; // hard cap so multiple squads can't dogpile one victim
const MORALE_BREAK = 0.4; // flee once the squad drops below this fraction of its peak strength

/**
 * Group coordination on top of per-unit AI: each squad picks ONE focus target (focus-fire), grants a
 * limited number of attack tokens to its closest members (the rest circle), and breaks morale when thinned.
 * Solo enemies (no `squad`) are unaffected — they attack freely. Writes flags the brain reads:
 *   bb.focus (Entity), bb.attackOk (bool), bb.broken (bool), bb.lane (-1..1 approach lane).
 */
export class SquadSystem {
  private readonly peak = new Map<number, number>();

  constructor(
    private readonly world: World,
    private readonly query: SpatialQuery,
  ) {}

  update(): void {
    const squads = new Map<number, Entity[]>();
    for (const e of this.world.with('squad', 'transform', 'faction', 'ai')) {
      if (e.health?.dead) continue;
      const id = e.squad!.id;
      let arr = squads.get(id);
      if (!arr) {
        arr = [];
        squads.set(id, arr);
      }
      arr.push(e);
    }

    const committed = new Map<Entity, number>(); // attackers already assigned to each target (cross-squad cap)

    for (const [id, members] of squads) {
      const count = members.length;
      const peak = Math.max(this.peak.get(id) ?? 0, count);
      this.peak.set(id, peak);
      const broken = count / peak < MORALE_BREAK;

      // movement lanes: spread members across the approach (stable by id) so they fan in, not single-file
      const byId = [...members].sort((a, b) => a.id - b.id);
      byId.forEach((mb, i) => {
        mb.ai!.bb.lane = byId.length > 1 ? (i / (byId.length - 1)) * 2 - 1 : 0;
      });

      // focus-fire: the hostile nearest the squad's centre of mass
      let cx = 0;
      let cy = 0;
      for (const mb of members) {
        cx += mb.transform!.x;
        cy += mb.transform!.y;
      }
      const focus = this.query.nearestHostile(cx / count, cy / count, 9999, members[0].faction!.id);

      if (!focus) {
        for (const mb of members) {
          mb.ai!.bb.focus = undefined;
          mb.ai!.bb.attackOk = true; // nothing to coordinate around — attack freely
          mb.ai!.bb.broken = broken;
        }
        continue;
      }

      // grant attack tokens to the members closest to the focus, within both budgets
      const order = [...members].sort(
        (a, b) =>
          dist(a.transform!.x, a.transform!.y, focus.transform!.x, focus.transform!.y) -
          dist(b.transform!.x, b.transform!.y, focus.transform!.x, focus.transform!.y),
      );
      const cap = Math.min(ATTACKERS_PER_SQUAD, MAX_ATTACKERS_PER_TARGET - (committed.get(focus) ?? 0));
      let granted = 0;
      for (const mb of order) {
        const bb = mb.ai!.bb;
        bb.focus = focus;
        bb.broken = broken;
        bb.attackOk = !broken && granted < cap;
        if (bb.attackOk) granted++;
      }
      committed.set(focus, (committed.get(focus) ?? 0) + granted);
    }
  }
}
