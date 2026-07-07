import { GEPPO_FALL_DUR, GEPPO_HOVER_HEIGHT, GEPPO_KICK_INTERVAL, GEPPO_KICK_STAM, GEPPO_MOVE_MULT, JUMP_LAND_STUN, LEDGE_MOVE_MULT, STUN_SLOW, TILE } from '../config/constants';
import { spendStamina } from '../combat/stamina';
import { events } from '../core/EventBus';
import { deckCanOccupy, deckCellAtLocal, deckOf, deckToWorld, deckTryMove, gangplankOutward, hullBlocksWorldPoint, worldToDeck } from '../defs/decks';
import { ShipHulls } from '../defs/ships';
import { enterDeck, exitDeck, inFrameCooldown } from '../world/frames';
import { TileGrid } from '../world/TileGrid';
import type { Entity, Mover } from '../ecs/components';
import type { World } from '../ecs/World';
import type { Collision } from '../world/Collision';

/** End a GEPPO hover into a FALL: clear hovering, but stay airborne and DESCEND over GEPPO_FALL_DUR (the render
 *  eases scale from the hover height → 0) — the land + stun fire at the bottom, so it doesn't snap to the ground.
 *  Shared by the toggle-off (AbilitySystem) and the out-of-stamina auto-land (here). */
export function beginFall(m: Mover): void {
  m.hovering = false;
  m.fallT = GEPPO_FALL_DUR;
  m.fallDur = GEPPO_FALL_DUR;
  m.fallFrom = GEPPO_HOVER_HEIGHT; // the altitude the descent starts from (the held hover height)
}

/** Integrates movement intent (mover.vx/vy) and dodge impulses against the Collision rules. */
export class MovementSystem {
  /** Ships snapshotted ONCE per update (not per entity) for the hull-blocker — see hullBlocked. */
  private ships: Entity[] = [];
  /** ONE persistent hull-blocker closure (reads the per-tick snapshot) — never allocated per entity per tick. */
  private readonly hullBlocked = (x: number, y: number, r: number): boolean => {
    for (const s of this.ships) {
      const grid = deckOf(s.ship!.hull, ShipHulls.get(s.ship!.hull).deck);
      if (hullBlocksWorldPoint(s.transform!, grid, x, y, r)) return true;
    }
    return false;
  };

  constructor(
    private readonly world: World,
    private readonly collision: Collision,
  ) {}

