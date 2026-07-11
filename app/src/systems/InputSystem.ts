import Phaser from 'phaser';
import { isRanged, toggleAttackMode } from '../combat/equip';
import { BLOCK_MOVE_MULT, endGuard, tryGuard } from '../combat/guard';
import { AIM_MOVE_MULT } from '../config/constants';
import { trySprint } from '../combat/stamina';
import { attackMoveSpeed } from '../combat/attackMove';
import { FRIENDLY_FIRE_TAG } from '../combat/targeting';
import { events } from '../core/EventBus';
import { angleDiff, norm, smoothFactor } from '../core/math';
import type { World } from '../ecs/World';
import type { SpatialQuery } from '../world/SpatialQuery';
import type { AbilitySystem } from './AbilitySystem';
import type { DialogueSystem } from './DialogueSystem';
import type { GameDirector } from './GameDirector';
import type { InspectSystem } from './InspectSystem';
import type { InteractionSystem } from './InteractionSystem';
import type { ShipSystem } from './ShipSystem';

interface Keys {
  W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key;
  J: Phaser.Input.Keyboard.Key; K: Phaser.Input.Keyboard.Key; L: Phaser.Input.Keyboard.Key; U: Phaser.Input.Keyboard.Key; I: Phaser.Input.Keyboard.Key; R: Phaser.Input.Keyboard.Key;
  Q: Phaser.Input.Keyboard.Key; F: Phaser.Input.Keyboard.Key; E: Phaser.Input.Keyboard.Key; G: Phaser.Input.Keyboard.Key;
  C: Phaser.Input.Keyboard.Key; B: Phaser.Input.Keyboard.Key; T: Phaser.Input.Keyboard.Key; SHIFT: Phaser.Input.Keyboard.Key;
  ALT: Phaser.Input.Keyboard.Key; Y: Phaser.Input.Keyboard.Key; N: Phaser.Input.Keyboard.Key; SPACE: Phaser.Input.Keyboard.Key;
  ONE: Phaser.Input.Keyboard.Key; TWO: Phaser.Input.Keyboard.Key; THREE: Phaser.Input.Keyboard.Key; // ability slots — number row, in left-hand reach of WASD
  UP: Phaser.Input.Keyboard.Key; DOWN: Phaser.Input.Keyboard.Key; LEFT: Phaser.Input.Keyboard.Key; RIGHT: Phaser.Input.Keyboard.Key;
}

/** Mouselook sensitivity (rad of facing per px of mouse-X movement) while shift-locked. */
const MOUSELOOK_SENS = 0.0032;

/** Auto-aim turn rate (rad/s): a soft lock that tracks the target rather than snapping onto it. */
const AUTO_AIM_TRACK = 7;
/** Auto-aim acquisition radius (px) — input feel, so file-local rather than sim data. */
const AUTO_AIM_RANGE = 700;
/** RMB TAP threshold (s): releasing RMB within this = a TAP (the musket bash); holding past it engages AIM.
 *  Short enough that a hold-to-aim feels instant, long enough that a deliberate click always reads as the bash. */
const RMB_TAP_MAX = 0.18;

/**
 * Drives whichever entity holds the `control` tag. Movement sets `mover` intent; combat keys activate the
 * entity's loadout abilities through the AbilitySystem (so the four-layer build decides what each key does).
 */
type TapKey = 'E' | 'T' | 'Q' | 'C' | 'R' | 'G' | 'F' | 'ALT' | 'Y' | 'N' | 'SPACE';

