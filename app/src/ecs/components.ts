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

export type MoveMode = 'foot' | 'boat' | 'swim';

/** Vertical DOMAIN — a discrete two-layer state (design: docs/design/MOVEMENT_AIR.md), the peer of MoveMode.
 *  'ground' (default) obeys foot collision; 'air' clears foot-blocked terrain (jump over water/walls) and is the
 *  domain aerial combat filters on. Deliberately NOT a continuous height — the arc is faked in presentation. */
export type Layer = 'ground' | 'air';

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
  /** VERTICAL LAYER (docs/design/MOVEMENT_AIR.md): 'ground' (default/undefined) or 'air' while a jump is aloft.
   *  Read by collision (air clears foot-blocked terrain) + later by combat targeting (layer-match). */
  layer?: Layer;
  /** Airborne time remaining (s) — MovementSystem ticks it down; hits 0 → land (layer back to 'ground'). The
   *  presentation scale+shadow arc eases over this window (airDur holds the total for the draw's progress). */
  airT?: number;
  airDur?: number;
  /** GEPPO hover (docs/design/MOVEMENT_AIR.md): while true, the actor STAYS airborne (kicking off the air) —
   *  MovementSystem refreshes airT each tick so it never lands on its own, spends stamina per KICK (each bob),
   *  and auto-clears (lands) when it can't afford the next kick. Toggled by ability.geppo. */
  hovering?: boolean;
  /** SUBMERGED (docs/design/MOVEMENT_AIR.md): underwater — only meaningful while mode==='swim'. Entered by
   *  SINKING (surface swim ran out of stamina) or a deliberate DIVE toggle. While submerged, BREATH drains
   *  (not stamina) and empty breath drowns you. Cleared on surfacing (stamina recovers / reaching land). */
  submerged?: boolean;
  /** Hover-bob phase (s) — accumulates while hovering to drive the repeated jump bob + a stamina kick + a cloud
   *  puff once per cycle. Presentation reads it for the bob; the sim uses the cycle edge for the kick cost. */
  hoverT?: number;
  /** Total time hovering (s) since toggle-on — lets the presentation play a JUMP LAUNCH (rise from the ground)
   *  over the FIRST kick, THEN settle into the held hover bob, instead of snapping straight to hover height. */
  hoverElapsed?: number;
  /** GEPPO FALL: when a hover ENDS (toggle off / out of stamina), a short DESCENT window (s) instead of an
   *  instant snap to the ground. The presentation eases the scale down from `fallFrom` → 0 over it; the actual
   *  land (+ landing stun) fires when it reaches 0. fallDur holds the total for the draw's progress. */
  fallT?: number;
  fallDur?: number;
  fallFrom?: number; // the air-scale height the fall STARTS from (the hover altitude at the moment it ended)
  /** ON A LEDGE — standing atop a LOW WALL (a StoneWall/Tree in the world, or a ship rail on deck) after JUMPING
   *  onto it. Set on landing airborne over a low-wall tile; cleared when you step off onto normal ground. While
   *  set, that low wall is WALKABLE for you (so you perch, not get stuck/unstuck-off) but movement is SLOWED
   *  (LEDGE_MOVE_MULT). This is how "land on the low wall and balance across it" works without a z-axis: the state
   *  distinguishes ON-TOP (you jumped up here) from BESIDE (walking into it from ground = still blocked). */
  onLedge?: boolean;
  /** FRAME-SWITCH beat (s): counts down after boarding/leaving a ship (set by enterDeck/exitDeck, ticked by
   *  MovementSystem). Gates only the rail DROP-OFF — landing on the gunwale holding seaward must not instantly
   *  dunk you. The door/leave handoffs read direction/layer instead of this (asymmetric pairs can't ping-pong). */
  frameCd?: number;
  /** Suppress the JUMP_LAND_STUN on the NEXT landing — a CONTROLLED hop (the Shock Kick's leap-back) lands clean
   *  so it doesn't self-freeze the retreat. Set by leapBack, honored + cleared by MovementSystem.land (one-shot). */
  noLandStun?: boolean;
  /** WALL-SLAM pending effects (s): set on a target flung by a wall-slam knockback (the marine Buttstroke proc).
   *  While its knockback impulse is in flight, MovementSystem watches the slide: if BLOCKED by a wall it applies
   *  `slamStun` (a FROZEN electric pin) + a cyan pop; if it ends FREE (no wall) it applies `slamSlow` (the lighter
   *  SLOWED shock). Both cleared once resolved. See AbilityDef.wallSlam. */
  slamStun?: number;
  slamSlow?: number;
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
  // STUCK DETECTION (anti "sprint into the wall forever"): `stuckT` accumulates while a unit TRIES to move but its
  // position barely changes (pinned on a wall/corner) → the kite beat loop abandons the reposition and re-plants
  // instead of running in place; `pinX/pinY` is last frame's position, the progress reference.
  stuckT?: number;
  pinX?: number;
  pinY?: number;
  // KITE BEAT LOOP (the discrete-tactic model that replaces per-frame position-mirroring): a ranged kiter cycles
  // PLANT (stand, aim, shoot) → PAUSE → REPOSITION (move to a CHOSEN spot: back / juke L / juke R) → arrive →
  // PLANT again. `kitePhase` is the current beat; `kiteBeatT` times it; `kiteDestX/Y` is the committed reposition
  // destination (moved to via pathfinding, so it ignores the target's micro-movements → reads tactical, not bot).
  kitePhase?: 'aim' | 'pause' | 'reposition';
  kiteBeatT?: number;
  kiteDestX?: number;
  kiteDestY?: number;
  /** How many committed ADVANCE steps a kiter has taken chasing a fleeing target. A marksman doesn't dog you:
   *  after a couple it STOPS pursuing and just shoots from range (or gives up out of shot range) — no per-pixel
   *  chase. Reset when the target comes back into the comfort band (it's no longer fleeing). */
  kiteChaseSteps?: number;
  /** The LATCHED close-game gamble (pointBlankSlotChance): rolled ONCE when the target enters the close band,
   *  cleared on band exit / after the answer fires. undefined = not yet rolled this engagement. The latch is what
   *  keeps the chance a real probability — a per-tick re-roll would fire within ~0.1s regardless of the value. */
  closeRoll?: boolean;
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
  /** Officer/rank ACCENT — a short stripe on each shoulder (a marker that reads at a glance, e.g. an officer
   *  vs a plain marine). Absent ⇒ no stripe. Drawn by the humanoid body; purely cosmetic identity. */
  accentColor?: number;
  /** How many parallel rank stripes per shoulder (only when accentColor is set). Absent ⇒ 1. Higher rank =
   *  more bars (a captain's two vs a lieutenant's one). */
  rankStripes?: number;
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
  leaptBack?: boolean; // on-hit recoil LEAP (Shock Kick) has fired for this swing (latches — one hop per kick)
  shotFired?: boolean; // a 'shot' swing has spawned its projectile(s) at the active cue (latches — one volley per shot)
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

