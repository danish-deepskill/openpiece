import type { ContentId } from './Registry';
import type { GapRule } from '../combat/dominance';
import type { FxTheme } from '../combat/fxTheme';
/**
 * Typed cross-system event contract. Discrete one-off signals go here; continuous
 * per-frame state goes through the Phaser registry instead (see WorldScene).
 * RULE: every key has ≥1 emitter and ≥1 listener — dead keys are deleted, not kept "for later".
 */
/** What a tiered hit came to, for the clash readout. */
export type ClashOutcome = 'landed' | 'refused' | 'parried' | 'blocked' | 'guardBreak' | 'rebound' | 'bind' | 'overpower'; // bind/overpower: steel met steel (combat/clash)

/** The pistol-shot / swing-arc visual the sim asks presentation to draw (payload of 'fx:swing'). */
export interface SwingFx {
  /** 'trail' = the LINE a dash-through cut ran (x,y = where the step began, angle + len = the path): a thick fading slash
   *  along the ground, drawn the tick the trail volume fires (MeleeSystem) — a fixed world line, never a follower. */
  type: 'melee' | 'pistol' | 'thrust' | 'trail';
  x: number;
  y: number;
  angle: number;
  len: number;
  life: number;
  max: number;
  arc?: number; // half-angle of the melee swing visual (matches the ability's hit cone)
  enemy?: boolean;
  thin?: boolean;
  /** A FLURRY trail: the crescent whips across the arc this many times over its life (default 1 — one sweep). */
  cuts?: number;
  /** Sweep the OTHER way: a melee crescent runs +arc → −arc by default; `mirror` runs −arc → +arc (the off blade of a
   *  scissor closes from its own side — two mirrored crescents meet in the middle). */
  mirror?: boolean;
  /** Seconds the SWEEP itself takes (the crescent crossing its arc); the rest of `max` is the tail, fading IN PLACE at the
   *  arc's end. Unset ⇒ the sweep spans the whole life — which drags a long-tailed crescent across its arc at a crawl. */
  sweep?: number;
  /** A HEAVY crescent (the great cut): a thick body stroke with a bright rim and a soft glow, holding its opacity longer —
   *  reads as a blow that moves air, where the default thin swoosh reads as a flick. Themed or steel alike. */
  heavy?: boolean;
  /** Seconds to WAIT before the visual starts (and before `life` ticks) — a wave timed to a flurry's last cut. */
  delay?: number;
  /** The SWINGER's entity id: the visual FOLLOWS that body's drawn pose (a knocked-back or Footwork-shuffling
   *  swinger carries its crescents with it), and a visual still WAITING on its cue dies with the swing (a cancelled
   *  channel shows no ghost waves). Unset ⇒ a fixed world point (the instant pistol line). */
  follow?: number;
  /** With `follow`: the swing this visual belongs to — a different swing on the same body ends it. */
  ability?: ContentId;
  /** The swinger's FX theme at the swing (combat/fxTheme — a coated body's cuts are haki). Unset ⇒ steel. */
  theme?: FxTheme;
}

export interface GameEvents {
  startGame: {};
  setPaused: { paused: boolean };
  notify: { msg: string };
  // (enemyKilled/playerDied DELETED by the 2026-07 foundation audit: emitted with zero listeners — the
  // house rule is dead keys go, and return WITH their first real subscriber (event director/persistence).
  // Gold + death already flow through director state / RegKey; nothing consumed these.)
  autoAimChanged: { on: boolean };
  // fx channel -- the SIM emits these; FxSystem (presentation) subscribes. Sim never calls presentation
  // directly (DESIGN_PATTERNS section 5); this stream is also the future audio hook + net-replication feed.
  'fx:burst': { x: number; y: number; color: number; n: number; speed: number; /** a themed body's spark (the palette's edge replaces `color`) */ theme?: FxTheme };
  'fx:dmgText': { x: number; y: number; value: number; color: string };
  'fx:swing': SwingFx;
  'fx:corpse': { x: number; y: number; r: number; color: number };
  'fx:shake': { amount: number };
  /** An expanding SHOCKWAVE ring — a slam/impact (Gomu Ono's stomp) or a water-entry splash. Grows from ~0 to
   *  `radius` and fades over `life` seconds. `width` = starting stroke thickness (px, default 4 — the slam look);
   *  `alpha` = peak opacity (default 1); `under` = draw on the GROUND plane beneath units (a splash sits ON the
   *  water surface under the body; a slam shockwave stays above). Presentation-only (any AoE damage is separate). */
  'fx:ring': { x: number; y: number; radius: number; color: number; life: number; width?: number; alpha?: number; under?: boolean };
  /** An AI just SPOTTED a target and is about to give chase — the "!" double-take marker over its head. The sim
   *  (brain's alert state) emits it at the unit's position; FxSystem draws a rising "!" there for `dur` seconds.
   *  (The unit HOLDS STILL during the alert beat, so a fixed-position marker tracks it fine — no world lookup.) */
  'fx:spotted': { x: number; y: number; dur: number };
  /** DEBUG only: an instantaneous AoE fired (Gomu Rocket landing slam) — the overlay draws its radius briefly
   *  so you can SEE where it hit (the AoE is a one-frame radial check, invisible otherwise). */
  'debug:aoe': { x: number; y: number; radius: number };
  /** One per tiered hit (StrikeResolver): the dominance rung that judged it + what came of it — the debug overlay's
   *  rung readout (`combat.rung`). `gap` = attacker − defender in bands (positive = hitting down). */
  'combat:clash': { x: number; y: number; gap: number; rule: GapRule; outcome: ClashOutcome };
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
