import type { Brain } from '../ai/Brain';
import type { AccessorySlot } from '../defs/accessories';
import type { FactionId } from '../defs/factions';
import type { StatBlock } from '../combat/StatBlock';
import type { TagSet } from '../combat/TagSet';
import type { ContentId } from '../core/Registry';
import type { AIProfileDef } from '../defs/aiProfiles';
import type { Waypoint } from '../world/Pathfinder';

export type MoveMode = 'foot' | 'boat';

export interface Transform {
  x: number;
  y: number;
  angle: number;
  r: number; // collision radius
}

export interface Mover {
  vx: number;
  vy: number;
  speed: number;
  mass: number; // body weight — governs how much it yields when two bodies are pushed apart
  mode: MoveMode;
  // dodge / dash impulse
  dodgeT: number;
  dvx: number;
  dvy: number;
}

export interface Health {
  hp: number;
  maxHp: number;
  dead: boolean;
  hitFlash: number;
  iframes: number;
}

/** Allegiance. Hostility is resolved via the faction relations matrix, never team checks. */
export interface Faction {
  id: FactionId;
}

/** An AI's per-entity scratch memory — every field the brains read/write, typed (no more `bb.x as number`).
 *  Set at spawn: state/profile/home/canSprint. The rest are runtime state the FSM manages. */
export interface Blackboard {
  state: string; // current FSM state key
  profile: AIProfileDef; // this unit's AI tuning (data)
  home: { x: number; y: number }; // spawn/post position
  canSprint: boolean;
  boss?: boolean;
  // pursuit & perception
  quarry?: Entity; // who we're chasing (persists past line-of-sight)
  focus?: Entity; // squad-assigned focus-fire target
  lastSeenX: number;
  lastSeenY: number;
  lostT: number; // time since we last saw the target
  alertT?: number; // "I was hit" investigate/flee timer
  perceivedX?: number; // perceived (reaction-lagged) target position — where it THINKS the target is
  perceivedY?: number;
  // wander / roam
  wanderT: number; // countdown to the next roam point
  roamX?: number;
  roamY?: number;
  // pathfinding (managed by routeTo)
  path?: Waypoint[] | null;
  pathIdx?: number;
  repathT?: number;
  // movement flourishes
  weaveT?: number; // serpentine/sway phase
  chargeT?: number; // sprint-charge remaining
  chargeCd?: number; // sprint-charge cooldown
  // squad coordination
  attackOk?: boolean; // holds an attack token
  broken?: boolean; // squad morale broke → flee
  lane?: number; // approach lane (-1..1)
}

export interface AI {
  brain: Brain;
  bb: Blackboard;
}

/** PURE DATA — no Graphics object, no function pointer (serializable + headless-safe; DESIGN_PATTERNS §9).
 *  `draw` is a string key into the presentation draw registry; RenderSystem owns the actual Graphics. */
export interface Render {
  draw: string; // draw-registry key: a BodyKey ('hero', 'cow', ...), 'pickup', or 'ship'
  baseColor: number;
  hatColor?: number;
  bob: number;
  showHpBar?: boolean;
  /** Rotate the Graphics to transform.angle (ships); actors draw facing via their hat instead. */
  rotateToAngle?: boolean;
  /** Added to depth (= y) for tie-breaking, e.g. a ship sits just under its riders. */
  depthBias?: number;
}

/** Sim-side identity facts — a server needs the NAME and TIER (dialogue, logs, HUD), pixels don't. */
export interface Identity {
  name: string; // unit name (e.g. 'Brute', 'You')
  tier?: string; // power tier band (e.g. 'F+', 'E-')
}

/**
 * An in-progress melee strike — the INSTANCE. It carries only per-swing runtime STATE; the strike TYPE (its
 * motion archetype + params: reach, arc, jabs, stretch length, …) is DATA on `AbilityDef.shape`, looked up via
 * `ability`. So 1000 strike types are 1000 data rows, not 1000 fields here. The moving fist/blade/limb IS the
 * hitbox: MeleeSystem lands a hit on contact (each target once per swing, or per jab in a flurry) and drawActor
 * reads the SAME pose to animate it — what you see is what hits. Replaced on a new attack; cleared when it ends.
 */
