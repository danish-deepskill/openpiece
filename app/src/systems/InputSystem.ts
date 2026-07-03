import Phaser from 'phaser';
import { toggleAttackMode } from '../combat/equip';
import { trySprint } from '../combat/stamina';
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
  UP: Phaser.Input.Keyboard.Key; DOWN: Phaser.Input.Keyboard.Key; LEFT: Phaser.Input.Keyboard.Key; RIGHT: Phaser.Input.Keyboard.Key;
}

/** Auto-aim turn rate (rad/s): a soft lock that tracks the target rather than snapping onto it. */
const AUTO_AIM_TRACK = 7;
/** Auto-aim acquisition radius (px) — input feel, so file-local rather than sim data. */
const AUTO_AIM_RANGE = 700;

/**
 * Drives whichever entity holds the `control` tag. Movement sets `mover` intent; combat keys activate the
 * entity's loadout abilities through the AbilitySystem (so the four-layer build decides what each key does).
 */
type TapKey = 'E' | 'T' | 'Q' | 'C' | 'R' | 'G';

export class InputSystem {
  private readonly keys: Keys;
  private autoAim = true; // on by default — toggle with T
  private announced = false;
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
      'W,A,S,D,J,K,L,U,I,Q,F,E,G,C,B,R,T,SHIFT,UP,DOWN,LEFT,RIGHT',
    ) as unknown as Keys;
    scene.input.mouse?.disableContextMenu();
  }

  private down(k: keyof Keys): boolean {
    return this.keys[k].isDown;
  }

  /** Called once per RENDER frame (WorldScene), BEFORE the sim steps — latches edge-presses. */
  sample(): void {
    for (const k of ['E', 'T', 'Q', 'C', 'R', 'G'] as const) {
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
      else if (ePressed && this.director.state === 'win') this.director.setState('play');
      m.vx = 0;
      m.vy = 0;
      return;
    }

    // E: advance an open dialogue first; otherwise resolve the best interaction verb (board/disembark/take/talk/…)
    if (ePressed) {
      if (!this.dialogue.advance()) this.interactions.interact(e);
    }

    // piloting a ship — route movement to the helm, skip foot controls
    if (e.riding) {
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
    const ptr = this.scene.input.activePointer;
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

    // movement intent — hold SHIFT to sprint (drains the shared stamina pool for extra speed)
    const ix = (this.down('D') || this.down('RIGHT') ? 1 : 0) - (this.down('A') || this.down('LEFT') ? 1 : 0);
    const iy = (this.down('S') || this.down('DOWN') ? 1 : 0) - (this.down('W') || this.down('UP') ? 1 : 0);
    const moving = ix !== 0 || iy !== 0;
    let speed = m.speed;
    if (this.down('SHIFT') && moving) speed = trySprint(e, speed, dt); // the SAME sprint rule the AI uses (the Moat)
    if (m.dodgeT > 0) {
      // velocity from the dash impulse (MovementSystem)
    } else if (moving) {
      const [nx, ny] = norm(ix, iy);
      m.vx = nx * speed;
      m.vy = ny * speed;
    } else {
      m.vx = 0;
      m.vy = 0;
    }

    // abilities (the loadout decides what each key does)
    if (this.tap('Q') && m.dodgeT <= 0) this.abilities.activate(e, e.loadout.dash);
    const lmb = ptr.leftButtonDown() && !this.inspect.modifierHeld; // V+click = inspect pick, never a swing
    if ((lmb || this.down('J')) && m.dodgeT <= 0) this.abilities.activate(e, e.loadout.primary); // light: LMB / J
    if ((ptr.rightButtonDown() || this.down('K')) && m.dodgeT <= 0) this.abilities.activate(e, e.loadout.heavy); // heavy: RMB / K
    if (this.down('U') && e.loadout.slots[0]) this.abilities.activate(e, e.loadout.slots[0]); // special 1
    if (this.down('I') && e.loadout.slots[1]) this.abilities.activate(e, e.loadout.slots[1]); // special 2
    if (this.tap('C') && e.loadout.utility) this.abilities.activate(e, e.loadout.utility); // buff slot (Haki layer grants it later)
    if (this.tap('R')) toggleAttackMode(e); // swap stance: fist (Punch/Kick) ↔ fruit
  }

}
