import { GEPPO_FALL_DUR, GEPPO_HOVER_HEIGHT, GEPPO_KICK_INTERVAL, GEPPO_KICK_STAM, GEPPO_MOVE_MULT, JUMP_LAND_STUN, STUN_SLOW, TILE, Tile } from '../config/constants';
import { spendStamina } from '../combat/stamina';
import { events } from '../core/EventBus';
import type { Mover } from '../ecs/components';
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
  constructor(
    private readonly world: World,
    private readonly collision: Collision,
  ) {}

  update(dt: number): void {
    for (const e of this.world.with('transform', 'mover')) {
      const t = e.transform!;
      const m = e.mover!;
      // DEPENETRATION: if this body is STUCK inside solid (spawned in a wall, landed on a tree, shoved into stone),
      // snap it to the nearest clear spot BEFORE it tries to move. Runs for every foot/swim body each tick (a
      // cheap no-op when already clear); a jumper is airborne and passes over things, so skip it mid-air.
      if (m.mode !== 'boat' && m.layer !== 'air' && !e.onDeck) this.collision.unstick(t, t.r, m.mode); // on-deck actors are parented by ShipSystem (their pos is deck-local) — don't depenetrate against the ocean grid
      if (m.rollT) m.rollT = Math.max(0, m.rollT - dt); // roll-anim clock ticks down independently of the impulse decay
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
        if (m.fallT <= 0) {
          m.layer = 'ground'; // touched down — fire-once (fallT won't re-enter)
          if (e.combatant) e.combatant.stunT = Math.max(e.combatant.stunT ?? 0, JUMP_LAND_STUN); // punishable landing
        }
      } else if (m.layer === 'air' && !m.hovering) {
        // PLAIN JUMP (no hover, no fall): the one-shot hop's own airT arc lands it — see below. (Hover never lands
        // this way; it always routes through beginFall → the fall block above.)
        m.airT = Math.max(0, (m.airT ?? 0) - dt);
        if (m.airT <= 0) {
          m.layer = 'ground';
          if (e.combatant) e.combatant.stunT = Math.max(e.combatant.stunT ?? 0, JUMP_LAND_STUN);
        }
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
        // TERRAIN SPEED — slower over deep water (swim) / shallows (wade), from the ACTUAL tile under you (not the
        // mode; the mode is derived below and could lag a tick). Deep water swims, else the ground modifier.
        const overDeep = !airborne && this.collision.tileAtPx(t.x, t.y) === Tile.Water;
        const terrain = airborne ? 1 : overDeep ? this.collision.swimSpeed(t.x, t.y) : this.collision.terrainSpeed(t.x, t.y);
        vx *= terrain;
        vy *= terrain;
        if (m.hovering) { // GEPPO: skate through the air FASTER than a ground walk (docs/design/MOVEMENT_AIR.md)
          vx *= GEPPO_MOVE_MULT;
          vy *= GEPPO_MOVE_MULT;
        }
      }
      if (vx !== 0 || vy !== 0) this.collision.tryMove(t, vx * dt, vy * dt, t.r, m.mode, airborne);
      // SWIM/FOOT MODE = a LABEL derived from WHERE YOU NOW ARE (after the move), one truthful rule: SWIM iff the
      // tile under your center is deep Water, else FOOT. No predictive early-flip, no ahead/behind/corner
      // heuristics — the mode simply follows your position, so speed/opacity/pose/drain (all read it) can never
      // disagree with the terrain. Collision is mode-agnostic (foot & swim share one walkable), so entering/exiting
      // never walls you; the mode just relabels as you cross. This ONE rule replaced the whole seam-bug family.
      // NOT while ON DECK: an on-deck actor rides the BOAT's deck (parented by ShipSystem), so its mode/position
      // follow the ship — the terrain under it (open sea) must NOT relabel it a swimmer (it'd drain breath + show
      // the swim pose while safely aboard). Boarding sets things up; here we just leave an on-deck actor's mode alone.
      if (!airborne && !e.onDeck && (m.mode === 'foot' || m.mode === 'swim')) {
        m.mode = this.collision.tileAtPx(t.x, t.y) === Tile.Water ? 'swim' : 'foot';
      }
    }
  }
}
