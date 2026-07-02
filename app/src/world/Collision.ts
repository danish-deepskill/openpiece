import { WORLD_H, WORLD_W } from '../config/constants';
import type { MoveMode } from '../ecs/components';
import { TileGrid } from './TileGrid';

/** Circle-vs-tile movement resolution. Walls are tiles now, so this is the single collision rule. */
export class Collision {
  constructor(private readonly grid: TileGrid) {}

  /** Can a circle of radius r sit at (x,y) in this nav mode? */
  canOccupy(x: number, y: number, r: number, mode: MoveMode): boolean {
    const pts: Array<[number, number]> = [
      [x, y],
      [x + r, y],
      [x - r, y],
      [x, y + r],
      [x, y - r],
    ];
    for (const [sx, sy] of pts) {
      if (sx < r || sy < r || sx > WORLD_W - r || sy > WORLD_H - r) return false;
      if (!TileGrid.walkable(this.grid.tileAtPx(sx, sy), mode)) return false;
    }
    return true;
  }

  /** Axis-separated move so sliding along walls feels right. Mutates {x,y}. */
  tryMove(t: { x: number; y: number }, dx: number, dy: number, r: number, mode: MoveMode): void {
    if (dx !== 0 && this.canOccupy(t.x + dx, t.y, r, mode)) t.x += dx;
    if (dy !== 0 && this.canOccupy(t.x, t.y + dy, r, mode)) t.y += dy;
  }

  /** Movement multiplier for the terrain under (x,y) — e.g. 0.5 while wading shallows. */
  terrainSpeed(x: number, y: number): number {
    return TileGrid.speedMul(this.grid.tileAtPx(x, y));
  }
}
