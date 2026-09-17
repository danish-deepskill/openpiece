/** World + tile geometry (tile units unless noted). */
export const TILE = 32;
/** Chunk edge (tiles) for the FUTURE seamless world (SEAMLESS_WORLD.md — the Factorio-convention 32).
 *  Nothing chunks yet; the constant exists so the world SIZE stays divisible by it (the developer's call:
 *  keep today's map dissectable into square chunks with zero re-authoring when streaming lands). */
export const CHUNK_TILES = 32;
/** SQUARE world (1:1), 3×3 future chunks. Was 86×54 (a screen-shaped rectangle); the extra southern rows
 *  are open sea — sailing room. Islands (HOME/ENEMY below) kept their exact positions. */
export const MAPW = 96;
export const MAPH = 96;
export const WORLD_W = MAPW * TILE;
export const WORLD_H = MAPH * TILE;

/** Fixed virtual resolution; Scale.FIT letterboxes to the window. */
export const GAME_W = 1280;
export const GAME_H = 720;

// NOTE: terrain kinds are CONTENT now — defs in `defs/terrains.ts` (the TerrainDef registry). The grid stores
// each def's ordinal; stamp cells with the TERRAIN constants exported there. The old `Tile` enum is gone.

/** Island layout, in tile coordinates. */
export const HOME = { cx: 17, cy: 27, r: 13 };
export const ENEMY = { cx: 68, cy: 27, r: 13 };

/** Render depth bands. Actors slot in by their y between Boat and Fx. */
export const Depth = {
  Terrain: 0,
  Sea: 1, // animated wave-crest overlay, drawn just above the (baked) deep water and below everything else
  Structure: 2, // baked structure layer (walls/doors/trunks) — ground plane like the old in-terrain bake: above the sea, below corpses/FX/actors
  Corpse: 5,
  GroundFx: 6, // water-surface FX (splash rings) — on the ground plane: above corpses, below items/boats/actors
  Building: 10,
  Item: 12,
  Boat: 15,
  Canopy: 3000, // baked tree-leaf overlay — above every y-sorted actor (max ≈ WORLD_H), below FX/nameplates
  Fx: 5000,
  DmgText: 6000,
  Prompt: 6500,
} as const;

/** Fixed simulation timestep (s). The sim advances ONLY in these steps (accumulator in WorldScene) so results
 *  are frame-rate independent — the prerequisite for replay/server ticks. 1/60 = today's tuned feel exactly. */
export const SIM_DT = 1 / 60;

// (No global movement speeds here: walk speed lives on BODY defs (defs/bodies — humanoid 61 px/s baseline,
// hero = 2.0 tiles/s) × race.speedMul × state multipliers, and ship speed on ShipHullDef.maxSpeed. The old
// FOOT_SPEED/BOAT_SPEED constants sat here dead after that migration and MISLED a speed audit — deleted.)

/** Wind speed reference (px/s at strength 1.0). Strength is a dimensionless MULTIPLIER of this — 100% is a
 *  fresh breeze, not a cap (Calm Belt 0, storms >1 via future field modifiers); this one constant owns the
 *  absolute scale so retuning "how fast is wind" never touches the field, the curves, or the hulls. It must
 *  outrun every sail hull's maxSpeed (ships defs validator enforces it): the apparent-wind term reads
 *  |wind − shipVel|, so a hull faster than the reference would push itself on its own bow-wind in a dead
 *  calm — perpetual motion the moment a Calm Belt zeroes the field. */
export const WIND_REF = 208; // rides the 2026-07 ×0.8 world re-tempo WITH the hulls (was 260) — the ratios are the feel

/** Movement-STATE modifiers (fractions of normal speed). Ground-terrain paces are NOT here anymore — they
 *  live on each terrain row in data/terrains.json (speedMul — knobs live on defs); these constants cover
 *  the states a BODY is in, independent of which ground def sits underneath. */
export const SHALLOW_MOVE_MULT = 0.5; // a SWIMMER over any non-deep water cell (TileGrid.swimSpeedMul) —
//                                       deliberately equal to the shallowWater row's wade pace today, but a
//                                       SEPARATE knob: retune the walker's wade in data/terrains.json
export const LEDGE_MOVE_MULT = 0.5; // balancing atop a LOW WALL (stone wall / ship rail) you jumped onto — a slow perch
export const AIM_MOVE_MULT = 0.5; // ADS-walking while AIMING a ranged weapon (RMB): you can advance while covering, but at half pace
export const SWIM_MOVE_MULT = 0.5; // swimming deep water — SAME pace as a shallow wade (no speed change across the water)
/** Surface swimming drains stamina at this rate (per sec) — swimming is exertion, like sprint/Geppo. */
export const SWIM_STAM_DRAIN = 12;
/** BREATH pool (the underwater clock) + its drain per sec while SUBMERGED. Empty breath = drowning. */
export const MAX_BREATH = 100;
export const BREATH_DRAIN = 20; // ~5s underwater before drowning starts
export const BREATH_REFILL = 40; // breath recovers fast once you surface / reach land
/** Drowning: a DISCRETE hit of this much health, applied once every DROWN_INTERVAL while submerged with no
 *  breath — a clean chunked deduction (one "−N" popup), not a per-frame fractional slide. */