  update(dt: number): void {
    this.ships = [...this.world.with('ship', 'transform')]; // once per tick, shared by every mover's hull check
    for (const e of this.world.with('transform', 'mover')) {
      const t = e.transform!;
      const m = e.mover!;
      // DEPENETRATION: if this body is STUCK inside solid (spawned in a wall, landed on a tree, shoved into stone),
      // snap it to the nearest clear spot BEFORE it tries to move. Runs for every foot/swim body each tick (a
      // cheap no-op when already clear); a jumper is airborne and passes over things, so skip it mid-air.
      if (m.mode !== 'boat' && m.layer !== 'air' && !e.onDeck) this.collision.unstick(t, t.r, m.mode, false, m.onLedge); // on-deck actors are parented by ShipSystem — don't depenetrate against the ocean grid; a perched actor stays on its low wall (onLedge keeps it walkable)
      if (m.rollT) m.rollT = Math.max(0, m.rollT - dt); // roll-anim clock ticks down independently of the impulse decay
      if ((m.frameCd ?? 0) > 0) m.frameCd = Math.max(0, m.frameCd! - dt); // frame-switch cooldown ticks with the other mover timers
      // GEPPO HOVER (docs/design/MOVEMENT_AIR.md): while hovering, kick off the air every GEPPO_KICK_INTERVAL —
      // each kick spends GEPPO_KICK_STAM + puffs a cloud. When the next kick is UNAFFORDABLE, begin the FALL (a
      // smooth descent, not an instant snap). Stamina-bounded → no infinite flight. The bob/cloud rides hoverT.
      if (m.hovering) {
        m.hoverElapsed = (m.hoverElapsed ?? 0) + dt; // total hover time — drives the launch-then-settle visual
        m.hoverT = (m.hoverT ?? 0) + dt;
        if (m.hoverT >= GEPPO_KICK_INTERVAL) {
          m.hoverT -= GEPPO_KICK_INTERVAL;
          const stam = e.combatant?.stam ?? 0;
          if (stam >= GEPPO_KICK_STAM && e.combatant) {
            spendStamina(e.combatant, GEPPO_KICK_STAM); // pay for the kick (+ pauses regen, one rule)
            events.emit('fx:ring', { x: t.x, y: t.y, radius: t.r * 1.4, color: 0xffffff, life: 0.3 }); // air-kick CLOUD
          } else {
            beginFall(m); // out of gas → descend (same fall path as toggle-off)
          }
        }
      }
      // GEPPO FALL: a descent window after a hover ends — the presentation eases the scale down (RenderSystem
      // reads fallT/fallDur/fallFrom) and the actual LAND (+ stun) fires at the bottom, so it doesn't snap down.
      if ((m.fallT ?? 0) > 0) {
        m.fallT = Math.max(0, (m.fallT ?? 0) - dt);
        if (m.fallT <= 0) this.land(e, m, t); // touched down — fire-once (fallT won't re-enter)
      } else if (m.layer === 'air' && !m.hovering) {
        // PLAIN JUMP (no hover, no fall): the one-shot hop's own airT arc lands it. (Hover never lands this way; it
        // always routes through beginFall → the fall block above.)
        m.airT = Math.max(0, (m.airT ?? 0) - dt);
        if (m.airT <= 0) this.land(e, m, t);
      }
      const airborne = m.layer === 'air';
      let vx: number;
      let vy: number;
      if (m.dodgeT > 0) {
        vx = m.dvx;
        vy = m.dvy;
        const decay = Math.pow(0.86, dt * 60); // time-based (matches the tuned 60fps feel at any frame rate)
        m.dvx *= decay;
        m.dvy *= decay;
        m.dodgeT = Math.max(0, m.dodgeT - dt);
      } else {
        vx = m.vx;
        vy = m.vy;
        if ((e.combatant?.stunT ?? 0) > 0) {
          vx *= STUN_SLOW; // staggered → sluggish (the knockback impulse above is unaffected)
          vy *= STUN_SLOW;
        }
        // TERRAIN SPEED — slower over deep water (swim) / shallows (wade), from the ACTUAL terrain under you (not
        // the mode; the mode is derived below and could lag a tick). Deep water swims, else the ground modifier.
        // SKIP it while AIRBORNE (above the ground) AND while ON DECK: an on-deck actor stands on the wooden deck,
        // not the OCEAN under the hull — reading the sea there would slow deck-walking to a swim pace.
        const overDeep = !airborne && !e.onDeck && this.collision.terrainAtPx(t.x, t.y).water === 'deep';
        const terrain = airborne || e.onDeck ? 1 : overDeep ? this.collision.swimSpeed(t.x, t.y) : this.collision.terrainSpeed(t.x, t.y);
        vx *= terrain;
        vy *= terrain;
        if (m.onLedge) { // balancing atop a low wall — a slow perch (movement-frames / MOVEMENT_AIR)
          vx *= LEDGE_MOVE_MULT;
          vy *= LEDGE_MOVE_MULT;
        }
        if (m.hovering) { // GEPPO: skate through the air FASTER than a ground walk (docs/design/MOVEMENT_AIR.md)
          vx *= GEPPO_MOVE_MULT;
          vy *= GEPPO_MOVE_MULT;
        }
      }
      // RESOLVE the (already speed/terrain/perch-scaled, world-space) velocity in the actor's FRAME — the ONE
      // locomotion dispatch (movement-frames.md), now all in this system + this phase so nothing is a tick stale.
      if (e.onDeck) {
        this.moveOnDeck(e, m, vx, vy, dt, airborne); // DECK frame: deck-local move + airborne-leave + rail step-off
      } else {
        // WORLD frame. A grounded off-ship walker also can't move INTO a ship hull (a moving wall the static grid
        // can't know) — reject the step so you bump the rail and slide, never teleport. Airborne (jump over) skips
        // it. ONE persistent closure over the per-tick ship snapshot — no per-entity allocation (hot-loop canon).
        const hullBlock = !airborne && this.ships.length > 0 ? this.hullBlocked : undefined;
        if (vx !== 0 || vy !== 0) this.collision.tryMove(t, vx * dt, vy * dt, t.r, m.mode, airborne, m.onLedge, hullBlock);
        // STEP OFF the ledge: clear the perch ONLY once your WHOLE BODY has cleared the low wall (you'd fit WITHOUT
        // the perch). Clearing on center-only dropped it while your radius still overlapped → unstick flung you (the
        // step-off teleport). Full-body clearance means onLedge drops only when you're already off — nothing to eject.
        if (m.onLedge && this.collision.canOccupy(t.x, t.y, t.r, m.mode, false, false)) m.onLedge = false;
      }
      // SWIM/FOOT MODE = a LABEL derived from WHERE YOU NOW ARE (after the move), one truthful rule: SWIM iff the
      // tile under your center is deep Water, else FOOT. No predictive early-flip, no ahead/behind/corner
      // heuristics — the mode simply follows your position, so speed/opacity/pose/drain (all read it) can never
      // disagree with the terrain. Collision is mode-agnostic (foot & swim share one walkable), so entering/exiting
      // never walls you; the mode just relabels as you cross. This ONE rule replaced the whole seam-bug family.
      // NOT while ON DECK: an on-deck actor rides the BOAT's deck (parented by ShipSystem), so its mode/position
      // follow the ship — the terrain under it (open sea) must NOT relabel it a swimmer (it'd drain breath + show
      // the swim pose while safely aboard). Boarding sets things up; here we just leave an on-deck actor's mode alone.
      if (!airborne && !e.onDeck && (m.mode === 'foot' || m.mode === 'swim')) {
        m.mode = this.collision.terrainAtPx(t.x, t.y).water === 'deep' ? 'swim' : 'foot';
      }
    }
  }

