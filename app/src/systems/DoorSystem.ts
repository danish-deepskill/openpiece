import { TILE } from '../config/constants';
import { TERRAIN } from '../defs/terrains';
import type { World } from '../ecs/World';
import type { TileGrid } from '../world/TileGrid';

const TOUCH_PAD = 4; // px past 'just touching' before a door opens (so contact reliably triggers it)

/**
 * Openable building doors — SIM ONLY (the closed-door panel is drawn by draw/DoorRenderer). A `Door` tile
 * blocks movement (collision) while closed; this system flips it to `Floor` (open) whenever a foot actor
 * TOUCHES it, then back to `Door` when none do. Because the Pathfinder treats doorways as passable
 * regardless, a pursuing enemy routes to the door, which opens as it makes contact — so enemies follow you
 * inside instead of being walled out. AI pathing + collision + a headless server all depend on this tile
 * flip, which is why it must run without Phaser. (Future: a per-door `locked` flag.)
 */
export class DoorSystem {
  /** Per-door open state, parallel to `doors` — read by DoorRenderer to draw the closed panels. */
  readonly open: boolean[];

  constructor(
    private readonly grid: TileGrid,
    readonly doors: { tx: number; ty: number }[],
    private readonly world: World,
  ) {
    this.open = doors.map(() => false);
    this.update(); // start with the correct (closed) state before the first tick
  }

  update(): void {
    for (let i = 0; i < this.doors.length; i++) {
      const d = this.doors[i];
      const cx = d.tx * TILE + TILE / 2;
      const cy = d.ty * TILE + TILE / 2;
      let open = false;
      for (const e of this.world.with('transform', 'mover')) {
        if (e.health?.dead) continue;
        const t = e.transform;
        const reach = t.r + TILE / 2 + TOUCH_PAD; // the actor's body reaching the door tile = touch
        if ((t.x - cx) ** 2 + (t.y - cy) ** 2 < reach * reach) {
          open = true;
          break;
        }
      }
      this.open[i] = open;
      this.grid.tiles[d.ty][d.tx] = open ? TERRAIN.floor : TERRAIN.door;
    }
  }
}