/** Marks an entity standing ON a ship's deck (docs/design/features/big-walkable-ship.md — local-space parenting).
 *  It carries a LOCAL position on the deck (ship-frame px, bow = +x, same frame as the deck grid); ShipSystem
 *  derives the WORLD position each tick as `ship.pos + rotate(local, ship.angle)`, so the actor rides the deck as
 *  it sails/turns. Replaces a fixed seat with a free spot (step 3 lets `lx/ly` MOVE = walking). Id at rest —
 *  resolved via world.byId each use, so a sunk ship reads as gone, not stale. */
export interface OnDeck {
  shipId: number;
  lx: number; // LOCAL x on the deck (px), ship-centered, bow = +x
  ly: number; // LOCAL y on the deck (px), ship-centered
  /** TOOK THE WHEEL: set by pressing E while standing on the `helm` tile (cleared by E again or stepping off), so
   *  steering is a DELIBERATE act — WASD only pilots the ship while this is true, never by accidentally walking
   *  over the wheel. Absent/false ⇒ a free-walking passenger (full combat), even while atop the helm tile. */
  piloting?: boolean;
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
  /** AIMING a ranged weapon (RMB hold / AI when a target's ahead): the braced, shouldered firing stance — the
   *  musket is leveled at the target, not carried low. Presentation reads it for the pose; feeds `spread`
   *  (aiming tightens the cone). Only meaningful with a `ranged` weapon equipped. */
  aiming?: boolean;
  /** LIVE AIM SPREAD (rad, cone HALF-angle) — a shot scatters within it; the reticle draws it (docs #19).
   *  CombatantSystem eases it toward a target each tick: narrow when aiming + still, wide when hip-firing /
   *  moving; blooms fast, tightens slow. Absent ⇒ seeded to the hip value on first ranged upkeep. */
  spread?: number;
  parryT?: number; // parry window remaining (s): a frontal hit landing now is negated outright
  parryCd?: number; // parry re-arm remaining (s): only a WHIFFED window pays this (success resets it)
  kickSide?: number; // last kicking foot (±1); alternated each kick so left/right kicks mirror
  handSide?: number; // last throwing hand (±1); alternated each bare/stretch swing (R → L → R, never random)
  mixStab?: boolean; // 'mixed'-motion weapons (the cutlass) ALTERNATE stab↔swing deterministically (a coin
  //                    flip read as inconsistent); this holds the last pick so the next flips to the other
  regenT?: number; // stamina-regen delay remaining (s): set on every spend, ticks down; regen only at 0
  // CROWD CONTROL lives on the EFFECT system, not here (backlog #16: statuses are GAS-lite effect rows, never a
  // second timer mechanism): a stagger/freeze = an active effect granting 'state.slowed'/'state.stunned' (see
  // combat/Effect TAG_SLOWED/TAG_STUNNED); every gate reads the TAG, EffectSystem ticks the clock.
  /** BREATH (0 → maxBreath) — the UNDERWATER clock (docs/design/MOVEMENT_AIR.md), distinct from stamina: surface
   *  swimming spends STAMINA, but going SUBMERGED holds your breath and drains THIS. Empty breath while under =
   *  drowning (health damage). Refills at the surface / on land. The load-bearing resource for future underwater
   *  combat + a dive mode. Absent ⇒ full (lazy-seeded on first submerge). */
  breath?: number;
  maxBreath?: number;
  drownT?: number; // countdown to the next DROWN tick (s) — so drowning deducts in clean per-second chunks, not a per-frame slide
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
  /** The unit's INNATE (non-equipment) kit — base verbs the Spawner decided per unit (fist/kick/jump, roll by
   *  tier, guard unless noGuard) PLUS trait grants (sprint…). `refreshLoadout` re-derives `granted` as
   *  innate ∪ equipment-kit, so an equip/unequip rebuild can never strip an innate capability — this list IS
   *  the record that made the old preserve-sprint special-case (and its per-ability successors) unnecessary. */
  innate: ContentId[];
  cd: Map<ContentId, number>;
  /** The DURATION each active cooldown was set to (parallel to `cd`, which holds the REMAINING time). The HUD
   *  fill needs the original duration to compute progress — and it can't derive it from the ability's base
   *  `def.cooldown` because (a) it's scaled by atkSpeed and (b) a combo root is locked for the FINISHER's cd,
   *  not its own. Written wherever cd is set; read only for the fill fraction (1 − cd/cdMax). */
  cdMax: Map<ContentId, number>;
  primary: ContentId; // J / left-click — light attack
  heavy: ContentId; // right-click — heavy attack (base kit: a kick)
  dash: ContentId; // Shift
  slots: ContentId[]; // number keys 1/2/3 (InputSystem) — extra granted moves (a fruit's specials, a weapon's signature)
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

/** A static BUILT thing occupying whole grid cells — wall, door, tree; later windmill/cannon/mast. The def
 *  (defs/structures.ts) carries the footprint + physics; this instance carries WHERE it stands and its own
 *  state (a door's `open`; HP arrives with destructibility). Cells are claimed through the owning grid's
 *  StructureIndex (world/StructureIndex.ts) at spawn — the index, not this component, is what collision and
 *  pathfinding read per cell. Plain ids + ints, serializable like everything else. */
export interface Structure {
  def: ContentId;
  /** Anchor cell (top-left of the def's w×h footprint), tile coords in the owning grid. */
  tx: number;
  ty: number;
  /** Door state — toggled by DoorSystem on `door` defs; an open door stops blocking (collision + vision). */
  open?: boolean;
}

/** A TRAVELLING shot — a musket ball, a thrown knife, later a cannonball or a Fruit projectile. Its own
 *  entity (transform + `projectile` + render), moved each tick by ProjectileSystem, which SWEEPS its path
 *  (last → new point) against hostile bodies AND solid grid cells so a fast ball can't tunnel through a wall
 *  or an enemy between ticks. The damage isn't cached here — `ability` is looked up at contact so knockback/
 *  stun/tags/damage all resolve through the SAME StrikeResolver a melee hit uses (guard/parry/Logia for free).
 *  `owner` is the shooter (id at rest — resolved at impact; a dead/gone shooter still lands the shot in flight). */
export interface Projectile {
  owner: number; // shooter entity id — resolved at contact for damage attribution + the harm predicate
  ability: ContentId; // the firing ability — its damage/knockback/stun/shape read at impact (never cached)
  vx: number; // px/s — a straight, FIXED path (leading is the shooter's skill, NOT homing); no per-tick steering
  vy: number;
  life: number; // seconds remaining before it expires harmlessly (range = life × speed); ticked down each frame
  /** Bodies already struck (ids) — lets a future PIERCING round pass through more than one; a plain single
   *  shot dies on the first contact, so this holds at most one before the projectile is despawned. */
  hit: number[];
  /** CLOSE-RANGE pass-through chance (0..1) baked at FIRE time (a point-blank shot is a bad shot). On contact
   *  ProjectileSystem rolls this: on a hit it phases THROUGH (no damage) but is still spent. 0/absent ⇒ always
   *  connects. See AbilityShape.closePassChance. */
  passChance?: number;
  /** CHARGED round — a per-pellet PROC rolled at FIRE time (AbilityShape.procEffect): on a landed contact the
   *  ball hits ×damageMult and applies `effect` (an EffectDef id — shocked/burning/…) for `dur` seconds. The
   *  renderer draws a charged ball themed by the effect's status color. Absent ⇒ a plain round. Element/delivery
   *  TAGS for the #16 reaction matrix ride this same payload when that pass lands. */
  proc?: { effect: ContentId; dur: number; damageMult: number };
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
  onDeck: OnDeck;
  // world statics
  structure: Structure;
  // combat
  projectile: Projectile;
}

export type ComponentName = keyof Components;

/** An entity is an id plus any subset of components. */
export type Entity = { id: number } & Partial<Components>;