  /** Touch down from a jump/fall: back to the ground layer + a punishable landing stun, then set the PERCH if you
   *  came down atop a LOW WALL — a StoneWall/Tree in the WORLD, or a ship RAIL (on the deck OR reached from the
   *  world by a jump). The low wall becomes walkable (balance across it, slowly) instead of stranding you stuck.
   *  Checked in whichever FRAME the actor is in — and a WORLD walker landing on a ship rail gets adopted into the
   *  deck frame + perched (the rail is the ship's low wall; landing there is like landing on a world stone wall). */
  private land(e: Entity, m: Mover, t: { x: number; y: number }): void {
    m.layer = 'ground';
    if (e.combatant) e.combatant.stunT = Math.max(e.combatant.stunT ?? 0, JUMP_LAND_STUN);
    if (e.onDeck) {
      const ship = this.world.byId(e.onDeck.shipId);
      if (ship?.ship) {
        const grid = deckOf(ship.ship.hull, ShipHulls.get(ship.ship.hull).deck);
        m.onLedge = deckCellAtLocal(grid, e.onDeck.lx, e.onDeck.ly)?.tile === 'rail'; // perched on the ship rail
      }
      return;
    }
    // WORLD walker: landed on a world low wall?
    if (TileGrid.isLowWall(this.collision.tileAtPx(t.x, t.y))) { m.onLedge = true; return; }
    // …or on a SHIP RAIL (the deck's low wall)? A jump from the world can come down on the rail — adopt into the
    // deck frame via the ONE transition primitive (enterDeck normalizes swim/dive state — a raw onDeck write here
    // once let a swimmer land on the rail still labeled 'swim' and DROWN standing on it), then perch. This is the
    // rail twin of land-on-deck boarding (HullCollisionSystem handles the interior cells).
    for (const ship of this.ships) {
      const grid = deckOf(ship.ship!.hull, ShipHulls.get(ship.ship!.hull).deck);
      const local = worldToDeck(ship.transform!, t.x, t.y);
      if (deckCellAtLocal(grid, local.lx, local.ly)?.tile === 'rail') {
        enterDeck(e, ship.id, local.lx, local.ly);
        m.onLedge = true;
        return;
      }
    }
    m.onLedge = false;
  }

