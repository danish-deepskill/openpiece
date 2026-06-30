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
}

/** Island layout, in tile coordinates. */
export const HOME = { cx: 17, cy: 27, r: 13 };
export const ENEMY = { cx: 68, cy: 27, r: 13 };

/** Render depth bands. Actors slot in by their y between Boat and Fx. */
export const Depth = {
  Terrain: 0,
  Corpse: 5,
  Building: 10,
  Item: 12,
  Boat: 15,
  Fx: 5000,
  DmgText: 6000,
  Prompt: 6500,
} as const;

/** Movement speeds (px/s). */
export const FOOT_SPEED = 165;
export const BOAT_SPEED = 225;

export type GameState = 'start' | 'play' | 'paused' | 'dead' | 'win';

/** Registry keys the WorldScene publishes and the HudScene reads. */
export const RegKey = {
  Hp: 'hud.hp',
  MaxHp: 'hud.maxhp',
  Stam: 'hud.stam',
  MaxStam: 'hud.maxstam',
  Gold: 'hud.gold',
  CrewCount: 'hud.crew',
  CrewStance: 'hud.crewStance',
  EnemiesLeft: 'hud.enemies',
  Objective: 'hud.objective',
  Combo: 'hud.combo',
  HasFruit: 'hud.hasFruit',
  Cooldowns: 'hud.cooldowns',
  AbilityBar: 'hud.abilityBar',
  Prompt: 'hud.prompt',
  State: 'hud.state',
  Minimap: 'hud.minimap',
} as const;
