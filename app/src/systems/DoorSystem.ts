import { TILE } from '../config/constants';
import { Structures } from '../defs/structures';
import type { World } from '../ecs/World';

const TOUCH_PAD = 4; // px past 'just touching' before a door opens (so contact reliably triggers it)

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
        const reach = t.r + d.transform.r + TOUCH_PAD; // actor body reaching the door's footprint = touch
        if ((t.x - d.transform.x) ** 2 + (t.y - d.transform.y) ** 2 < reach * reach) {
          open = true;
          break;
        }
      }
      d.structure.open = open;
    }
  }
}