  /** DECK-FRAME locomotion: apply a WORLD-space velocity (vx,vy — already speed/perch-scaled) to an on-deck actor's
   *  LOCAL position, resolved against the DECK grid. Handles the deck's own move (rail walls unless airborne/perched),
   *  the AIRBORNE-LEAVE (fly off the deck edge → world frame), and the rail STEP-OFF. All in this ONE phase beside
   *  land/perch, so a deck jumper's move + landing state can never be a tick out of sync (the root-cause fix). */
  private moveOnDeck(e: Entity, m: Mover, vx: number, vy: number, dt: number, airborne: boolean): void {
    const ship = e.onDeck ? this.world.byId(e.onDeck.shipId) : undefined;
    if (!ship?.ship || !ship.transform || !e.onDeck) return;
    const grid = deckOf(ship.ship.hull, ShipHulls.get(ship.ship.hull).deck);
    // world velocity → deck-local delta this tick (un-rotate by the ship heading, × dt)
    const a = -ship.transform.angle;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const dlx = (vx * cos - vy * sin) * dt;
    const dly = (vx * sin + vy * cos) * dt;
    const cooldown = inFrameCooldown(e);
    const cell = deckCellAtLocal(grid, e.onDeck.lx, e.onDeck.ly);
    // GANGPLANK WALK-OFF: grounded on the door, pushing OUTWARD → step off to world space (a full clearance past
    // the door so the board-lane doesn't re-catch it). Dot-product test — robust to how far it moves this tick.
    if (cell?.tile === 'gangplank' && !cooldown && !airborne && (dlx !== 0 || dly !== 0)) {
      const [ox, oy] = gangplankOutward(grid, cell);
      if (dlx * ox + dly * oy > 0) {
        const clear = e.transform!.r + grid.tilePx;
        const w = deckToWorld(ship.transform, e.onDeck.lx + ox * clear, e.onDeck.ly + oy * clear);
        exitDeck(e, w.x, w.y);
        return;
      }
    }
    // AIRBORNE LEAVE: airborne + moving OUTWARD off an OUTER cell (a full tile ahead is off-grid) → fly out to world
    // space (mirror of land-on-deck boarding). Frees the leap-off; stays airborne (lands in the world later).
    if (airborne && !cooldown && (dlx !== 0 || dly !== 0)) {
      const len = Math.hypot(dlx, dly);
      const aheadLx = e.onDeck.lx + (dlx / len) * grid.tilePx;
      const aheadLy = e.onDeck.ly + (dly / len) * grid.tilePx;
      if (deckCellAtLocal(grid, aheadLx, aheadLy) === undefined) {
        const w = deckToWorld(ship.transform, aheadLx, aheadLy);
        exitDeck(e, w.x, w.y); // stays airborne (layer unchanged) → keeps flying in world space, lands later
        return;
      }
    }
    deckTryMove(e.onDeck, dlx, dly, grid, e.transform!.r, airborne, m.onLedge);
    // STEP OFF the rail perch: clear ONLY when the whole body has cleared the rail (fits WITHOUT the perch). Center-
    // only clearing would wall you at the edge next tick (deck twin of the world step-off teleport).
    if (m.onLedge && deckCanOccupy(grid, e.onDeck.lx, e.onDeck.ly, e.transform!.r, false, false)) m.onLedge = false;
  }
}
