import { TILE } from '../config/constants';
import { Structures } from '../defs/structures';
import type { World } from '../ecs/World';
import { SpatialQuery } from '../world/SpatialQuery';

/** Px past 'just touching' at which a door opens — an APPROACH radius, not a contact test. Big enough that a
 *  body pinned against the wall BESIDE the doorway still opens it (the corner assist can then funnel them in —
 *  a closed door failed the assist's probe, so you could be stuck one step from a door that would have opened);
 *  small enough that walking PAST a building doesn't flap its doors. Feel knob. */
const APPROACH_PAD = 14;

/**
 * Openable doors — SIM ONLY (the closed-door panel is drawn by draw/DoorRenderer). A door is a STRUCTURE
 * entity (defs/structures.ts `door` flag); this system flips the INSTANCE's `structure.open` whenever a
 * live foot actor TOUCHES it, and collision/pathfinding read that state through the grid's StructureIndex —
 * no tile flips, no parallel arrays (the old system rewrote the terrain grid each tick; the open state and
 * the world could never disagree, but the grid itself lied about what the ground was). Because the
 * Pathfinder treats doorways as passable regardless, a pursuing enemy routes to the door, which opens as it
 * makes contact — so enemies follow you inside instead of being walled out. (Future: a per-door `locked`
 * flag on the component.)
 */
/** Widest actor body the door probe must see (r + pad headroom) — a conservative spatial cut only; the
 *  exact per-actor reach test below still decides. */
const DOOR_PROBE_R = 64;

export class DoorSystem {
  // query DEFAULTED so standalone tests stand unchanged; the scene passes its SHARED instance (audit M1:
  // every neighbor enumeration through the one chokepoint — the future grid swap must share one index)
  constructor(
    private readonly world: World,
    private readonly query: SpatialQuery = new SpatialQuery(world),
  ) {}

  update(): void {
    for (const d of this.world.with('structure', 'transform')) {
      if (!Structures.get(d.structure.def).door) continue;
      let open = false;
      this.query.forEachWithin(d.transform.x, d.transform.y, d.transform.r + DOOR_PROBE_R, (e) => {
        if (open || !e.mover || e.health?.dead) return;
        const t = e.transform!; // forEachWithin only visits transformed entities
        const reach = t.r + d.transform.r + APPROACH_PAD; // actor body APPROACHING the door's footprint opens it
        if ((t.x - d.transform.x) ** 2 + (t.y - d.transform.y) ** 2 < reach * reach) open = true;
      });
      d.structure.open = open;
    }
  }
}
