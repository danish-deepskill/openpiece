import type { GameState } from '../config/constants';

/**
 * Typed cross-system event contract. Discrete one-off signals go here; continuous
 * per-frame state goes through the Phaser registry instead (see WorldScene).
 */
export interface GameEvents {
  startGame: {};
  setPaused: { paused: boolean };
  stateChanged: { state: GameState };
  notify: { msg: string };
  objectiveChanged: { text: string };
  enemyKilled: { gold: number; boss: boolean };
  crewRecruited: { name: string; count: number };
  crewFell: { name: string };
  dialogueOpen: { name: string; lines: string[] };
  dialogueAdvance: {};
  dialogueClose: {};
  cameraShake: { amount: number };
  fruitEaten: {};
  playerDied: {};
  gameWon: {};
  autoAimChanged: { on: boolean };
}

type EventKey = keyof GameEvents;
type Listener<K extends EventKey> = (data: GameEvents[K]) => void;

class EventBus {
  private listeners: { [K in EventKey]?: Array<Listener<K>> } = {};

  on<K extends EventKey>(event: K, fn: Listener<K>): () => void {
    (this.listeners[event] ??= []).push(fn);
    return () => this.off(event, fn);
  }

  off<K extends EventKey>(event: K, fn: Listener<K>): void {
    const arr = this.listeners[event];
    if (arr) this.listeners[event] = arr.filter((f) => f !== fn) as typeof arr;
  }

  emit<K extends EventKey>(event: K, data: GameEvents[K]): void {
    const arr = this.listeners[event];
    if (!arr) return;
    for (const fn of arr.slice()) fn(data);
  }

  clear(): void {
    this.listeners = {};
  }
}

/** Singleton bus shared across systems and scenes. */
export const events = new EventBus();
