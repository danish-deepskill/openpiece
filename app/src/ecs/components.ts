import type Phaser from 'phaser';
import type { Brain } from '../ai/Brain';
import type { FactionId } from '../defs/factions';
import type { StatBlock } from '../combat/Stat';
import type { TagSet } from '../combat/Tags';
import type { ContentId } from '../core/Registry';

/** A procedural draw function: paint the entity into its Graphics in LOCAL space. */
export type DrawFn = (g: Phaser.GameObjects.Graphics, e: Entity) => void;

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
  mode: MoveMode;
  // dodge / dash impulse
  dodgeT: number;
  dvx: number;
  dvy: number;
}

export interface Health {
  hp: number;
  maxhp: number;
  dead: boolean;
  hitFlash: number;
  iframes: number;
}

/** Allegiance. Hostility is resolved via the faction relations matrix, never team checks. */
export interface Faction {
  id: FactionId;
}

export interface Attacker {
  dmg: number;
  range: number; // bonus melee gap beyond the two radii
  arc: number;
  cd: number;
  atkCd: number;
  knockback: number;
}

export interface Blackboard {
  state: string;
  target?: Entity;
  home: { x: number; y: number };
  wanderT: number;
  wdx: number;
  wdy: number;
  [k: string]: unknown;
}

export interface AI {
  brain: Brain;
  bb: Blackboard;
}

export interface Render {
  gfx: Phaser.GameObjects.Graphics;
  draw: DrawFn;
  baseColor: number;
  hatColor?: number;
  bob: number;
  showHpBar?: boolean;
  hpColor?: number;
  label?: string;
  /** Rotate the Graphics to transform.angle (ships); actors draw facing via their hat instead. */
  rotateToAngle?: boolean;
  /** Added to depth (= y) for tie-breaking, e.g. a ship sits just under its riders. */
  depthBias?: number;
  /** Attack animation: time remaining / total + which hand acts (-1 left, +1 right). */
  swingT?: number;
  swingMax?: number;
  swingSide?: number;
  /** Weapon hand SWEEPS through the cone (arc) vs lunges forward (thrust); arc half-angle to sweep. */
  swingArc?: boolean;
  swingArcHalf?: number;
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
}

/**
 * Player-control flavor that isn't part of the shared combat resource. Possessing a body grants this.
 * (Shared resources moved to `Combatant`; what makes an entity "the player" is only the `control` tag.)
 */
export interface Avatar {
  hasFruit: boolean;
}

/** Tag marking the entity currently driven by human input. Move it to possess another. */
export type Control = Record<string, never>;

export interface Crew {
  name: string;
  stance: 'follow' | 'hold';
  slot: number;
  cmdAttack: boolean;
  cmdT: number;
}

export interface Npc {
  dialogue: string[];
  recruit?: { name: string; hp: number; dmg: number; color: number };
  hired?: boolean;
}

export interface Loot {
  gold: number;
}

export interface Item {
  kind: 'fruit';
  taken: boolean;
  treeX: number;
  treeY: number;
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
  primary: ContentId; // J / left-click
  dash: ContentId; // Shift
  slots: ContentId[]; // K, L
}

export interface ActiveEffect {
  id: ContentId;
  remaining: number;
  source: string;
}

export interface EffectsComp {
  active: ActiveEffect[];
}

/** The four equipped combat layers (potentials stack). */
export interface Equipment {
  weapon?: ContentId;
  fruit?: ContentId;
  style?: ContentId;
  potentials: ContentId[];
}

/** Full component registry. Reserved (sim/One-Piece) components — inventory, needs, job,
 * rideable, vehicle, reputation, devilFruit, haki, rank — slot in here later. */
export interface Components {
  transform: Transform;
  mover: Mover;
  health: Health;
  faction: Faction;
  attacker: Attacker;
  ai: AI;
  render: Render;
  avatar: Avatar;
  combatant: Combatant;
  control: Control;
  crew: Crew;
  npc: Npc;
  loot: Loot;
  item: Item;
  squad: Squad;
  pickup: Pickup;
  // combat engine (GAS-lite)
  attributes: StatBlock;
  tags: TagSet;
  loadout: Loadout;
  effects: EffectsComp;
  equipment: Equipment;
  // naval
  ship: Ship;
  riding: Riding;
}

export type ComponentName = keyof Components;

/** An entity is an id plus any subset of components. */
export type Entity = { id: number } & Partial<Components>;
