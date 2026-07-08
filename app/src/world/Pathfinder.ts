import { TILE } from '../config/constants';
import type { MoveMode } from '../ecs/components';
import { TileGrid } from './TileGrid';

export interface Waypoint {
  x: number;
  y: number;
}

const SQRT2 = Math.SQRT2;
const DIRS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/**
 * Grid A* navigation + line-of-sight, over the same walkable rules as Collision. Used by AI to route
 * around walls. Linear-scan open set is fine at our grid size + throttled repaths; swap for a binary heap
 * if profiling ever demands it.
 */
export class Pathfinder {
  constructor(private readonly grid: TileGrid) {}

  private walkable(tx: number, ty: number, mode: MoveMode): boolean {
    // both layers: the ground must be plannable AND nothing blocking may be built on it (doorways are
    // routable for AI — StructureIndex.pathable treats doors as open, DoorSystem opens them on arrival)
    return TileGrid.pathable(this.grid.tileAt(tx, ty), mode) && this.grid.structures.pathable(tx, ty, mode);
  }

  private walkableAtPx(x: number, y: number, mode: MoveMode): boolean {
    return this.walkable(Math.floor(x / TILE), Math.floor(y / TILE), mode);
  }

  private toCenter(tx: number, ty: number): Waypoint {
    return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
  }

  /** Octile heuristic. */
  private h(x: number, y: number, gx: number, gy: number): number {
    const dx = Math.abs(x - gx);
    const dy = Math.abs(y - gy);
    return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
  }

  /** Nearest walkable tile to a (possibly blocked) goal, searched in rings. */
  private nearestWalkable(tx: number, ty: number, mode: MoveMode): { x: number; y: number } | null {
    if (this.walkable(tx, ty, mode)) return { x: tx, y: ty };
    for (let r = 1; r <= 5; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // ring only
          if (this.walkable(tx + dx, ty + dy, mode)) return { x: tx + dx, y: ty + dy };
        }
      }
    }
    return null;
  }

  /** A* path of tile-center pixel waypoints (excludes the start tile). null if unreachable. */
  findPath(sx: number, sy: number, gx: number, gy: number, mode: MoveMode): Waypoint[] | null {
    const startX = Math.floor(sx / TILE);
    const startY = Math.floor(sy / TILE);
    const goal = this.nearestWalkable(Math.floor(gx / TILE), Math.floor(gy / TILE), mode);
    if (!goal) return null;
    if (startX === goal.x && startY === goal.y) return [];

    const W = this.grid.w;
    const key = (x: number, y: number) => y * W + x;
    const startK = key(startX, startY);
    const goalK = key(goal.x, goal.y);

    const open = new Set<number>([startK]);
    const gScore = new Map<number, number>([[startK, 0]]);
    const fScore = new Map<number, number>([[startK, this.h(startX, startY, goal.x, goal.y)]]);
    const came = new Map<number, number>();

    let guard = 0;
    while (open.size > 0 && guard++ < 30000) {
      // extract the open node with the lowest f
      let cur = -1;
      let best = Infinity;
      for (const k of open) {
        const f = fScore.get(k) ?? Infinity;
        if (f < best) {
          best = f;
          cur = k;
        }
      }
      if (cur === goalK) return this.reconstruct(came, cur, startK, W);
      open.delete(cur);
      const cx = cur % W;
      const cy = Math.floor(cur / W);
      const curG = gScore.get(cur) ?? Infinity;

      for (const [dx, dy] of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!this.walkable(nx, ny, mode)) continue;
        if (dx !== 0 && dy !== 0) {
          // no corner cutting through wall diagonals
          if (!this.walkable(cx + dx, cy, mode) || !this.walkable(cx, cy + dy, mode)) continue;
        }
        const nk = key(nx, ny);
        const tentative = curG + (dx !== 0 && dy !== 0 ? SQRT2 : 1);
        if (tentative < (gScore.get(nk) ?? Infinity)) {
          came.set(nk, cur);
          gScore.set(nk, tentative);
          fScore.set(nk, tentative + this.h(nx, ny, goal.x, goal.y));
          open.add(nk);
        }
      }
    }
    return null;
  }

  private reconstruct(came: Map<number, number>, goalK: number, startK: number, W: number): Waypoint[] {
    const path: Waypoint[] = [];
    let k = goalK;
    while (k !== startK) {
      path.push(this.toCenter(k % W, Math.floor(k / W)));
      const prev = came.get(k);
      if (prev === undefined) break;
      k = prev;
    }
    path.reverse();
    return path;
  }

  /**
   * Can a circle of radius `r` travel the straight line a→b without its BODY clipping a wall? Radius-aware,
   * for movement decisions — so an agent routes around a corner its body can't clear, even when the thin
   * center-line is open. (Vision uses plain lineOfSight; a gap you can see through may be too tight to walk.)
   */
  clearLine(ax: number, ay: number, bx: number, by: number, mode: MoveMode, r: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(len / (TILE * 0.5)));
    const ox = len > 0 ? (-dy / len) * r : 0; // perpendicular ×r = the body's half-width
    const oy = len > 0 ? (dx / len) * r : 0;
    for (let i = 0; i <= steps; i++) {
      const x = ax + (dx * i) / steps;
      const y = ay + (dy * i) / steps;
      // sample the center line AND both swept edges — if any clips a wall, the body won't fit
      if (
        !this.walkableAtPx(x, y, mode) ||
        !this.walkableAtPx(x + ox, y + oy, mode) ||
        !this.walkableAtPx(x - ox, y - oy, mode)
      ) {
        return false;
      }
    }
    return true;
  }

  /** True if a straight line between two pixel points crosses no blocking tile. */
  lineOfSight(ax: number, ay: number, bx: number, by: number, mode: MoveMode): boolean {
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (TILE * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const x = ax + ((bx - ax) * i) / steps;
      const y = ay + ((by - ay) * i) / steps;
      if (!this.walkableAtPx(x, y, mode)) return false; // can see through doorways
    }
    return true;
  }
}
