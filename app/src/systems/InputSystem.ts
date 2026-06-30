import Phaser from 'phaser';
import { equip } from '../combat/equip';
import { events } from '../core/EventBus';
import { norm } from '../core/math';
import type { Entity } from '../ecs/components';
import type { World } from '../ecs/World';
import type { SpatialQuery } from '../world/SpatialQuery';
import type { AbilitySystem } from './AbilitySystem';
import type { GameDirector } from './GameDirector';
import type { ShipSystem } from './ShipSystem';

interface Keys {
  W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key;
  J: Phaser.Input.Keyboard.Key; K: Phaser.Input.Keyboard.Key; L: Phaser.Input.Keyboard.Key;
  Q: Phaser.Input.Keyboard.Key; F: Phaser.Input.Keyboard.Key; E: Phaser.Input.Keyboard.Key; G: Phaser.Input.Keyboard.Key;
  C: Phaser.Input.Keyboard.Key; B: Phaser.Input.Keyboard.Key; T: Phaser.Input.Keyboard.Key; SHIFT: Phaser.Input.Keyboard.Key;
  UP: Phaser.Input.Keyboard.Key; DOWN: Phaser.Input.Keyboard.Key; LEFT: Phaser.Input.Keyboard.Key; RIGHT: Phaser.Input.Keyboard.Key;
}

/** Sprint: hold SHIFT for a speed boost that drains the shared stamina pool. */
const SPRINT_MULT = 1.5;
const SPRINT_DRAIN = 24; // stamina/sec while sprinting

/**
 * Drives whichever entity holds the `control` tag. Movement sets `mover` intent; combat keys activate the
 * entity's loadout abilities through the AbilitySystem (so the four-layer build decides what each key does).
 */
export class InputSystem {
  private readonly keys: Keys;
  private autoAim = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
    private readonly query: SpatialQuery,
    private readonly abilities: AbilitySystem,
    private readonly ships: ShipSystem,
    private readonly director: GameDirector,
  ) {
    this.keys = scene.input.keyboard!.addKeys(
      'W,A,S,D,J,K,L,Q,F,E,G,C,B,T,SHIFT,UP,DOWN,LEFT,RIGHT',
    ) as unknown as Keys;
    scene.input.mouse?.disableContextMenu();
  }

  private down(k: keyof Keys): boolean {
    return this.keys[k].isDown;
  }

  update(dt: number): void {
    const e = this.world.first('control');
    if (!e || !e.avatar || !e.loadout) return;
    const av = e.avatar;
    const t = e.transform!;
    const m = e.mover!;

    const ePressed = Phaser.Input.Keyboard.JustDown(this.keys.E);
    if (this.director.state !== 'play') {
      if (ePressed && this.director.state === 'dead') this.director.respawn();
      else if (ePressed && this.director.state === 'win') this.director.setState('play');
      m.vx = 0;
      m.vy = 0;
      return;
    }

    // interact: ship board/disembark, else pick up a nearby item
    if (ePressed && !this.ships.interact(e)) this.tryPickup(e);

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
    if (Phaser.Input.Keyboard.JustDown(this.keys.T)) {
      this.autoAim = !this.autoAim;
      events.emit('autoAimChanged', { on: this.autoAim });
      events.emit('notify', { msg: `Auto-aim ${this.autoAim ? 'ON' : 'OFF'}` });
    }
    const ptr = this.scene.input.activePointer;
    let aimed = false;
    if (this.autoAim) {
      const foe = this.query.nearestHostile(t.x, t.y, 700, e.faction!.id);
      if (foe?.transform) {
        t.angle = Math.atan2(foe.transform.y - t.y, foe.transform.x - t.x);
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
    const c = e.combatant;
    let speed = m.speed;
    if (this.down('SHIFT') && moving && c && c.stam > 1) {
      speed *= SPRINT_MULT;
      c.stam = Math.max(0, c.stam - SPRINT_DRAIN * dt);
    }
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
    if (Phaser.Input.Keyboard.JustDown(this.keys.Q) && m.dodgeT <= 0) this.abilities.activate(e, e.loadout.dash);
    if ((ptr.leftButtonDown() || this.down('J')) && m.dodgeT <= 0) this.abilities.activate(e, e.loadout.primary);
    if (this.down('K') && e.loadout.slots[0]) this.abilities.activate(e, e.loadout.slots[0]);
    if ((ptr.rightButtonDown() || this.down('L')) && e.loadout.slots[1]) this.abilities.activate(e, e.loadout.slots[1]);
    if (Phaser.Input.Keyboard.JustDown(this.keys.C)) this.abilities.activate(e, 'ability.armament');

    // DEBUG: G = eat the Gomu fruit (until a fruit pickup is placed in the world)
    if (Phaser.Input.Keyboard.JustDown(this.keys.G) && !e.equipment?.fruit) {
      equip(e, 'fruit', 'fruit.gomu');
      av.hasFruit = true;
      events.emit('notify', { msg: 'You ate the Gomu Gomu no Mi! Pistol/Gatling/Rocket unlocked.' });
    }
  }

  private tryPickup(e: Entity): void {
    const t = e.transform!;
    let best: Entity | undefined;
    let bd = 42 * 42;
    for (const it of this.world.with('pickup', 'transform')) {
      const d = (t.x - it.transform!.x) ** 2 + (t.y - it.transform!.y) ** 2;
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    if (!best) return;
    const pk = best.pickup!;
    if (pk.kind === 'weapon') {
      equip(e, 'weapon', pk.defId);
      events.emit('notify', { msg: `Equipped ${pk.label}.` });
    } else {
      equip(e, 'fruit', pk.defId);
      if (e.avatar) e.avatar.hasFruit = true;
      events.emit('notify', { msg: `Ate the ${pk.label}!` });
    }
    best.render?.gfx.destroy();
    this.world.destroy(best);
  }
}
