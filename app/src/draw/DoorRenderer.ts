import type Phaser from 'phaser';
import { Depth, TILE } from '../config/constants';
import { Structures } from '../defs/structures';
import type { World } from '../ecs/World';

/**
 * Draws the shut-door panels for every closed door STRUCTURE — PRESENTATION half of the door feature (the
 * `structure.open` flip lives in systems/DoorSystem). Redrawn per render frame from the entities' own open
 * state; the baked structure layer is static, so the open/closed look can't live in it.
 */
export class DoorRenderer {
  private readonly gfx: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private readonly world: World,
  ) {
    this.gfx = scene.add.graphics().setDepth(Depth.Building);
    this.update(); // correct (closed) look before the first play frame
  }

  update(): void {
    const g = this.gfx;
    g.clear();
    for (const e of this.world.with('structure')) {
      const s = e.structure;
      if (s.open || !Structures.get(s.def).door) continue;
      this.drawClosed(g, s.tx * TILE, s.ty * TILE);
    }
  }

  /** A shut wood door filling the doorway opening (between the baked frame posts). */
  private drawClosed(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0x7a5530, 1);
    g.fillRect(x + 5, y, TILE - 10, TILE + 1);
    g.fillStyle(0x9a7548, 1); // plank highlight
    g.fillRect(x + 5, y + 2, TILE - 10, 3);
    g.fillStyle(0x46301a, 1); // center split (double door)
    g.fillRect(x + TILE / 2 - 1, y, 2, TILE + 1);
    g.fillStyle(0xd9c089, 1); // handles
    g.fillCircle(x + TILE / 2 - 4, y + TILE / 2, 1.6);
    g.fillCircle(x + TILE / 2 + 4, y + TILE / 2, 1.6);
  }
}
