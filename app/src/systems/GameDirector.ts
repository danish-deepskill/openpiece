import type { GameState } from '../config/constants';
import { events } from '../core/EventBus';
import { factions, type FactionId } from '../defs/factions';
import type { Avatar, Entity } from '../ecs/components';
import type { World } from '../ecs/World';
import type { LevelLayout } from '../world/WorldGen';
import type { FxSystem } from './FxSystem';

function defaultAvatar(): Avatar {
  return { hasFruit: false };
}

/** Game state, objectives, death/win, and the possession hook. Win = no hostiles to the controlled faction remain. */
export class GameDirector {
  state: GameState = 'start';
  gold = 0;
  objective = 'Reach the eastern isle and defeat the captain';
  private everHadEnemies = false;

  constructor(
    private readonly world: World,
    private readonly fx: FxSystem,
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
    this.state = s;
    events.emit('stateChanged', { state: s });
  }

  setObjective(o: string): void {
    this.objective = o;
    events.emit('objectiveChanged', { text: o });
  }

  controlled(): Entity | undefined {
    return this.world.first('control');
  }

  controlledFaction(): FactionId {
    return this.controlled()?.faction?.id ?? 'straw_hat';
  }

  enemiesAlive(): number {
    const pf = this.controlledFaction();
    let n = 0;
    for (const e of this.world.entities) {
      if (e.health && !e.health.dead && e.faction && factions.isHostile(pf, e.faction.id)) n++;
    }
    return n;
  }

  update(dt: number): void {
    if (this.state !== 'play') return;
    this.tickTimers(dt);
    this.cleanupDead();
    this.checkWin();
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
    this.fx.corpse(t.x, t.y, t.r, boss ? 0x7a1f1f : 0x5a3a2a);
    this.fx.burst(t.x, t.y, 0xc0303a, 14, 200);
    if (e.loot) {
      this.gold += e.loot.gold;
      this.fx.dmgText(t.x, t.y, e.loot.gold, '#f0b429');
      events.emit('enemyKilled', { gold: e.loot.gold, boss });
    }
    if (e.crew) events.emit('crewFell', { name: e.crew.name });
    e.render?.gfx.destroy();
    this.world.destroy(e);
  }

  private die(): void {
    this.fx.shake(8);
    this.setState('dead');
    events.emit('playerDied', {});
  }

  respawn(): void {
    const e = this.controlled();
    if (!e) return;
    e.health!.hp = e.health!.maxhp;
    e.health!.dead = false;
    e.health!.iframes = 0;
    if (e.combatant) e.combatant.stam = e.combatant.maxStam;
    e.transform!.x = this.level.playerSpawn.x;
    e.transform!.y = this.level.playerSpawn.y;
    e.mover!.dodgeT = 0;
    this.setState('play');
    events.emit('notify', { msg: 'You wash ashore at home, alive.' });
  }

  private checkWin(): void {
    const n = this.enemiesAlive();
    if (n > 0) this.everHadEnemies = true;
    if (n === 0 && this.everHadEnemies && this.state === 'play') {
      this.setState('win');
      events.emit('gameWon', {});
    }
  }

  /** The Moat: hand human control to any entity (it gains an avatar if it lacked one). */
  possess(target: Entity): void {
    if (!target.transform) return;
    const cur = this.world.first('control');
    if (cur === target) return;
    if (cur) delete cur.control;
    target.control = {};
    if (!target.avatar) target.avatar = defaultAvatar();
    if (!target.combatant) target.combatant = { stam: 100, maxStam: 100, combo: 0, comboT: 0 };
    events.emit('notify', { msg: 'You take control of a new body.' });
  }
}
