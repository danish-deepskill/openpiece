import { deckCellAtLocal, deckOf, deckToWorld, deckWalkable, gangplankOutward, nearestGangplank, worldToDeck, type DeckCell, type DeckGrid } from '../defs/decks';
import { ShipHulls } from '../defs/ships';
import { deckCanOccupy, hullBlocksOutside, hullWoodClearance } from '../world/deckCollision';
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
      const hull = ShipHulls.get(ship.ship!.hull);
      const grid = deckOf(ship.ship!.hull, hull.deck);
      // cheap distance reject — (length+width)/2 ≥ the grid's half-diagonal. NOT ship.r (the ocean radius ≈ half-
      // width): that under-covered a long hull's bow/stern corners, leaving a dead zone where landings neither
      // boarded nor pushed.
      const reach = (hull.length + hull.width) / 2;
      for (const e of this.world.with('transform', 'mover')) {
        if (e.onDeck || e.mover!.layer === 'air' || e.mover!.mode === 'boat' || e.health?.dead) continue; // aboard / jumping over / a ship / dead
        const t = e.transform!;
        const dx = t.x - st.x;
        const dy = t.y - st.y;
        if (dx * dx + dy * dy > (reach + t.r) * (reach + t.r)) continue; // too far to touch this hull
        const local = worldToDeck(st, t.x, t.y);
        // THE GANGPLANK IS A PASSAGE, not a point. If the walker's CENTER is within the gangplank LANE (the
        // gangplank cell + the approach cell just outside it), it's crossing the door — do NOT push it (even though
        // its radius overlaps the flanking rails). The DOOR IS DIRECTION-AWARE + CONTINUOUS: board WHERE THE FEET
        // ARE (no snap to the cell center — that was a visible pop), only while moving INWARD (loitering in the
        // doorway or heading out boards nothing — the walk-off's outward twin, so on/off can't oscillate and no
        // cooldown mute is needed). The handoff fires the moment the center crosses ONTO the board — the STRADDLE,
        // half on the plank, half outside (the developer's spec: the frame follows the floor edge, both ways) —
        // with PERCH-AS-NEEDED covering the overhang for the first steps until the body fully fits (the old
        // strict fit kept you world-framed until a full radius onto the board).
        const laneGp = this.laneDoor(grid, local.lx, local.ly);
        if (laneGp) {
          const gp = laneGp;
          // inward is RELATIVE (walker velocity MINUS the hull's own motion): the door line belongs to the
          // SHIP, so a reversing hull sliding its plank under an IDLE walker crosses the same line — gating
          // on the walker's intent alone left him world-framed across the whole board, flipping only at the
          // INNER straddle via the interior land-on fallback (the report). Reads the TRUE momentum vector
          // (sailing: velocity lags heading), so a hull drifting sideways through a turn counts too. Still
          // linear-only: the turn sweep (ω×r) isn't tracked as state (pilot() writes angle directly), and a
          // turning hull sweeps the plank SIDEWAYS out of the lane rather than through the door line.
          const svx = ship.ship!.vx;
          const svy = ship.ship!.vy;
          if (
            deckCellAtLocal(grid, local.lx, local.ly)?.tile === 'gangplank' &&
            this.movingInward(e.mover!.vx - svx, e.mover!.vy - svy, st.angle, grid, gp)
          ) {
            enterDeck(e, ship.id, local.lx, local.ly); // NO perch: the plank is a corridor — moveOnDeck walks
            //                                            the entry overhang in along the board axis (no PERCH state)
          }
          continue; // in the lane → never pushed (the door is open)
        }
        // LAND-ON-DECK BOARDING: a world walker whose center is over a WALKABLE interior cell got there by clearing
        // the rail through the AIR (jump/Geppo over the low-wall rail, then landed inside) — that IS boarding, the
        // "leap onto the ship" path (movement-frames / naval-battle design). Board it in place instead of pushing it
        // back out. WALKABLE only — a 'hole' cell is on-hull but NOT standable (boarding into it would stick the
        // walker inside a blocked cell); non-walkable on-hull cells fall through to the eject below. NOT muted by
        // the frame cooldown: this pair can't ping-pong (the airborne-leave needs AIR, boarding needs GROUND), and
        // muting it flung a walker who landed back on the deck right after an exit (the embedded-body eject below).
        const cell = deckCellAtLocal(grid, local.lx, local.ly);
        if (cell && deckWalkable(cell.tile)) {
          enterDeck(e, ship.id, local.lx, local.ly); // keep the exact landing spot on the deck
          // PERCH-AS-NEEDED, same rule as landings: a leap can come down with the CENTER on walkable deck but
          // the BODY over the rail — boarded grounded-illegal would freeze; perched it's movable + self-clears.
          e.mover!.onLedge = !deckCanOccupy(grid, local.lx, local.ly, t.r, false, false);
          continue;
        }
        if (cell?.tile === 'rail' && !inFrameCooldown(e)) {
          // a grounded world body whose center sits ON the rail BLOCK (a jump landing, incl. half-over-the-sea)
          // PERCHES on it — the block is standable exactly like a world stone wall. Ejecting instead (the
          // pushOut fallthrough) teleported rail-landers to the nearest sea under full-tile rails. MUTED by the
          // frame beat, unlike the interior land-boarding: a fresh gunwale WALK-OFF is exactly such a body
          // (center still on the rail, walking its overlap clear), and adopting it re-boarded the drop-off in
          // a ping-pong — the beat lets it walk free first.
          enterDeck(e, ship.id, local.lx, local.ly);
          e.mover!.onLedge = true;
          continue;
        }
        if (!hullBlocksOutside(grid, local.lx, local.ly, t.r)) continue; // clear — nothing to do
        // JUST TRANSITIONED (the frame beat): a body wider than the rail's outer band legitimately exits the
        // drop-off still overlapping the gunwale wood — the beat lets it WALK itself clear (the embedded-veto
        // lift permits moving while overlapped) instead of being ejected: ejecting here was the walk-off snap.
        if (inFrameCooldown(e)) continue;
        this.pushOut(e, ship, local.lx, local.ly, t.r);
      }
    }
  }

  /** Is this walker moving INTO the ship through the door — in SHIP-RELATIVE terms (callers pass walker
   *  velocity minus hull drift, so a plank sliding under an idle walker counts as inward)? The gangplank's
   *  outward direction is deck-local — rotate it by the ship heading and dot it against the relative motion.
   *  Strictly negative: standing still in the doorway of a STILL ship boards nothing (the door is a passage,
   *  not a pressure plate). */
  private movingInward(rvx: number, rvy: number, angle: number, grid: DeckGrid, gp: DeckCell): boolean {
    const [ox, oy] = gangplankOutward(grid, gp);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return rvx * (ox * cos - oy * sin) + rvy * (ox * sin + oy * cos) < 0;
  }

  /** WHICH door's LANE (the open corridor through a gangplank) contains the LOCAL point — undefined if none.
   *  A lane spans its gangplank cell extended ONE tile OUTWARD (toward the sea), across the full tile width.
   *  A walker whose center is in a lane is crossing THAT door and must not be pushed (its radius overlaps the
   *  flanking rails, but the door is open). Plural-door aware: each gangplank owns its own lane + outward. */
  private laneDoor(grid: DeckGrid, lx: number, ly: number): DeckCell | undefined {
    const t = grid.tilePx;
    // iterate cells directly (nearestGangplank's allocation-free idiom) — gangplankCells() builds a fresh
    // array, and this runs per near-hull walker per tick (ecs-hot-loop rule)
    for (const g of grid.cells) {
      if (g.tile !== 'gangplank') continue;
      const [ox, oy] = gangplankOutward(grid, g); // the ONE authority for "which way is out" (shared with the walk-off)
      // lane box: the gangplank cell, extended one tile in the outward direction. Center it between the two.
      const cxCenter = g.lx + (ox * t) / 2;
      const cyCenter = g.ly + (oy * t) / 2;
      const halfAlong = ox !== 0 ? t : t / 2; // 2 tiles deep along the outward axis, 1 tile wide across it
      const halfAcross = ox !== 0 ? t / 2 : t;
      if (Math.abs(lx - cxCenter) <= halfAlong && Math.abs(ly - cyCenter) <= halfAcross) return g;
    }
    return undefined;
  }

  /** MINIMAL ejection — the hull is a WALL you BUMP, not a magnet that flings you. Search the NEAREST clear spot
   *  in fine rings (1.5px × 8 directions, nearest ring first): a shallow overlap ejects roughly PERPENDICULAR by
   *  just the penetration depth. (The old radial-from-hull-center walk moved a 6px overlap 13px DIAGONALLY —
   *  radial is longer than the surface normal, and its direction ignores which way the body entered.) Within a
   *  ring, take the MOST-CLEARING candidate (≈ the outward normal), never first-clear-in-fixed-order: the fixed
   *  scan started at +x, so every eject nudged EAST — a steering walker skirting a rotated corner had each
   *  tick's westward progress exactly cancelled (the pinned-at-the-jamb-corner limit cycle). A DEEP embed (a
   *  ship sweeping over a stationary body) falls back to the coarse radial walk so nobody stays inside. */
  private pushOut(e: Entity, ship: Entity, lx: number, ly: number, r: number): void {
    const grid = deckOf(ship.ship!.hull, ShipHulls.get(ship.ship!.hull).deck);
    const st = ship.transform!;
    for (let ring = 1.5; ring <= grid.tilePx * 2; ring += 1.5) {
      let bx = 0;
      let by = 0;
      let bestClear = -Infinity;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const nlx = lx + Math.cos(a) * ring;
        const nly = ly + Math.sin(a) * ring;
        if (hullBlocksOutside(grid, nlx, nly, r)) continue;
        const clear = hullWoodClearance(grid, nlx, nly, r);
        if (clear > bestClear) {
          bestClear = clear;
          bx = nlx;
          by = nly;
        }
      }
      if (bestClear > -Infinity) {
        const w = deckToWorld(st, bx, by); // the closest ring's outward-most clear spot — the minimum honest nudge
        e.transform!.x = w.x;
        e.transform!.y = w.y;
        return;
      }
    }
    // DEEP embed (beyond 2 tiles of overlap): the old radial-outward walk — coarse, but guaranteed to exit
    const d = Math.hypot(lx, ly);
    const ux = d > 0.01 ? lx / d : 1; // dead-center on the hull origin → eject toward +x (bow), deterministically
    const uy = d > 0.01 ? ly / d : 0;
    for (let i = 2; i <= grid.tilePx * grid.cols; i += 2) {
      const nlx = lx + ux * i;
      const nly = ly + uy * i;
      if (!hullBlocksOutside(grid, nlx, nly, r)) {
        const w = deckToWorld(st, nlx, nly);
        e.transform!.x = w.x;
        e.transform!.y = w.y;
        return;
      }
    }
  }
}