export const DROWN_DAMAGE = 12;
export const DROWN_INTERVAL = 1; // seconds between drown ticks (1 hit/sec)

/** Stamina regen pauses this long after ANY spend (attack/ability/sprint), then resumes — so it never refills mid-fight. */
export const STAM_REGEN_DELAY = 1.0;
/** Stamina per second once regen kicks in (gated by STAM_REGEN_DELAY — the two halves of one mechanic). */
export const STAM_REGEN = 24;
/** Legacy baseline stamina pool — superseded by the endurance-grade model (combat/attributes STAM_BASE +
 *  endurance × STAM_PER_ENDURANCE; the F- floor is 110). Kept only for tests that build bare pools. */
export const MAX_STAM = 100;

// ── Ranged aim spread (docs DESIGN_BACKLOG #19) — one live cone half-angle (rad) the situation opens and the
//    player closes. A shot scatters within it; the reticle draws it. CombatantSystem eases `combatant.spread`
//    toward its target each tick. The CRAFT is the ASYMMETRY: it BLOOMS fast (move/fire) but TIGHTENS slow
//    (earn accuracy by holding still + aiming) — so managing the cone is a skill, not a stat.
/** Widest the cone gets — hip-firing while moving (a spray). ~26°. */
export const SPREAD_HIP = 0.45;
/** Tightest the cone gets — aimed (RMB) + standing still + settled. ~4°, still a hair of imprecision. */
export const SPREAD_AIM_MIN = 0.07;
/** Added to the aim-min target while UNSTEADY (moving/jumping/rolling) — a MIDDLE ground between aim-still and
 *  hip: aiming while moving is wider than aiming planted, but still tighter than blind hip-fire. Clamped to
 *  SPREAD_HIP (the ceiling), so aim-min + this never exceeds the idle/hip cone. Keep aim-min + this < hip. */
export const SPREAD_MOVE_PENALTY = 0.22;
/** Instantly ADDED to the live cone each time you FIRE — the shot kicks accuracy WIDER, then it re-settles as
 *  you hold aim (the "pace your shots, don't spray" skill; #19). One-shot bump, not a target — the settle
 *  eases it back. ~14°. */
export const SPREAD_SHOT_KICK = 0.25;
/** Settle time constant (s) — how fast the cone TIGHTENS toward its target (the slow half of the asymmetry). */
export const SPREAD_SETTLE_TAU = 0.35;
/** Bloom time constant (s) — how fast the cone WIDENS toward its target (the fast half; << settle). */
export const SPREAD_BLOOM_TAU = 0.06;
/** Combo: consecutive-hit damage bonus cap, and how long the chain survives between hits (s). */
export const COMBO_CAP = 5;
export const COMBO_WINDOW = 2;
/** How long (s) a knockback impulse carries the target (mover.dodgeT floor on a landed hit). */
export const KNOCKBACK_CARRY = 0.12;
/** DEFAULT fraction of a HEAVY attack's normal `knockback` that jolts a defender who BLOCKED/PARRIED it (a heavy
 *  blow has mass). Per-ability `guardKnockback` overrides this for exact tuning; light/medium hits jolt nothing. */
export const GUARD_KNOCKBACK_MULT = 0.7;
/** How long (s) the GUARD-knockback impulse carries — longer than a normal hit's KNOCKBACK_CARRY so a blocked
 *  heavy blow shoves the defender a visibly longer slide. */
export const GUARD_KNOCKBACK_CARRY = 0.28;
/** A PARRY takes only this fraction of the block's knockback — a clean deflection redirects the force, so it
 *  barely moves you, whereas a BLOCK braces against the full mass and gets shoved more. Block > parry. */
export const PARRY_KNOCKBACK_MULT = 0.35;
/** SLOWED/staggered debuff: while the `state.slowed` tag is active (effect.staggered/shocked — combat/Effect),
 *  movement scales to this. Attacking/guarding is blocked in BOTH CC states (the classic hitstun); the difference
 *  from STUNNED (frozen) is only that a slowed unit still moves — sluggishly — while a frozen one is rooted. */
export const SLOW_MULT = 0.45;

/** Landing recovery (s) after a JUMP — a brief stun that makes the jump-dodge PUNISHABLE (an enemy who waited
 *  out your hop catches you landing). docs/design/MOVEMENT_AIR.md. */
export const JUMP_LAND_STUN = 0.35;

/** GEPPO hover (docs/design/MOVEMENT_AIR.md): one air-KICK every this-many seconds (the bob cadence) — a longer,
 *  floatier beat than a ground hop (each kick is a sustained air-jump, ~2× a normal jump's feel). */
