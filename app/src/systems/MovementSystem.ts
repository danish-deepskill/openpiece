import { GEPPO_FALL_DUR, GEPPO_HOVER_HEIGHT, GEPPO_KICK_INTERVAL, GEPPO_KICK_STAM, GEPPO_MOVE_MULT, JUMP_LAND_STUN, LEDGE_MOVE_MULT, SLOW_MULT, TILE } from '../config/constants';
import { spendStamina } from '../combat/stamina';
import { events } from '../core/EventBus';
import { applyEffect, Effects, TAG_SLOWED, TAG_STUNNED } from '../combat/Effect';
import { SWIM_SPEED_STAT } from '../defs/traits';
import { deckCellAtLocal, deckOf, deckToWorld, gangplankOutward, tileAt, worldToDeck, type DeckCell, type DeckGrid } from '../defs/decks';
import { ShipHulls } from '../defs/ships';
import { deckCanOccupy, deckTryMove, hullBlocksWorldPoint, hullRailPen, hullWoodClearance } from '../world/deckCollision';
import { enterDeck, exitDeck, inFrameCooldown } from '../world/frames';
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

/** LEAP BACKWARD (a jump-style hop, not a flat slide) — the Shock Kick's on-HIT retreat: go AIRBORNE for `dur`
 *  seconds (the same air layer + arc a jump uses, so it reads as a real backward hop) while a mass-scaled
 *  impulse carries the body OPPOSITE `facing`. Distinct from a dodge slide: `layer='air'` means the render draws
 *  the rise/shadow arc AND it clears foot-blocked terrain mid-hop. Fired only on a CONNECTED kick (a whiff
 *  leaves the kicker planted — no free escape). MovementSystem lands it (+ the usual landing rules) when airT→0. */
export function leapBack(m: Mover, facing: number, push: number, dur: number): void {
  const speed = push / Math.max(0.2, m.mass); // heavier body hops less far (same mass rule as recoil/knockback)
  m.dvx = -Math.cos(facing) * speed; // the air-window velocity carries via the dodge channel (dvx/dvy)
  m.dvy = -Math.sin(facing) * speed;
  m.dodgeT = Math.max(m.dodgeT, dur); // impulse spans the hop
  m.layer = 'air'; // the JUMP: MovementSystem eases the scale/shadow arc + lands at airT→0 (like ability.jump)
  m.airT = dur;
  m.airDur = dur;
  m.noLandStun = true; // a controlled hop lands clean — don't self-stun the retreat (land() honors + clears this)
}

/** Splash-ring colors by water kind (waterEntryFx) — bluer over the DEEP, paler over the shallows. */
const SPLASH_DEEP = 0x6fb9ec;
const SPLASH_SHALLOW = 0xbfe8ff;

/** Is the (deck-local) push direction toward one of this RAIL cell's SEA-FACING sides? Sea-facing = the orthogonal
 *  neighbor is off-hull — the same neighbor rule as the drawn gunwale wood, so any authored hull shape works.
 *  Corners have two sea sides; pushing toward either counts (you can drop off a corner both ways). */
function railSeaward(grid: DeckGrid, cell: DeckCell, dlx: number, dly: number): boolean {
  return (
    (dly < 0 && tileAt(grid, cell.cx, cell.cy - 1) === undefined) ||
    (dly > 0 && tileAt(grid, cell.cx, cell.cy + 1) === undefined) ||
    (dlx < 0 && tileAt(grid, cell.cx - 1, cell.cy) === undefined) ||
    (dlx > 0 && tileAt(grid, cell.cx + 1, cell.cy) === undefined)
  );
}

/** Integrates movement intent (mover.vx/vy) and dodge impulses against the Collision rules. */
export class MovementSystem {
  /** Ships snapshotted ONCE per update (not per entity) for the hull-blocker — see hullBlocked. */
  private ships: Entity[] = [];
  /** ONE persistent hull-blocker closure (reads the per-tick snapshot) — never allocated per entity per tick.
   *  A conservative distance reject ((length+width)/2 ≥ the grid's half-diagonal — NOT ship.r, the ocean radius,
   *  which under-covers a long hull's bow corners) skips the frame transform for the common far-away case. */
  private readonly hullBlocked = (x: number, y: number, r: number): boolean => {
    for (const s of this.ships) {
      const st = s.transform!;
      const d = ShipHulls.get(s.ship!.hull);
      const reach = (d.length + d.width) / 2 + r;
      const dx = x - st.x;
      const dy = y - st.y;
      if (dx * dx + dy * dy > reach * reach) continue; // nowhere near this hull
      if (hullBlocksWorldPoint(st, deckOf(s.ship!.hull, d.deck), x, y, r)) return true;
    }
    return false;
  };

