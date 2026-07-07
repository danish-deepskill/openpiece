import { deckCellAtLocal, deckOf, deckToWorld, deckWalkable, gangplankCell, gangplankOutward, worldToDeck, type DeckGrid } from '../defs/decks';
import { ShipHulls } from '../defs/ships';
import { hullBlocksOutside } from '../world/deckCollision';
import { enterDeck, inFrameCooldown } from '../world/frames';
import type { Entity } from '../ecs/components';
import type { World } from '../ecs/World';

/**
 * BOARDING HANDOFFS + a hull depenetration FALLBACK (movement-frames.md / big-walkable-ship.md). The hull is a
 * MOVING obstacle to world walkers, but the true WALL-BLOCK now lives in MovementSystem (its tryMove rejects a step
 * INTO a hull — you bump the rail and slide, no teleport). This system, run AFTER ships + world movement, handles
 * what a move-block can't: the FRAME TRANSITIONS onto a ship — (1) walk across the GANGPLANK → board; (2) land a
 * jump/Geppo on the DECK interior → board (the leap-on). Plus a depenetration FALLBACK for the rare case a walker
 * ends up embedded in a hull anyway (the SHIP swept over a stationary body, a spawn-in-hull) — a MINIMAL radial
 * eject (a bump to the edge), not the old fling-to-nearest-sea. AIRBORNE + on-deck actors are skipped.
 */
export class HullCollisionSystem {
  constructor(private readonly world: World) {}

  update(): void {
    for (const ship of this.world.with('ship', 'transform')) {
      const st = ship.transform!;
      const grid = deckOf(ship.ship!.hull, ShipHulls.get(ship.ship!.hull).deck);
      const reach = st.r + 24; // a walker must be at least this close to possibly overlap the hull (cheap reject)
      for (const e of this.world.with('transform', 'mover')) {
        if (e.onDeck || e.mover!.layer === 'air' || e.mover!.mode === 'boat' || e.health?.dead) continue; // aboard / jumping over / a ship / dead
        const t = e.transform!;
        const dx = t.x - st.x;
        const dy = t.y - st.y;
        if (dx * dx + dy * dy > (reach + t.r) * (reach + t.r)) continue; // too far to touch this hull
        const local = worldToDeck(st, t.x, t.y);
        // THE GANGPLANK IS A PASSAGE, not a point. If the walker's CENTER is within the gangplank LANE (the
        // gangplank cell + the approach cell just outside it), it's crossing the door — do NOT push it (even though
        // its radius overlaps the flanking rails), and BOARD it the moment its center reaches the gangplank cell.
        // This is why bug'd before: the center-only board check let the radius-based push shove you off the lane
        // before your center ever reached the plank.
        if (this.inGangplankLane(grid, local.lx, local.ly)) {
          const gp = gangplankCell(grid)!;
          // BOARD when the center reaches the gangplank cell — snap onto the cell CENTER (a stable inward foothold),
          // NOT the exact crossing point (which sits at the outer edge and would instantly re-trip the walk-off).
          // Skip during the frame-switch cooldown (just left the ship → don't instantly re-board = ping-pong).
          if (!inFrameCooldown(e) && deckCellAtLocal(grid, local.lx, local.ly)?.tile === 'gangplank') {
            enterDeck(e, ship.id, gp.lx, gp.ly);
          }
          continue; // in the lane → never pushed (the door is open)
        }
        // LAND-ON-DECK BOARDING: a world walker whose center is over a WALKABLE interior cell got there by clearing
        // the rail through the AIR (jump/Geppo over the low-wall rail, then landed inside) — that IS boarding, the
        // "leap onto the ship" path (movement-frames / naval-battle design). Board it in place instead of pushing it
        // back out. WALKABLE only — a 'hole' cell is on-hull but NOT standable (boarding into it would stick the
        // walker inside a blocked cell); non-walkable on-hull cells fall through to the eject below.
        const cell = deckCellAtLocal(grid, local.lx, local.ly);
        if (cell && deckWalkable(cell.tile) && !inFrameCooldown(e)) {
          enterDeck(e, ship.id, local.lx, local.ly); // keep the exact landing spot on the deck
          continue;
        }
        if (!hullBlocksOutside(grid, local.lx, local.ly, t.r)) continue; // clear — nothing to do
        this.pushOut(e, ship, local.lx, local.ly, t.r);
      }
    }
  }

  /** Is the LOCAL point inside the gangplank LANE — the open corridor through the door? The lane spans the
   *  gangplank cell and extends ONE tile OUTWARD (toward the sea, the side that faces off-grid), across the full
   *  tile width. A walker whose center is here is crossing the door and must not be pushed (its radius overlaps the
   *  flanking rails, but the door is open). Derived from the gangplank cell's outward direction — data, not hardcoded. */
  private inGangplankLane(grid: DeckGrid, lx: number, ly: number): boolean {
    const g = gangplankCell(grid);
    if (!g) return false;
    const t = grid.tilePx;
    const [ox, oy] = gangplankOutward(grid, g); // the ONE authority for "which way is out" (shared with the walk-off)
    // lane box: the gangplank cell, extended one tile in the outward direction. Center it between the two.
    const cxCenter = g.lx + (ox * t) / 2;
    const cyCenter = g.ly + (oy * t) / 2;
    const halfAlong = ox !== 0 ? t : t / 2; // 2 tiles deep along the outward axis, 1 tile wide across it
    const halfAcross = ox !== 0 ? t / 2 : t;
    return Math.abs(lx - cxCenter) <= halfAlong && Math.abs(ly - cyCenter) <= halfAcross;
  }

  /** MINIMAL ejection — the hull is a WALL you BUMP, not a magnet that flings you. Push the walker the SHORTEST
   *  distance RADIALLY OUTWARD (away from the hull center, roughly the surface normal) until it just clears the
   *  solid hull. Because a foot walker only penetrates ~one tick of movement before this runs, the clear spot is
   *  right where it entered → it reads as "stopped at the rail", not teleported to the nearest sea. (Contrast the
   *  old ring-search-from-center, which flung the walker far — the push/teleport bug.) Fine steps, first clear wins. */
  private pushOut(e: Entity, ship: Entity, lx: number, ly: number, r: number): void {
    const grid = deckOf(ship.ship!.hull, ShipHulls.get(ship.ship!.hull).deck);
    const st = ship.transform!;
    // radial-out direction in LOCAL space (from hull center to the walker); fall back to +x if dead-center
    const d = Math.hypot(lx, ly) || 1;
    const ux = lx !== 0 || ly !== 0 ? lx / d : 1;
    const uy = lx !== 0 || ly !== 0 ? ly / d : 0;
    const step = 2; // px — fine, so the ejection is the MINIMUM needed (a wall bump, not a shove)
    for (let i = 1; i <= grid.tilePx * grid.cols; i += step) {
      const nlx = lx + ux * i;
      const nly = ly + uy * i;
      if (!hullBlocksOutside(grid, nlx, nly, r)) {
        const w = deckToWorld(st, nlx, nly); // just outside the hull, along the way it came → reads as "stopped here"
        e.transform!.x = w.x;
        e.transform!.y = w.y;
        return;
      }
    }
  }
}