export interface MeleeSwing {
  ability: ContentId;
  t: number; // elapsed seconds (0 → dur)
  dur: number;
  motion: string; // resolved motion archetype ('stab' | 'arc' | 'stretch' | …) — keys combat/swing.ts MOTIONS
  side: number; // acting limb: -1 left, +1 right
  angle: number; // aim direction, locked at swing start
  hit: number[]; // entity ids already struck this swing (reset per jab for a flurry)
  lastJab?: number; // flurry: last jab index resolved, so the per-jab hit set resets on a new jab
  launched?: boolean; // grab-launch (Gomu Rocket): the body-impulse has fired (latches to fire once)
  landed?: boolean; // grab-launch: the landing AoE has fired (latches to fire once, when the leap stops)
}

/** A ship hull instance (composite entity: hull stats from ShipHullDef + parts/cannons later). */
export interface Ship {
  hull: ContentId;
  mode: 'exploration' | 'battle';
  anchored: boolean;
  speed: number; // current forward speed along heading
}

/** Marks an entity riding/piloting a ship (its world position is pinned to the ship). */
export interface Riding {
  ship: Entity;
}

/**
 * Per-fight combat resources EVERY combatant shares (hero and enemy alike) — this is the Moat: stamina
 * and combo are not player-only. Stamina fuels attacks/dash/sprint; combo ramps damage on consecutive
 * hits. `maxStam` is seeded from the `maxStam` attribute at spawn (current value lives here, like Health).
 */
export interface Combatant {
  stam: number;
  maxStam: number;
  combo: number;
  comboT: number;
  kickSide?: number; // last kicking foot (±1); alternated each kick so left/right kicks mirror
  regenT?: number; // stamina-regen delay remaining (s): set on every spend, ticks down; regen only at 0
  stunT?: number; // hitstun remaining (s): while > 0 the unit can't attack and moves slowed (a stagger)
}

/**
 * Player-control flavor that isn't part of the shared combat resource. Possessing a body grants this.
 * (Shared resources moved to `Combatant`; what makes an entity "the player" is only the `control` tag.)
 * Currently an empty marker — real player-only flavor (map notes, dex progress…) slots in later.
 */
export type Avatar = Record<string, never>;

/** Tag marking the entity currently driven by human input. Move it to possess another. */
export type Control = Record<string, never>;

/** A unit whose def carries dialogue is conversable (the `talk` verb). Recruitment lands with the crew system. */
export interface Npc {
  dialogue: string[];
}

export interface Loot {
  gold: number;
}

/** Group membership for coordinated AI (focus-fire, attack budget, morale). */
export interface Squad {
  id: number;
  name: string;
}

/** A pickup-able item lying in the world (walk up + E to take it). */
export interface Pickup {
  kind: 'weapon' | 'fruit';
  defId: ContentId;
  label: string;
}

/** Granted abilities + per-ability cooldowns + the keybound routing (primary / dash / extra slots). */
export interface Loadout {
  granted: Set<ContentId>;
  cd: Map<ContentId, number>;
  primary: ContentId; // J / left-click — light attack
  heavy: ContentId; // right-click — heavy attack (base kit: a kick)
  dash: ContentId; // Shift
  slots: ContentId[]; // K, L
  utility?: ContentId; // C — a buff/self ability (e.g. Armament, once the Haki layer grants it)
}

export interface ActiveEffect {
  id: ContentId;
  remaining: number;
  source: string;
}

export interface ActiveEffects {
  active: ActiveEffect[];
}

/** The four equipped combat layers (potentials stack). */
export interface Equipment {
  weapon?: ContentId;
  fruit?: ContentId;
  style?: ContentId;
  potentials: ContentId[];
}

/** Worn accessories (cosmetic apparel) keyed by body slot. Visual now; may grant modifiers/tags later. */
export interface Accessories {
  slots: Partial<Record<AccessorySlot, ContentId>>;
}

/** Full component registry. Reserved (sim/One-Piece) components — inventory, needs, job,
 * rideable, vehicle, reputation, devilFruit, haki, rank — slot in here later. */
export interface Components {
  transform: Transform;
  mover: Mover;
  health: Health;
  faction: Faction;
  ai: AI;
  render: Render;
  identity: Identity;
  melee: MeleeSwing;
  avatar: Avatar;
  combatant: Combatant;
  control: Control;
  npc: Npc;
  loot: Loot;
  squad: Squad;
  pickup: Pickup;
  // combat engine (GAS-lite)
  attributes: StatBlock;
  tags: TagSet;
  loadout: Loadout;
  effects: ActiveEffects;
  equipment: Equipment;
  accessories: Accessories;
  // naval
  ship: Ship;
  riding: Riding;
}

export type ComponentName = keyof Components;

/** An entity is an id plus any subset of components. */
export type Entity = { id: number } & Partial<Components>;