export const GEPPO_KICK_INTERVAL = 0.8;
/** …costing this much stamina — so hover is stamina-bounded (auto-lands when a kick is unaffordable). */
export const GEPPO_KICK_STAM = 8;
/** The held hover altitude (air-scale) — the height a Geppo fall descends FROM (presentation). */
export const GEPPO_HOVER_HEIGHT = 0.7;
/** Move-speed multiplier while HOVERING with Geppo — skating through the air is faster than a ground walk. */
export const GEPPO_MOVE_MULT = 1.5;
/** Descent time (s) when a Geppo hover ENDS — the fall arc, so landing isn't an instant snap to the ground. */
export const GEPPO_FALL_DUR = 0.3;

/** MOVEMENT FRAMES (docs/design/features/movement-frames.md): the post-transition BEAT (s). Gates only the rail
 *  DROP-OFF — landing on the gunwale while still holding seaward must not instantly dunk you; walking off is a
 *  deliberate second push. The door/leave handoffs need no mute: each pair is direction- or layer-asymmetric
 *  (walk-on=INWARD vs walk-off=OUTWARD; leave=AIR vs board=GROUND), so they cannot oscillate. */
export const FRAME_SWITCH_COOLDOWN = 0.4;

/** A ground pile's collision radius (px) — the pickup's transform.r (Spawner) AND the footprint a drop must clear. */
export const PICKUP_R = 12;

/** CONTAINER REACH (px) beyond the two body radii — how close you stand to a chest (or a corpse, later) to
 *  reach into it (Items.reachableHold). Same idea as VerbDef.reach; a knob so a big chest can feel arm's-length. */
export const HOLD_REACH = 28;

/** FOLLOW-CAMERA glide rate (1/s, smoothFactor): how fast the view center closes on the controlled unit's DRAWN
 *  pose. Time-based (the dt rule), so 60 and 144 Hz feel identical; 10.5 reproduces the old 0.16-per-frame feel
 *  at 60 fps. Higher = stiffer (welded), lower = floatier. */
export const CAMERA_FOLLOW_RATE = 10.5;
/** RENDER INTERPOLATION teleport threshold (px, 2-D): a body that moved further than this in ONE sim step is
 *  drawn at its new spot instead of sliding there (respawn, a frame hop's projection change). Must exceed the
 *  fastest legal per-step move (a rocket launch ~600 px/s × 1/60 = 10 px) by a wide margin. */
export const VIEW_TELEPORT_PX = 48;

/** Follow-camera zoom at boot — higher = closer (moomoo.io-style). 1.0 showed too much world on foot. */
export const CAMERA_ZOOM = 2;
/** WHEEL ZOOM range — the mouse wheel steps the view-zoom TARGET (InputSystem owns it, WorldScene glides the
 *  camera to it). MIN 1 = 1280×720 world px (40×22 tiles), the old debug zoom-out; 0.5 (nearly the whole
 *  map) was judged too far on foot — it stays SEAMLESS_WORLD §8.2's candidate for the HELM mode's own zoom
 *  when that lands. MAX = the boot default: the wheel only zooms OUT from the tuned foot view (closer buys
 *  nothing tactically; the planned ladder past the default is the strategy/dots view — DESIGN_BACKLOG #12). */
export const CAMERA_ZOOM_MIN = 1;
export const CAMERA_ZOOM_MAX = CAMERA_ZOOM;
/** Per wheel notch the target MULTIPLIES by this (zoom is perceptually logarithmic — equal notches, equal
 *  feel; an additive step would crawl when close and lurch when far). */
export const CAMERA_ZOOM_STEP = 1.15;
/** Glide rate (1/s, smoothFactor) from the current zoom toward the target — a dolly, not a slideshow. */
export const CAMERA_ZOOM_SMOOTH = 12;

export type GameState = 'start' | 'play' | 'paused' | 'dead';

/** Impact-FX palette shared by the sim's fx-event payloads and FxSystem's own drawing (one literal per meaning). */
export const FX_COLOR = {
  spark: 0xffe08a, // a landed hit / the pistol beam
  blood: 0xc0303a,
  phase: 0x9fd0ff, // a strike phasing through Logia intangibility
  parry: 0xf2f7ff, // the deflection flash — bright steel-white, unmistakable from a landed spark
} as const;

/** HUD view-model shapes shared by the WorldScene writer and HudScene reader (one type, both ends). */
export interface MinimapDot { x: number; y: number; c: number; r: number }
export interface AbilityBarEntry { key: string; id: string; cd: number; cdMax: number }

/** Registry keys the WorldScene publishes and the HudScene reads. */
export const RegKey = {
  /** UnitPlateView | null — the controlled unit's plate (replaces the old per-stat hp/stam/tier keys:
   *  ONE view-model shared with Inspect, so every plate on screen renders the same readout). */
  Player: 'hud.player',
  /** UnitPlateView | null — the V+click inspected unit's plate (published by InspectSystem). */
  Inspect: 'hud.inspect',
  Gold: 'hud.gold',
  Combo: 'hud.combo',
  AbilityBar: 'hud.abilityBar',
  Prompt: 'hud.prompt',
  Dialogue: 'hud.dialogue',
  State: 'hud.state',
  Minimap: 'hud.minimap',
} as const;