  /** The BLOCKED-body move rule (replaces the old blanket veto lift, which let a wedged body slide ALONG the
   *  hull at constant depth, while a hard veto instead FROZE it): a hull-overlapping body may only take steps
   *  that increase its clearance from the solid — it always escapes (any outward direction gains clearance
   *  every step) and never enters deeper. embedPose/embedGrid/embedClear are set by the per-mover gate below;
   *  single-threaded scratch. */
  private embedPose: { x: number; y: number; angle: number } | undefined;
  private embedGrid: DeckGrid | undefined;
  private embedClear = 0;
  private embedRailPen = 0; // the RAIL-cell penetration budget — visible gunwale overlap may never grow (see hullRailPen)
  private readonly hullClearer = (x: number, y: number, r: number): boolean => {
    const l = worldToDeck(this.embedPose!, x, y); // ! : only installed when the gate found the blocking ship
    if (hullRailPen(this.embedGrid!, l.lx, l.ly, r) > this.embedRailPen + 0.01) return true; // never deeper into a RAIL, even trading
    const c = hullWoodClearance(this.embedGrid!, l.lx, l.ly, r);
    if (c > this.embedClear + 0.01) return false; // clearer — always allowed (the escape)
    // PARALLEL hull-hug (constant clearance) is allowed only while total penetration is at most ONE BODY
    // RADIUS — a one-sided press against a face (a wedged body sliding to the corner where the gain begins).
    // Beyond a radius you're not hugging a wall, you're THREADING solids — that must climb out. ZERO
    // tolerance on "parallel": a per-tick grace RATCHETED (the baseline re-captures each tick, so a held
    // push crept ~0.6px/s into the hull). Axis-aligned hugs stay exactly equal, so they still slide.
    if (this.embedClear >= -r && c >= this.embedClear) return false;
    return true; // deeper — rejected
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
        // shove ENDED without hitting a wall → the lighter SHOCKED graze (an effect row, not the freeze), then
        // disarm both flags
        if (m.dodgeT <= 0 && (m.slamStun ?? 0) > 0) {
          if ((m.slamSlow ?? 0) > 0) {
            applyEffect(e, 'effect.shocked', 'wallSlam', m.slamSlow);
            const theme = Effects.get('effect.shocked').status?.color ?? 0xffffff; // the electric theme's ONE home
            events.emit('fx:burst', { x: t.x, y: t.y, color: theme, n: 6, speed: 110 }); // a small shock pop
          }
          m.slamStun = undefined;
          m.slamSlow = undefined;
        }
      } else {
        vx = m.vx;
        vy = m.vy;
        if (e.tags?.has(TAG_STUNNED)) {
          vx = 0; // FROZEN → FULLY ROOTED (can't move under its own power). A knockback impulse still carries
          vy = 0; //   (that's the dodgeT branch above), so a wall-slam still flings you — this only kills WALKING.
        } else if (e.tags?.has(TAG_SLOWED)) {
          vx *= SLOW_MULT; // SLOWED → sluggish but still moving (a lighter debuff than the freeze)
          vy *= SLOW_MULT;
        }
        // TERRAIN SPEED — slower over deep water (swim) / shallows (wade), from the ACTUAL terrain under you (not
        // the mode; the mode is derived below and could lag a tick). Deep water swims, else the ground modifier.
        // SKIP it while AIRBORNE (above the ground) AND while ON DECK: an on-deck actor stands on the wooden deck,
        // not the OCEAN under the hull — reading the sea there would slow deck-walking to a swim pace.
        const water = airborne || e.onDeck ? undefined : this.collision.terrainAtPx(t.x, t.y).water; // 'deep' | 'shallow' | undefined
        const overDeep = water === 'deep';
        let terrain = airborne || e.onDeck ? 1 : overDeep ? this.collision.swimSpeed(t.x, t.y) : this.collision.terrainSpeed(t.x, t.y);
        // GREAT SWIMMER trait speeds movement through ANY water — the deep-water swim crawl AND the shallow wade
        // (so a strong swimmer isn't slowed off the beach either). Land terrain is untouched. Spawned StatBlocks
        // seed multiplier stats at base 1 (MULTIPLIER_STAT_SEEDS); ?? 1 covers only an attribute-less body.
        if (water !== undefined) terrain *= e.attributes?.get(SWIM_SPEED_STAT) ?? 1;
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
        // it. The veto only applies FROM A CLEAR POSITION: an EMBEDDED body (overlapping hull wood — swept by a
        // moving ship, or landed in the gangplank lane, where pushOut is exempt) must be able to WALK itself free;
        // vetoing every step while every step still overlaps the wood was the frozen-at-the-rail-tip deadlock.
        // (The lift is ANY-hull: embedded in ship A un-vetoes ship B too for a tick — harmless while pushOut
        // self-heals; revisit per-hull when battle boarding parks hulls rail-to-rail.) The embedded probe lives
        // INSIDE the movement gate — an idle crowd must not pay a per-tick hull sweep for a veto only moves read.
        if (vx !== 0 || vy !== 0) {
          // ONE simple hull truth (full-tile blocks, the gangplank open): a body whose CURRENT spot overlaps
          // a hull gets the ESCAPE rule (hullClearer — steps must move it clearer, so it always walks itself
          // out, never deeper); a clear body gets the plain veto.
          this.embedGrid = undefined;
          if (!airborne && this.ships.length > 0) {
            for (const s of this.ships) {
              const st = s.transform!;
              const d = ShipHulls.get(s.ship!.hull);
              const reach = (d.length + d.width) / 2 + t.r;
              const ddx = t.x - st.x;
              const ddy = t.y - st.y;
              if (ddx * ddx + ddy * ddy > reach * reach) continue;
              const grid = deckOf(s.ship!.hull, d.deck);
              if (hullBlocksWorldPoint(st, grid, t.x, t.y, t.r)) {
                this.embedPose = st; // overlapping THIS hull — the escape rule governs the move
                this.embedGrid = grid;
                const l = worldToDeck(st, t.x, t.y);
                this.embedClear = hullWoodClearance(grid, l.lx, l.ly, t.r);
                this.embedRailPen = hullRailPen(grid, l.lx, l.ly, t.r);
                break;
              }
            }
          }
          const hullBlock = airborne || this.ships.length === 0 ? undefined : this.embedGrid ? this.hullClearer : this.hullBlocked;
          // WALL-SLAM watch (the marine Buttstroke proc): a target flung with slamStun armed, mid-knockback — if
          // this fast shove is STOPPED by a wall, it slammed → electrified pin. We measure progress ALONG the shove
          // DIRECTION (the projection), NOT total distance — a DIAGONAL hit slides along the wall (high total
          // distance) but makes almost no headway toward where it was heading, so a total-distance test would miss
          // it. Projecting onto the heading catches perpendicular AND glancing slams (the "diagonal doesn't stun" bug).
          const wx0 = t.x, wy0 = t.y;
          this.collision.tryMove(t, vx * dt, vy * dt, t.r, m.mode, airborne, m.onLedge, hullBlock);
          // ROTATED-HULL SLIDE: axis-separated WORLD steps cannot slide along a ROTATED hull face — both
          // world-axis targets clip the angled wall, so a diagonally-docked ship felt sticky (players) and
          // pinned approaching AI dead. If a hull veto ate the WHOLE step, retry it decomposed in the
          // BLOCKING SHIP's own axes: the tangential component slides along the face like any wall, the
          // normal component stays refused. Terrain and the hull rules are re-tested per component — this
          // adds no new permission, only the correct slide DIRECTIONS.
          if (hullBlock && t.x === wx0 && t.y === wy0 && (vx !== 0 || vy !== 0)) {
            const wdx = vx * dt;
            const wdy = vy * dt;
            for (const s of this.ships) {
              const st = s.transform!;
              const d = ShipHulls.get(s.ship!.hull);
              const reach = (d.length + d.width) / 2 + t.r + Math.abs(wdx) + Math.abs(wdy);
              if ((wx0 - st.x) ** 2 + (wy0 - st.y) ** 2 > reach * reach) continue;
              if (!hullBlocksWorldPoint(st, deckOf(s.ship!.hull, d.deck), wx0 + wdx, wy0 + wdy, t.r)) continue; // not the blocker
              const cosA = Math.cos(st.angle);
              const sinA = Math.sin(st.angle);
              const slx = wdx * cosA + wdy * sinA; // the step in the ship's axes
              const sly = -wdx * sinA + wdy * cosA;
              // ship-x component (world (slx·cos, slx·sin)), then ship-y — same axis-separated slide, rotated
              const ax = slx * cosA;
              const ay = slx * sinA;
              if (this.collision.canOccupy(t.x + ax, t.y + ay, t.r, m.mode, airborne, m.onLedge) && !hullBlock(t.x + ax, t.y + ay, t.r)) {
                t.x += ax;
                t.y += ay;
              }
              const bx = -sly * sinA;
              const by = sly * cosA;
              if (this.collision.canOccupy(t.x + bx, t.y + by, t.r, m.mode, airborne, m.onLedge) && !hullBlock(t.x + bx, t.y + by, t.r)) {
                t.x += bx;
                t.y += by;
              }
              break; // one blocker owns the slide (multi-hull rail-to-rail is the recorded battle-boarding revisit)
            }
          }
          if ((m.slamStun ?? 0) > 0 && m.dodgeT > 0) {
            const intended = Math.hypot(vx, vy) * dt;
            if (intended > 4) {
              const hx = vx / Math.hypot(vx, vy), hy = vy / Math.hypot(vx, vy); // shove heading (unit)
              const progressed = (t.x - wx0) * hx + (t.y - wy0) * hy; // displacement PROJECTED onto the heading
              // < 70% headway = a wall ate a chunk of the shove. Loose enough for a GLANCING/diagonal hit (only one
              // axis blocked → it still slides the other way, keeping SOME headway) as well as a head-on slam (~0).
              if (progressed < intended * 0.7) this.wallSlam(e, m, t);
            }
          }
        }
        // STEP OFF the ledge: clear the perch ONLY once your WHOLE BODY has cleared the low wall (you'd fit WITHOUT
        // the perch). Clearing on center-only dropped it while your radius still overlapped → unstick flung you (the
        // step-off teleport). Full-body clearance means onLedge drops only when you're already off — nothing to eject.
        if (m.onLedge && this.collision.canOccupy(t.x, t.y, t.r, m.mode, false, false)) {
          m.onLedge = false; // stepped down off the low wall
          this.waterEntryFx(t.x, t.y, t.r); // splashes only if the step-down enters water
        }
      }
      // SWIM/FOOT MODE = a LABEL derived from WHERE YOU NOW ARE (after the move), one truthful rule: SWIM iff the
      // tile under your center is deep Water, else FOOT. No predictive early-flip, no ahead/behind/corner
      // heuristics — the mode simply follows your position, so speed/opacity/pose/drain (all read it) can never
      // disagree with the terrain. Collision is mode-agnostic (foot & swim share one walkable), so entering/exiting
      // never walls you; the mode just relabels as you cross. This ONE rule replaced the whole seam-bug family.
      // NOT while ON DECK: an on-deck actor rides the BOAT's deck (parented by ShipSystem), so its mode/position
      // follow the ship — the terrain under it (open sea) must NOT relabel it a swimmer (it'd drain breath + show
      // the swim pose while safely aboard). Boarding sets things up; here we just leave an on-deck actor's mode alone.
      // …with ONE surface exception: the GANGPLANK BOARD is a floor over the sea (like a dock tile) — a
      // world walker whose center is on the plank cell STANDS on wood: 'foot', not 'swim'. Without it, a
      // body in the lane over deep water counted as a SWIMMER, and the swimmer wood-hug let it slide half
      // its hitbox onto the flanking rail with no jump (and drained breath while standing on a board).
      if (!airborne && !e.onDeck && (m.mode === 'foot' || m.mode === 'swim')) {
        m.mode = this.collision.terrainAtPx(t.x, t.y).water === 'deep' && !this.onPlank(t.x, t.y) ? 'swim' : 'foot';
      }
    }
  }

  /** Is this WORLD point on some ship's gangplank BOARD (the walkable door cell)? The plank is a floor over
   *  the sea — the mode relabel reads it as dry standing ground (see the surface exception above). Distance-
   *  rejected per ship; only consulted for bodies already over deep water near a hull (cold). */
  private onPlank(x: number, y: number): boolean {
    for (const s of this.ships) {
      const st = s.transform!;
      const d = ShipHulls.get(s.ship!.hull);
      const reach = (d.length + d.width) / 2;
      const dx = x - st.x;
      const dy = y - st.y;
      if (dx * dx + dy * dy > reach * reach) continue;
      const grid = deckOf(s.ship!.hull, d.deck);
      const l = worldToDeck(st, x, y);
      if (deckCellAtLocal(grid, l.lx, l.ly)?.tile === 'gangplank') return true;
    }
    return false;
  }

  /** Touch down from a jump/fall: back to the ground layer + a punishable landing stun, then set the PERCH if you
   *  came down atop a LOW WALL — a StoneWall/Tree in the WORLD, or a ship RAIL (on the deck OR reached from the
   *  world by a jump). The low wall becomes walkable (balance across it, slowly) instead of stranding you stuck.
   *  Checked in whichever FRAME the actor is in — and a WORLD walker landing on a ship rail gets adopted into the
   *  deck frame + perched (the rail is the ship's low wall; landing there is like landing on a world stone wall). */
  /** A wall-slam landed (the marine Buttstroke proc): the fast knockback shove was stopped by a wall, so pin the
   *  target — effect.electrified for the armed duration (a FROZEN pin + a themed pop) — kill the impulse
   *  (pinned, not bouncing) and clear the flags. One-shot — consumed here so one shove can't re-slam per frame. */
  private wallSlam(e: Entity, m: Mover, t: { x: number; y: number }): void {
    const pin = m.slamStun ?? 0;
    m.slamStun = undefined;
    m.slamSlow = undefined; // the wall outcome won (the pin) — discard the no-wall graze
    m.dvx = 0; // stop the impulse — pinned against the wall, no bounce/slide
    m.dvy = 0;
    m.dodgeT = 0;
    applyEffect(e, 'effect.electrified', 'wallSlam', pin); // the frozen electric pin (status = an effect row)
    const theme = Effects.get('effect.electrified').status?.color ?? 0xffffff; // the electric theme's ONE home
    events.emit('fx:burst', { x: t.x, y: t.y, color: theme, n: 14, speed: 170 }); // a big zap on impact
    events.emit('fx:shake', { amount: 4 });
  }

  private land(e: Entity, m: Mover, t: { x: number; y: number }): void {
    m.layer = 'ground';
    // a CONTROLLED hop (the Shock Kick's leap-back) lands cleanly — no landing stun would freeze the retreat it
    // just made. A normal jump still eats the recovery stun (the commitment cost). Flag is one-shot: cleared here.
    if (m.noLandStun) m.noLandStun = false;
    else applyEffect(e, 'effect.stunned', 'landing', JUMP_LAND_STUN); // the landing recovery — punishable, like any hard CC
    if (e.onDeck) {
      const ship = this.world.byId(e.onDeck.shipId);
      if (ship?.ship) {
        const grid = deckOf(ship.ship.hull, ShipHulls.get(ship.ship.hull).deck);
        // PERCH-AS-NEEDED: perched iff the GROUNDED rules reject the landing spot — center ON the rail, or the
        // BODY straddling the rail seam with the center on the interior. The old center-cell test missed the
        // straddle: grounded-illegal with no deck depenetration = every step rejected (the frozen-landing bug).
        // Any airborne landing spot is perch-legal on deck (the cleared mask IS the air mask), so this resolves.
        m.onLedge = !deckCanOccupy(grid, e.onDeck.lx, e.onDeck.ly, e.transform!.r, false, false);
      }
      return;
    }
    // WORLD walker on a SHIP RAIL (the deck's low wall)? A jump from the world can come down on the rail — adopt
    // into the deck frame via the ONE transition primitive (enterDeck normalizes swim/dive state — a raw onDeck
    // write here once let a swimmer land on the rail still labeled 'swim' and DROWN standing on it), then perch.
    // This is the rail twin of land-on-deck boarding (HullCollisionSystem handles the interior cells).
    for (const ship of this.ships) {
      const grid = deckOf(ship.ship!.hull, ShipHulls.get(ship.ship!.hull).deck);
      const local = worldToDeck(ship.transform!, t.x, t.y);
      // Adopt ONLY into a LEGAL deck state: the perched body must FIT (cleared mask). At a CORNER, a center
      // inside the rail cell can still hang the body past the hull edge on two sides — adopting that spot is
      // illegal even perched (off-hull blocks all), every step rejected: the sometimes-frozen corner landing.
      // Feet over the sea = you didn't make the gunwale; it's a water landing beside the hull instead.
      if (
        deckCellAtLocal(grid, local.lx, local.ly)?.tile === 'rail' &&
        deckCanOccupy(grid, local.lx, local.ly, e.transform!.r, false, true)
      ) {
        enterDeck(e, ship.id, local.lx, local.ly);
        m.onLedge = true;
        return;
      }
    }
    // Same PERCH-AS-NEEDED rule as the deck: perched iff the grounded rules reject where you stand — center on a
    // low wall, or just the body overlapping one (the old center-tile test left the straddle grounded-illegal and
    // unstick POPPED it clear next tick; perching keeps the landing continuous and clears itself a step later).
    m.onLedge = !this.collision.canOccupy(t.x, t.y, e.transform!.r, m.mode, false, false);
    // AIR DESCENT ended in the world: the general water-entry rule (beach jump into the ocean, Geppo fall into
    // the sea, leap off a ship). NOT while ending PERCHED — you came down ON a wall, above the water.
    if (!m.onLedge) this.waterEntryFx(t.x, t.y, e.transform!.r);
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
    let dlx = (vx * cos - vy * sin) * dt;
    let dly = (vx * sin + vy * cos) * dt;
    const cooldown = inFrameCooldown(e);
    const cell = deckCellAtLocal(grid, e.onDeck.lx, e.onDeck.ly);
    // GANGPLANK WALK-OFF: THE DECK FRAME HOLDS ACROSS THE WHOLE PLANK (the developer's spec) — pushing
    // outward keeps you a deck walker until the board's OUTER END, where the grounded walk can't advance
    // any further (body flush with the end of the board); only THERE does the handoff fire, at the current
    // spot, zero displacement (the gunwale straddle's door twin — the old exit flipped you to world from
    // ANYWHERE on the plank, even half over the interior floor). Still loop-free without a cooldown: the
    // DOOR IS DIRECTION-AWARE — walking on needs INWARD motion (HullCollisionSystem), off needs OUTWARD.
    if (cell?.tile === 'gangplank' && !airborne && (dlx !== 0 || dly !== 0)) {
      const [ox, oy] = gangplankOutward(grid, cell);
      const proj = dlx * ox + dly * oy; // the outward component of this tick's step
      if (proj > 0 && !deckCanOccupy(grid, e.onDeck.lx + ox * proj, e.onDeck.ly + oy * proj, e.transform!.r, false, false)) {
        const w = deckToWorld(ship.transform, e.onDeck.lx, e.onDeck.ly);
        exitDeck(e, w.x, w.y);
        return;
      }
      // pushing outward but not at the board's end yet → keep walking the plank, deck-framed
    }
    // AIRBORNE LEAVE: airborne + moving OUTWARD off an OUTER cell (a full tile ahead is off-grid) → hand off to
    // world space AT THE CURRENT SPOT (mirror of land-on-deck boarding). The tile lookahead is only the TRIGGER
    // (a 1-tick lookahead can't reach off-grid from a cell center — the old invisible-block bug); exiting AT the
    // lookahead point snapped the body a full tile sideways — the "teleported off the ship" pop. Position stays
    // CONTINUOUS: the remaining flight carries you out, and a short hop that comes down still over the rail just
    // perches you there (land()'s rail adoption) — honest, and the drop-off below gets you to the water anyway.
    // No cooldown mute: a jump is EXPLICIT intent (leaving must work right after landing on the rail), and the
    // leave/board pair is air/ground-asymmetric — it cannot loop.
    if (airborne && (dlx !== 0 || dly !== 0)) {
      const len = Math.hypot(dlx, dly);
      if (deckCellAtLocal(grid, e.onDeck.lx + (dlx / len) * grid.tilePx, e.onDeck.ly + (dly / len) * grid.tilePx) === undefined) {
        const w = deckToWorld(ship.transform, e.onDeck.lx, e.onDeck.ly);
        exitDeck(e, w.x, w.y); // stays airborne (layer unchanged) → keeps flying in world space, lands later
        return;
      }
    }
    // RAIL DROP-OFF: PERCHED on the gunwale (grounded), pushing toward a SEA-FACING side → step down off the ship
    // into the water — the deck twin of walking off a world stone wall's far side. Without this the perch dead-ends
    // at an invisible wall (off-hull blocks grounded movement, so the only exits were gangplank/jump). Muted during
    // the post-transition beat: landing on the rail while still holding seaward must not instantly dunk you.
    if (!airborne && m.onLedge && cell?.tile === 'rail' && !cooldown && (dlx !== 0 || dly !== 0) && railSeaward(grid, cell, dlx, dly)) {
      // WALK OFF THE GUNWALE CONTINUOUSLY (the developer's spec): the perched walk carries the center across
      // the rail block seaward — body sliding progressively out over the edge — and the frame handoff fires
      // IN PLACE only at the STRADDLE point: the very next center step would leave the hull, i.e. half on the
      // gunwale, half over whatever is outside (open sea OR a dock/land tile alike — the world terrain below
      // decides swim vs foot). Zero displacement at the transition; the world-side escape rule walks the
      // remaining block overlap out smoothly while the frame beat mutes the eject. (The first full-tile cut
      // used a one-hop step-down here — it read as a teleport.)
      if (deckCellAtLocal(grid, e.onDeck.lx + dlx, e.onDeck.ly + dly) === undefined) {
        const w = deckToWorld(ship.transform, e.onDeck.lx, e.onDeck.ly);
        exitDeck(e, w.x, w.y); // hand off exactly where you stand — the straddle point
        m.onLedge = false; // off the wall
        this.waterEntryFx(w.x, w.y, e.transform!.r); // splashes only if the drop enters water (not onto a dock)
        return;
      }
      // not at the brink yet — fall through to the perched walk (the center keeps crossing the block)
    }
    // A PERCHED CENTER stays ON the wall: the perched mask lets the BODY overhang open sea, but the center may
    // never WALK off the hull — leaving is only the deliberate step-down above (or a jump). Without this clamp,
    // a percher pushing seaward during the post-transition beat (drop-off muted) strolled off the hull footprint
    // and kept walking the open sea deck-framed.
    if (!airborne && m.onLedge) {
      if (dlx !== 0 && deckCellAtLocal(grid, e.onDeck.lx + dlx, e.onDeck.ly) === undefined) dlx = 0;
      if (dly !== 0 && deckCellAtLocal(grid, e.onDeck.lx, e.onDeck.ly + dly) === undefined) dly = 0;
    }
    deckTryMove(e.onDeck, dlx, dly, grid, e.transform!.r, airborne, m.onLedge);
    // STEP OFF the rail perch: clear ONLY when the whole body has cleared the rail (fits WITHOUT the perch). Center-
    // only clearing would wall you at the edge next tick (deck twin of the world step-off teleport).
    if (m.onLedge && deckCanOccupy(grid, e.onDeck.lx, e.onDeck.ly, e.transform!.r, false, false)) m.onLedge = false; // stepped down onto the planks (dry — no FX)
  }

  /** WATER-ENTRY SPLASH — the GENERAL rule of the sea surface, not a perch special case: any DESCENT that ends
   *  over water splashes (jump off the beach into the ocean, a Geppo fall into the sea, leaping off a ship,
   *  stepping down off a rail/wall, a future sky-island fall). "Elevation" here is the discrete state model
   *  (air layer / ledge / deck), so descents end in exactly TWO places — land() and the perch step-downs — and
   *  both call this. Dry landings stay silent (a dust ring read as a Geppo puff); wading IN never splashes
   *  (no descent). Cosmetic (FX event only). */
  private waterEntryFx(x: number, y: number, r: number): void {
    const water = this.collision.terrainAtPx(x, y).water;
    if (water === undefined) return; // dry landing — no puff
    // splash look (developer-tuned): wide, slow, THIN, translucent, and UNDER the body (it's the sea surface
    // rippling, not an aura on the unit) — bluer over the deep than the pale shallows
    events.emit('fx:ring', { x, y, radius: r * 2.2, color: water === 'deep' ? SPLASH_DEEP : SPLASH_SHALLOW, life: 0.5, width: 2, alpha: 0.55, under: true });
  }
}
