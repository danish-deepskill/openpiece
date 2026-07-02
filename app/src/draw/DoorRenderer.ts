import type Phaser from 'phaser';
import { Depth, TILE } from '../config/constants';
import type { DoorSystem } from '../systems/DoorSystem';

/**
 * Draws the shut-door panels for every closed door — PRESENTATION half of the door feature (the sim tile
 * flip lives in systems/DoorSystem). Redrawn per render frame from DoorSystem.open; the baked terrain is
 * static, so the open/closed look can't live in it.
 */
export class DoorRenderer {
  private readonly gfx: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private readonly doors: DoorSystem,
  ) {
    this.gfx = scene.add.graphics().setDepth(Depth.Building);
    this.update(); // correct (closed) look before the first play frame
  }

  update(): void {
    const g = this.gfx;
    g.clear();
    for (let i = 0; i < this.doors.doors.length; i++) {
      if (!this.doors.open[i]) {
        const d = this.doors.doors[i];
        this.drawClosed(g, d.tx * TILE, d.ty * TILE);
      }
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
