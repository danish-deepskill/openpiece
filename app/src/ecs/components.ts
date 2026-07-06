import type { Brain } from '../ai/Brain';
import type { AttackPhases } from '../combat/phases';
import type { AccessorySlot } from '../defs/accessories';
import type { ItemRef } from '../defs/items';
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
  /** ROLL animation clock (s), counts down while a roll is in flight — drives the ball-up+spin in drawActor.
   *  Distinct from dodgeT (which knockback also sets); rollDur holds the total so the draw can compute progress.
   *  Sim-set + serializable (presentation READS it, never writes). Absent/0 ⇒ not rolling. */
  rollT?: number;
  rollDur?: number;
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
  followId?: number; // a recruited crew member FOLLOWS this entity: its `home` tracks the leader each tick, so
  //                    it stays near them (and its chase-on-sight still breaks off to fight, then returns)
  heeling?: boolean; // follow hysteresis: currently closing on the leader (set past FOLLOW_FAR, cleared inside
  //                    FOLLOW_NEAR) — the two-threshold band that stops the follower buzzing at one tether line
  // pursuit & perception — cross-entity refs are IDS at rest (ecs-hot-loop canon: serializable, and a dead
  // ref resolves to undefined via world.byId instead of dangling); brains re-resolve them each tick
  quarryId?: number; // who we're chasing (persists past line-of-sight)
  focusId?: number; // squad-assigned focus-fire target
  lastSeenX: number;
  lastSeenY: number;
  lostT: number; // time since we last saw the target
  alertT?: number; // "I was hit" investigate/flee timer
  spotT?: number; // "!" double-take countdown: set on entering `alert`, ticks down, then commits to the chase
  betrayHpFrac?: number; // friendly-fire tolerance (HP frac): an ALLY that drops me to ≤ this earns a
  //                        permanent grudge (seeded at spawn from unit/profile; undefined ⇒ never turns)
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
  // guard (block/parry) — the AI face of combat/guard, driven by profile blockChance/parryChance
  guardT?: number; // guard hold remaining (s): while > 0 the brain stands its ground blocking
  guardCd?: number; // guard re-roll cooldown (s): one guard decision per enemy swing, not per tick
  regrouping?: boolean; // tactical stamina retreat (combatStance hysteresis): backing off to regen, not attacking
  // COMMITTED next special (a mini-intent): when a pinned regrouper rolls the Rocket-reposition, it PLANS the move
  // here instead of firing on the spot — so the harry logic knows to STOP jabbing (which would spend the stamina
  // the plan needs) and instead conserve until the special is affordable + the opening lands, then fires + clears.
  // A persisted decision the same way movement (mover.vx/vy) is a persisted movement intent; folds into the future
  // PlayerIntent system when netcode lands. Undefined ⇒ no plan (normal per-beat attack choice).
  plannedSpecial?: ContentId;
  // ATTACK-DECISION CADENCE (the generic fix for "re-decides every tick"): a chance-gated attack choice may only
  // be ROLLED when this timer is ≤ 0, then re-arms — so a `chance` reads as "per DECISION", never "per tick" (a
  // per-tick roll snowballs to always-fires at sim rate). ONE ability-agnostic clock (like guardCd for guards),
  // so ANY number of roll-based ability picks scale without per-ability state. Ticks down each frame.
  decideCd?: number;
}

export interface AI {
  brain: Brain;
  bb: Blackboard;
}

/** PURE DATA — no Graphics object, no function pointer (serializable + headless-safe; DESIGN_PATTERNS §9).
 *  `draw` is a string key into the presentation draw registry; RenderSystem owns the actual Graphics. */
export interface Render {
  draw: string; // draw-registry key: a RaceDef.draw ('actor', 'cow', 'pig'), 'pickup', or 'ship'
  /** Texture key to render as an IMAGE instead of running `draw` (a loaded sprite, e.g. an item's own art).
   *  When set, RenderSystem blits this texture; `draw` is ignored. Display diameter = 2·r·(spriteScale ?? 1). */
  sprite?: string;
  spriteScale?: number;
  baseColor: number;
  /** Torso/shoulder (clothing) fill for the humanoid anatomy; absent ⇒ derived from baseColor. */
  garbColor?: number;
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
 * motion archetype + params: reach, arc, jabs, stretch length, …) is DATA on `AbilityDef.shape`, looked up
 * via `ability`, and its damaging geometry is the strike's HitVolumes (combat/hitVolume). So 1000 strike
 * types are 1000 data rows, not 1000 fields here. MeleeSystem resolves each live volume against targets and
 * drawActor reads the SAME pose to animate the swing — what you see drives what hits. Replaced on a new
 * attack; cleared when it ends.
 */