export class InputSystem {
  private readonly keys: Keys;
  private autoAim = true; // on by default — toggle with T
  private announced = false;
  /** SHIFT LOCK (Alt): Roblox-style — cursor pins forward, mouse-X rotates facing (mouselook), WASD becomes
   *  facing-relative (W forward / A,D strafe / S back), and the camera rotates so you look up-screen. WorldScene
   *  reads `shiftLock` to rotate the view + counter-rotate world text. Public getter, toggled here (input-owned). */
  private shiftLock = false;
  private mouseDX = 0; // mouselook delta accumulated from pointermove events, consumed once per update()
  private rmbHeldT = 0; // how long RMB has been held (s) — a quick tap (< RMB_TAP_MAX) is the bash, a hold aims
  private rmbPrev = false; // RMB down last sim step — to detect the release edge (fire the bash on a quick tap)
  get shiftLocked(): boolean { return this.shiftLock; }
  /** Edge-taps latched per RENDER frame (sample()) and consumed by exactly one sim step (tap()) — under the
   *  fixed timestep a frame can run 0 sim steps, and Phaser clears JustDown on keyup, so polling JustDown
   *  inside the step could drop a fast tap entirely. */
  private readonly tapped = new Set<TapKey>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
    private readonly query: SpatialQuery,
    private readonly abilities: AbilitySystem,
    private readonly ships: ShipSystem,
    private readonly director: GameDirector,
    private readonly interactions: InteractionSystem,
    private readonly dialogue: DialogueSystem,
    private readonly inspect: InspectSystem,
  ) {
    this.keys = scene.input.keyboard!.addKeys(
      'W,A,S,D,J,K,L,U,I,Q,F,E,G,C,B,R,T,SHIFT,ALT,Y,N,SPACE,ONE,TWO,THREE,UP,DOWN,LEFT,RIGHT',
    ) as unknown as Keys;
    scene.input.mouse?.disableContextMenu();
    // MOUSELOOK: accumulate the raw pointer-lock delta from the actual pointermove EVENT — it fires only on
    // real movement, so lifting the mouse stops the turn. (Phaser's activePointer.movementX is a stale
    // "last known" value that persists with no new event → it kept spinning after a mouse lift.)
    scene.input.on('pointermove', (p: Phaser.Input.Pointer, _lx: number, _ly: number, ev: MouseEvent) => {
      if (this.shiftLock) this.mouseDX += ev?.movementX ?? p.movementX;
    });
  }

  private down(k: keyof Keys): boolean {
    return this.keys[k].isDown;
  }

  /** Enter/leave shift lock: request/release the browser pointer lock so the cursor pins to center and
   *  `ptr.movementX` carries mouselook deltas. Facing is already the unit's current aim, so entry is seamless. */
  private setShiftLock(on: boolean): void {
    this.shiftLock = on;
    if (on) this.scene.input.mouse?.requestPointerLock();
    else this.scene.input.mouse?.releasePointerLock();
    events.emit('notify', { msg: `Shift lock ${on ? 'ON' : 'OFF'}` });
  }

  /** Called once per RENDER frame (WorldScene), BEFORE the sim steps — latches edge-presses. (Mouselook is
   *  accumulated from the pointermove EVENT in the ctor, not polled here — a poll of the stale movementX kept
   *  spinning the view after a mouse lift.) */
  sample(): void {
    for (const k of ['E', 'T', 'Q', 'C', 'R', 'G', 'F', 'ALT', 'Y', 'N', 'SPACE'] as const) {
      if (Phaser.Input.Keyboard.JustDown(this.keys[k])) this.tapped.add(k);
    }
  }

  /** Consume a latched tap (fires in exactly ONE sim step). */
  private tap(k: TapKey): boolean {
    return this.tapped.delete(k);
  }

  update(dt: number): void {
    if (!this.announced) {
      this.announced = true; // surface the starting auto-aim state once the HUD is listening
      events.emit('autoAimChanged', { on: this.autoAim });
    }
    const e = this.world.first('control');
    if (!e || !e.avatar || !e.loadout) return;
    const t = e.transform!;
    const m = e.mover!;

    const ePressed = this.tap('E');
    if (this.director.state !== 'play') {
      if (ePressed && this.director.state === 'dead') this.director.respawn();
      m.vx = 0;
      m.vy = 0;
      return;
    }

    // a pending recruit choice: Y accepts / N declines (checked before the E/verb path so keys don't leak)
    if (this.dialogue.choosing) {
      if (this.tap('Y')) this.dialogue.choose(true);
      else if (this.tap('N')) this.dialogue.choose(false);
    }
    // E: advance an open dialogue first; on the HELM tile → TAKE/RELEASE the wheel (deliberate, so you never steer
    // by accidentally walking over it); otherwise resolve the best interaction verb (take/talk/…). Boarding is NOT
    // a verb — you walk across the gangplank (HullCollisionSystem does the handoff).
    else if (ePressed) {
      if (this.dialogue.advance()) {
        // dialogue consumed the press
      } else if (e.onDeck && this.ships.atHelm(e)) {
        e.onDeck.piloting = !e.onDeck.piloting; // take or release the wheel
        if (e.onDeck.piloting) this.ships.seatAtHelm(e); // grabbing the wheel stands you AT it, not beside it
        // taking the wheel WEIGHS ANCHOR; releasing drops it — the anchor follows the helm now that boarding is
        // walking (the old board/disembark verbs owned this flag before they were removed)
        const ship = this.world.byId(e.onDeck.shipId);
        if (ship?.ship) ship.ship.anchored = !e.onDeck.piloting;
        events.emit('notify', { msg: e.onDeck.piloting ? 'Took the wheel — WASD to steer, E to release.' : 'Released the wheel.' });
      } else {
        this.interactions.interact(e);
      }
    }
    // stepping OFF the helm tile releases the wheel automatically (you can't steer from across the deck)
    if (e.onDeck?.piloting && !this.ships.atHelm(e)) e.onDeck.piloting = false;

    // PILOTING: only while you've TAKEN THE WHEEL (E on the helm) does WASD steer the ship — hands on the wheel, no
    // walk/aim. Otherwise the FULL action path below runs the same on a deck as on land (aim/attack/abilities/jump/
    // guard): a deck is not a special mode (the Moat). Only LOCOMOTION differs by frame (movement-frames.md).
    if (e.onDeck?.piloting) {
      const fwd = (this.down('W') || this.down('UP') ? 1 : 0) - (this.down('S') || this.down('DOWN') ? 1 : 0);
      const turn = (this.down('D') || this.down('RIGHT') ? 1 : 0) - (this.down('A') || this.down('LEFT') ? 1 : 0);
      this.ships.pilot(e, fwd, turn, dt);
      m.vx = 0;
      m.vy = 0;
      return;
    }

    // (stamina regen + combo decay are ticked for ALL combatants in AbilitySystem.tick — not here)

    // auto-aim toggle (T): lock attacks onto the nearest hostile; otherwise follow the pointer
    if (this.tap('T')) {
      this.autoAim = !this.autoAim;
      events.emit('autoAimChanged', { on: this.autoAim });
      events.emit('notify', { msg: `Auto-aim ${this.autoAim ? 'ON' : 'OFF'}` });
    }
    // friendly-fire toggle (G): lets your strikes land on allies (a betrayal past their tolerance turns
    // them on you). A TAG so the harm gate reads it uniformly (the Moat) — not a control-only special case.
    if (this.tap('G') && e.tags) {
      const on = !e.tags.has(FRIENDLY_FIRE_TAG);
      if (on) e.tags.add(FRIENDLY_FIRE_TAG);
      else e.tags.remove(FRIENDLY_FIRE_TAG);
      events.emit('notify', { msg: `Friendly fire ${on ? 'ON' : 'OFF'}` });
    }
    // SHIFT LOCK toggle (Alt) — pointer-lock the cursor on, release on off (browser needs a user gesture; the
    // Alt press IS one). While locked, aiming is pure MOUSELOOK (mouse-X rotates facing), overriding auto-aim.
    if (this.tap('ALT')) this.setShiftLock(!this.shiftLock);
    const ptr = this.scene.input.activePointer;
    if (this.shiftLock) {
      t.angle += this.mouseDX * MOUSELOOK_SENS; // the FRAME's banked delta, applied ONCE (see sample())
      this.mouseDX = 0; // consumed — a still mouse now adds nothing (this was the drift bug)
    } else {
      let aimed = false;
      if (this.autoAim) {
        const foe = this.query.nearestHostile(e, AUTO_AIM_RANGE);
        if (foe?.transform) {
          // soft lock: rotate TOWARD the target, don't snap — a strafing enemy is hard to keep dead-on
          const target = Math.atan2(foe.transform.y - t.y, foe.transform.x - t.x);
          t.angle += angleDiff(target, t.angle) * smoothFactor(AUTO_AIM_TRACK, dt);
          aimed = true;
        }
      }
      if (!aimed) {
        const wp = this.scene.cameras.main.getWorldPoint(ptr.x, ptr.y);
        t.angle = Math.atan2(wp.y - t.y, wp.x - t.x);
      }
    }

    // guard (F): the TAP opens the parry window, the HOLD keeps blocking — one gesture, so a missed parry
    // falls back to block automatically. Raising it during your own windup FEINTS the swing (combat/guard).
    const c = e.combatant;
    if (this.tap('F')) tryGuard(e);
    if (c?.blocking && !this.down('F')) endGuard(e);

    // movement intent — hold SHIFT to sprint (drains the shared stamina pool for extra speed). ix/iy are the
    // raw WASD axes: world-relative normally, but FACING-relative under shift lock (W = forward toward your
    // aim, A/D = strafe, S = back) so you can circle-strafe a target you're locked onto.
    const ix = (this.down('D') || this.down('RIGHT') ? 1 : 0) - (this.down('A') || this.down('LEFT') ? 1 : 0);
    const iy = (this.down('S') || this.down('DOWN') ? 1 : 0) - (this.down('W') || this.down('UP') ? 1 : 0);
    const moving = ix !== 0 || iy !== 0;
    let speed = m.speed;
    if (c?.blocking) speed *= BLOCK_MOVE_MULT; // bracing is not a walk — and it forfeits the sprint
    else if (c?.aiming) speed *= AIM_MOVE_MULT; // ADS-walk: you can advance while aiming, at half pace (and no sprint)
    else if (this.down('SHIFT') && moving) speed = trySprint(e, speed, dt); // trySprint self-gates on the ability.sprint grant + stamina — the SAME rule the AI uses (the Moat)
    speed = attackMoveSpeed(e, speed); // rooted (or slowed) while a swing is in flight — the SAME rule the AI uses
    // The movement INTENT is a world-space velocity (nx·speed, ny·speed) — frame-NEUTRAL. InputSystem's job ENDS
    // here: it writes the intent to mover.vx/vy and nothing more. MovementSystem is the SINGLE place that RESOLVES
    // it in the actor's frame — world grid OR deck-local — beside jump/land/perch, all in one tick phase. (This
    // unification killed the deck-jump bugs: movement was split across InputSystem (deck) + MovementSystem (world +
    // land), so a deck jumper's state was always a tick out of sync.) A dodge impulse owns velocity (m.dvx/dvy).
    if (m.dodgeT <= 0) {
      if (moving) {
        let dx = ix;
        let dy = iy;
        if (this.shiftLock) {
          // rotate the input axes into the FACING frame: forward = t.angle, right = t.angle + 90°. −iy is
          // "forward" (W), +ix is "strafe right" (D). So the world vector is forward·(−iy) + right·(ix).
          const cos = Math.cos(t.angle);
          const sin = Math.sin(t.angle);
          dx = cos * -iy + -sin * ix; // right vector is (−sin, cos); forward is (cos, sin)
          dy = sin * -iy + cos * ix;
        }
        const [nx, ny] = norm(dx, dy);
        m.vx = nx * speed;
        m.vy = ny * speed;
      } else {
        m.vx = 0;
        m.vy = 0;
      }
    }

    // abilities (the loadout decides what each key does)
    if (this.tap('Q') && m.dodgeT <= 0) this.abilities.activate(e, e.loadout.dash);
    // SPACE — contextual vertical action:
    //   SWIMMING → toggle DIVE (submerge/surface); you can't jump/Geppo out of the sea, so space dives instead.
    //   otherwise → GEPPO (toggle-hover) once LEARNED, else the plain JUMP. activate() no-ops if ungranted/on cd.
    if (this.tap('SPACE')) {
      if (e.mover?.mode === 'swim') e.mover.submerged = !e.mover.submerged; // dive / surface toggle
      else this.abilities.activate(e, e.loadout.granted.has('ability.geppo') ? 'ability.geppo' : 'ability.jump');
    }

    const lmb = ptr.leftButtonDown() && !this.inspect.modifierHeld; // V+click = inspect pick, never a swing
    if ((lmb || this.down('J')) && m.dodgeT <= 0) this.abilities.activate(e, e.loadout.primary); // fire/light: LMB / J
    // RMB is TAP-vs-HOLD on a RANGED weapon: a quick TAP (released < RMB_TAP_MAX) fires the HEAVY — the musket's
    // butt-stroke BASH, the close-range shove for a rusher; HOLDING past that threshold engages the braced AIM
    // (ADS). So the tap can't flash the aim, and the hold can't accidentally bash. LMB fires the shot either way;
    // K fires the heavy directly (no ambiguity). For a MELEE weapon RMB is just the heavy attack (on press).
    const ranged = isRanged(e);
    const rmbDown = ptr.rightButtonDown();
    if (ranged) {
      if (rmbDown) this.rmbHeldT += dt;
      else if (this.rmbPrev && this.rmbHeldT < RMB_TAP_MAX && m.dodgeT <= 0) {
        this.abilities.activate(e, e.loadout.heavy); // RELEASE of a quick tap → the bash
      }
      if (!rmbDown) this.rmbHeldT = 0; // reset on release
      if (c) c.aiming = rmbDown && this.rmbHeldT >= RMB_TAP_MAX; // HELD past the tap window → aim
    } else {
      if (c) c.aiming = false;
      if (rmbDown && m.dodgeT <= 0) this.abilities.activate(e, e.loadout.heavy); // melee: RMB = the heavy attack
    }
    this.rmbPrev = rmbDown;
    if (this.down('K') && m.dodgeT <= 0) this.abilities.activate(e, e.loadout.heavy); // K: the heavy directly (either weapon)
    if (this.down('ONE') && e.loadout.slots[0]) this.abilities.activate(e, e.loadout.slots[0]); // special 1 (key 1)
    if (this.down('TWO') && e.loadout.slots[1]) this.abilities.activate(e, e.loadout.slots[1]); // special 2 (key 2)
    if (this.down('THREE') && e.loadout.slots[2]) this.abilities.activate(e, e.loadout.slots[2]); // special 3 (key 3)
    if (this.tap('C') && e.loadout.utility) this.abilities.activate(e, e.loadout.utility); // buff slot (Haki layer grants it later)
    if (this.tap('R')) toggleAttackMode(e); // swap stance: fist (Punch/Kick) ↔ fruit
  }

}
