/**
 * Typed cross-system event contract. Discrete one-off signals go here; continuous
 * per-frame state goes through the Phaser registry instead (see WorldScene).
 * RULE: every key has ≥1 emitter and ≥1 listener — dead keys are deleted, not kept "for later".
 */
/** The pistol-shot / swing-arc visual the sim asks presentation to draw (payload of 'fx:swing'). */
export interface SwingFx {
  type: 'melee' | 'pistol' | 'thrust';
  x: number;
  y: number;
  angle: number;
  len: number;
  life: number;
  max: number;
  arc?: number; // half-angle of the melee swing visual (matches the ability's hit cone)
  enemy?: boolean;
  thin?: boolean;
}

export interface GameEvents {
  startGame: {};
  setPaused: { paused: boolean };
  notify: { msg: string };
  // director hooks — consumed by HUD today; the event director/persistence will subscribe later
  enemyKilled: { gold: number; boss: boolean };
  playerDied: {};
  gameWon: {};
  autoAimChanged: { on: boolean };
  // fx channel -- the SIM emits these; FxSystem (presentation) subscribes. Sim never calls presentation
  // directly (DESIGN_PATTERNS section 5); this stream is also the future audio hook + net-replication feed.
  'fx:burst': { x: number; y: number; color: number; n: number; speed: number };
  'fx:dmgText': { x: number; y: number; value: number; color: string };
  'fx:swing': SwingFx;
  'fx:corpse': { x: number; y: number; r: number; color: number };
  'fx:shake': { amount: number };
}

type EventKey = keyof GameEvents;
type Listener<K extends EventKey> = (data: GameEvents[K]) => void;

class EventBus {
  private listeners: { [K in EventKey]?: Array<Listener<K>> } = {};

  on<K extends EventKey>(event: K, fn: Listener<K>): () => void {
    // cast: TS can't correlate the mapped-type slot with K here (microsoft/TypeScript#30581)
    const arr = (this.listeners[event] ??= []) as Array<Listener<K>>;
    arr.push(fn);
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
