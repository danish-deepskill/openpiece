import { FX_COLOR, type GameState } from '../config/constants';
import { events } from '../core/EventBus';
import { DEFAULT_PLAYER_FACTION, type FactionId } from '../defs/factions';
import type { Avatar, Entity } from '../ecs/components';
import { defaultCombatant } from '../ecs/Spawner';
import type { World } from '../ecs/World';
import type { LevelLayout } from '../world/WorldGen';

function defaultAvatar(): Avatar {
  return {};
}

/** Game state, death/respawn, and the possession hook. (No win condition — the sea is open-ended, not a level
 *  you "clear"; the objective/enemies-left/Victory UI were removed for that open-world feel.) */
export class GameDirector {
  state: GameState = 'start';
  gold = 0;

  constructor(
    private readonly world: World,
    private readonly level: LevelLayout,
  ) {
    events.on('startGame', () => {
      if (this.state === 'start') this.setState('play');
    });
    events.on('setPaused', ({ paused }) => {
      if (this.state === 'play' || this.state === 'paused') this.setState(paused ? 'paused' : 'play');
    });
  }

  setState(s: GameState): void {
    this.state = s; // continuous state — the HUD reads it via RegKey.State each frame (no event needed)
  }

  controlled(): Entity | undefined {
    return this.world.first('control');
  }

  controlledFaction(): FactionId {
    return this.controlled()?.faction?.id ?? DEFAULT_PLAYER_FACTION;
  }

  update(dt: number): void {
    if (this.state !== 'play') return;
    this.tickTimers(dt);
    this.cleanupDead();
  }

  private tickTimers(dt: number): void {
    for (const e of this.world.with('health')) {
      const h = e.health!;
      h.hitFlash = Math.max(0, h.hitFlash - dt);
      h.iframes = Math.max(0, h.iframes - dt);
    }
  }

  private cleanupDead(): void {
    for (const e of [...this.world.entities]) {
      const h = e.health;
      if (!h || !h.dead) continue;
      if (e.control) {
        // the controlled body falls — don't remove it, allow respawn
        this.die();
        h.dead = false;
        continue;
      }
      this.onDeath(e);
    }
  }

  private onDeath(e: Entity): void {
    const t = e.transform!;
    const boss = !!e.ai?.bb?.boss;
    events.emit('fx:corpse', { x: t.x, y: t.y, r: t.r, color: boss ? 0x7a1f1f : 0x5a3a2a });
    events.emit('fx:burst', { x: t.x, y: t.y, color: FX_COLOR.blood, n: 14, speed: 200 });
    if (e.loot) {
      this.gold += e.loot.gold;
      events.emit('fx:dmgText', { x: t.x, y: t.y, value: e.loot.gold, color: '#f0b429' });
      events.emit('enemyKilled', { gold: e.loot.gold, boss });
    }
    this.world.destroy(e); // RenderSystem's orphan sweep destroys the gfx -- sim never touches presentation objects
  }

  private die(): void {
    events.emit('fx:shake', { amount: 8 });
    this.setState('dead');
    events.emit('playerDied', {});
  }

  respawn(): void {
    const e = this.controlled();
    if (!e) return;
    e.health!.hp = e.health!.maxHp;
    e.health!.dead = false;
    e.health!.iframes = 0;
    if (e.combatant) e.combatant.stam = e.combatant.maxStam;
    e.transform!.x = this.level.playerSpawn.x;
    e.transform!.y = this.level.playerSpawn.y;
    e.mover!.dodgeT = 0;
    this.setState('play');
    events.emit('notify', { msg: 'You wash ashore at home, alive.' });
  }


  /** The Moat: hand human control to any entity (it gains an avatar if it lacked one). */
  possess(target: Entity): void {
    if (!target.transform) return;
    const cur = this.world.first('control');
    if (cur === target) return;
    if (cur) delete (cur as Entity).control; // detach: presence-as-state (widen past the query narrowing)
    target.control = {};
    if (!target.avatar) target.avatar = defaultAvatar();
    if (!target.combatant) target.combatant = defaultCombatant(); // same pool as every spawn (no drifting literals)
    if (!target.effects) target.effects = { active: [], seq: 0 }; // effects must work on ANY possessed body (i-frames…)
    events.emit('notify', { msg: 'You take control of a new body.' });
  }
}
