/** World + tile geometry (tile units unless noted). */
export const TILE = 32;
export const MAPW = 86;
export const MAPH = 54;
export const WORLD_W = MAPW * TILE;
export const WORLD_H = MAPH * TILE;

/** Fixed virtual resolution; Scale.FIT letterboxes to the window. */
export const GAME_W = 1280;
export const GAME_H = 720;

export enum Tile {
  Water = 0,
  Grass = 1,
  Sand = 2,
  Dock = 3,
  Wall = 4, // solid building wall — blocks foot & boat
  Floor = 5, // building interior — walkable on foot
  Door = 6, // doorway in a building wall — blocks (closed) until the player approaches (see DoorSystem)
  ShallowWater = 7, // coastal shallows: wadable on foot (but slow — SHALLOW_MOVE_MULT); boats can cross it
}

/** Island layout, in tile coordinates. */
export const HOME = { cx: 17, cy: 27, r: 13 };
export const ENEMY = { cx: 68, cy: 27, r: 13 };

/** Render depth bands. Actors slot in by their y between Boat and Fx. */
export const Depth = {
  Terrain: 0,
  Sea: 1, // animated wave-crest overlay, drawn just above the (baked) deep water and below everything else
  Corpse: 5,
  Building: 10,
  Item: 12,
  Boat: 15,
  Fx: 5000,
  DmgText: 6000,
  Prompt: 6500,
} as const;

/** Fixed simulation timestep (s). The sim advances ONLY in these steps (accumulator in WorldScene) so results
 *  are frame-rate independent — the prerequisite for replay/server ticks. 1/60 = today's tuned feel exactly. */
export const SIM_DT = 1 / 60;

/** Movement speeds (px/s). */
export const FOOT_SPEED = 165;
export const BOAT_SPEED = 225;

/** Terrain modifier: a unit standing on shallow water wades at this fraction of normal speed (see TileGrid.speedMul). */
export const SHALLOW_MOVE_MULT = 0.5;

/** Sprint (shared by player input + AI): run-speed multiplier and stamina drained per second. */
export const SPRINT_MULT = 1.5;
export const SPRINT_DRAIN = 24;

/** Stamina regen pauses this long after ANY spend (attack/ability/sprint), then resumes — so it never refills mid-fight. */
export const STAM_REGEN_DELAY = 1.0;
/** Stamina per second once regen kicks in (gated by STAM_REGEN_DELAY — the two halves of one mechanic). */
export const STAM_REGEN = 12;
/** Shared stamina pool size (same for everyone for now; a maxStam attribute can override later). */
export const MAX_STAM = 100;
/** Combo: consecutive-hit damage bonus cap, and how long the chain survives between hits (s). */
export const COMBO_CAP = 5;
export const COMBO_WINDOW = 2;
/** How long (s) a knockback impulse carries the target (mover.dodgeT floor on a landed hit). */
export const KNOCKBACK_CARRY = 0.12;
/** Hitstun: while stunned, movement scales to this (a stagger, not a full freeze); attacks are blocked entirely. */
export const STUN_SLOW = 0.45;

/** Follow-camera zoom — higher = closer (moomoo.io-style). 1.0 showed too much world. */
export const CAMERA_ZOOM = 2;

export type GameState = 'start' | 'play' | 'paused' | 'dead' | 'win';

/** Impact-FX palette shared by the sim's fx-event payloads and FxSystem's own drawing (one literal per meaning). */
export const FX_COLOR = {
  spark: 0xffe08a, // a landed hit / the pistol beam
  blood: 0xc0303a,
  phase: 0x9fd0ff, // a strike phasing through Logia intangibility
} as const;

/** HUD view-model shapes shared by the WorldScene writer and HudScene reader (one type, both ends). */
export interface MinimapDot { x: number; y: number; c: number; r: number }
export interface AbilityBarEntry { key: string; id: string; cd: number }

/** Registry keys the WorldScene publishes and the HudScene reads. */
export const RegKey = {
  Hp: 'hud.hp',
  MaxHp: 'hud.maxHp',
  Stam: 'hud.stam',
  MaxStam: 'hud.maxstam',
  Tier: 'hud.tier',
  Gold: 'hud.gold',
  EnemiesLeft: 'hud.enemies',
  Objective: 'hud.objective',
  Combo: 'hud.combo',
  AbilityBar: 'hud.abilityBar',
  Prompt: 'hud.prompt',
  Dialogue: 'hud.dialogue',
  State: 'hud.state',
  Minimap: 'hud.minimap',
} as const;
