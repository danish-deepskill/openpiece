import { TILE } from '../config/constants';
import { Structures } from '../defs/structures';
import type { World } from '../ecs/World';

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
export class DoorSystem {
  constructor(private readonly world: World) {}

  update(): void {
    for (const d of this.world.with('structure', 'transform')) {
      if (!Structures.get(d.structure.def).door) continue;
      let open = false;
      for (const e of this.world.with('transform', 'mover')) {
        if (e.health?.dead) continue;
        const t = e.transform;
        const reach = t.r + d.transform.r + APPROACH_PAD; // actor body APPROACHING the door's footprint opens it
        if ((t.x - d.transform.x) ** 2 + (t.y - d.transform.y) ** 2 < reach * reach) {
          open = true;
          break;
        }
      }
      d.structure.open = open;
    }
  }
}