export interface MeleeSwing {
  ability: ContentId;
  t: number; // elapsed seconds (0 → dur)
  dur: number;
  motion: string; // resolved motion archetype ('stab' | 'arc' | 'stretch' | …) — keys combat/swing.ts MOTIONS
  /** windup/active/recover split, RESOLVED at cast (like `motion`) — hitbox gating, the motion timelines,
   *  and a future parry all read this one copy, so they can never disagree about the attack's clock. */
  phases: AttackPhases;
  side: number; // acting limb: -1 left, +1 right
  angle: number; // aim direction, locked at swing start
  /** Per-VOLUME ids already struck (index-aligned with the swing's resolved strike volumes): one volume hits
   *  a target once within its window; two overlapping volumes may BOTH land (per-volume hits, deliberate). */
  hitByVolume: number[][];
  launched?: boolean; // grab-launch (Gomu Rocket): the body-impulse has fired (latches to fire once)
  landed?: boolean; // grab-launch: the landing AoE has fired (latches to fire once, when the leap stops)
}

/** A ship hull instance (composite entity: hull stats from ShipHullDef + parts/cannons later). */
export interface Ship {
  hull: ContentId;
  mode: 'exploration' | 'battle';
  anchored: boolean;
  speed: number; // current forward speed along heading
  /** Pilot input this tick (-1..1); 0 when uncrewed/coasting. Water drag + the stop-snap apply ONLY while
   *  coasting — under sail, `accel` is the NET force (otherwise drag silently caps speed below maxSpeed). */
  throttle: number;
}

/** Marks an entity riding/piloting a ship (its world position is pinned to a DECK SLOT, not the ship center,
 *  so riders don't stack). Id at rest — ShipSystem resolves it via world.byId each use, so a sunk ship reads
 *  as gone, not stale. */
export interface Riding {
  shipId: number;
  seat: number; // deck-slot index (0 = pilot at the helm; 1+ = passengers spread along the deck)
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
  /** Guard strain, 0 → `maxPosture` (INVERSE pool: full = broken). Blocked hits add to it by the attacker's
   *  combat WEIGHT; overflow = guard break (combat/guard). Regens only while the guard is DOWN. */
  posture: number;
  maxPosture: number; // derived from the willpower attribute at spawn (combat/attributes)
  blocking?: boolean; // guard held (F / AI hold): frontal hits reroute HP → posture; move slowed; no regen
  parryT?: number; // parry window remaining (s): a frontal hit landing now is negated outright
  parryCd?: number; // parry re-arm remaining (s): only a WHIFFED window pays this (success resets it)
  kickSide?: number; // last kicking foot (±1); alternated each kick so left/right kicks mirror
  handSide?: number; // last throwing hand (±1); alternated each bare/stretch swing (R → L → R, never random)
  mixStab?: boolean; // 'mixed'-motion weapons (the cutlass) ALTERNATE stab↔swing deterministically (a coin
  //                    flip read as inconsistent); this holds the last pick so the next flips to the other
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

/** Per-entity personal grudges: entity ids this unit has PERMANENTLY turned hostile toward (an ally that
 *  friendly-fired it past its `betrayHpFrac`). Layered ON TOP of the static faction matrix — a betrayal is
 *  per-INDIVIDUAL (hitting one ally never sours its whole faction), and mutual once formed (both sides read
 *  it via combat/targeting.entityHostile, so the provoker can retaliate without the friendly-fire toggle). */
export interface Grudge {
  ids: Set<number>;
}

/** A unit whose def carries dialogue is conversable (the `talk` verb). `recruitable` offers a join-crew
 *  choice after the lines; cleared once recruited so it can't be recruited twice. */
export interface Npc {
  dialogue: string[];
  recruitable?: boolean;
}

export interface Loot {
  gold: number;
}

/** Group membership for coordinated AI (focus-fire, attack budget, morale). */
export interface Squad {
  id: number;
  name: string;
}

/** A pickup-able item lying in the world (walk up + E to take it) — any ItemRef category (weapon/fruit/
 *  accessory), so a hat on the floor is the same generic pickup as a cutlass. `label` is cached for the FX
 *  text; the verb reads the live name off the ref. */
export interface Pickup {
  item: ItemRef;
  label: string;
}

/** Owned-but-not-necessarily-equipped items — the bag. Plain ItemRef list (ids at rest, any actor may hold
 *  one: the Moat). Grows to stacking/weight/sorting later as list ops, with no change to its consumers. */
export interface Inventory {
  items: ItemRef[];
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
  /** Live combo-chain state: pressing `root`'s slot again while `until` > 0 fires `next` instead of
   *  restarting. Set/expired by AbilitySystem; plain ids + a timer, so it serializes like everything else. */
  chain?: { root: ContentId; next: ContentId; until: number };
}

export interface ActiveEffect {
  id: ContentId;
  remaining: number;
  source: string;
}

export interface ActiveEffects {
  active: ActiveEffect[];
  /** Per-entity instance counter: gives each applied effect a UNIQUE modifier source, so two stacked
   *  instances of one effect can never share a source (a shared source made the first expiry strip both). */
  seq: number;
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
  grudge: Grudge;
  npc: Npc;
  loot: Loot;
  squad: Squad;
  pickup: Pickup;
  inventory: Inventory;
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
