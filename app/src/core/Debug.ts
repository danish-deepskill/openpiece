export interface DebugFlagDef {
  key: string;
  label: string;
  group: string;
  default: boolean;
}

/** Registered debug layers. Add a new debug view by adding one entry here (+ drawing it where relevant). */
const DEFS: DebugFlagDef[] = [
  { key: 'squad.rings', label: 'Squad rings + names', group: 'AI', default: false },
  { key: 'ai.stats', label: 'Unit stats (profile/state/hp)', group: 'AI', default: false },
  { key: 'ai.paths', label: 'A* paths', group: 'AI', default: false },
  { key: 'ai.tokens', label: 'Attack tokens', group: 'AI', default: false },
  { key: 'ai.focus', label: 'Focus-target lines', group: 'AI', default: false },
  { key: 'ai.sight', label: 'Sight radius', group: 'AI', default: false },
  { key: 'combat.reach', label: 'Attack reach', group: 'Combat', default: false },
  { key: 'combat.aim', label: 'Accuracy cone + close-pass ring (ranged units; green = aiming, red = point-blank fumble zone)', group: 'Combat', default: false },
  { key: 'combat.hitbox', label: 'Attack hitboxes (live volumes)', group: 'Combat', default: false },
  { key: 'combat.guard', label: 'Guard arc (block/parry cover)', group: 'Combat', default: false },
  { key: 'combat.god', label: 'God mode (invincible + free abilities)', group: 'Combat', default: false },
  { key: 'world.collision', label: 'Collision truth: solids + unit bodies (green=foot, blue=swim) + hull wood/walker-wall', group: 'World', default: false },
  { key: 'world.frames', label: 'Movement frame (world/deck) readout', group: 'World', default: false },
  { key: 'perf.hud', label: 'FPS + entity count', group: 'Perf', default: false },
  { key: 'view.zoomOut', label: 'Zoom out 2× (see off-screen shooters)', group: 'View', default: false },
];

const STORAGE = 'ballpiece.debug';

/**
 * Central, persisted registry of debug-view flags. The DOM panel (ui/debugPanel) toggles them; the canvas
 * DebugOverlay reads them per-layer. Off by default; toggles survive reloads via localStorage.
 */
class DebugFlags {
  readonly defs = DEFS;
  private state: Record<string, boolean> = {};

  constructor() {
    for (const d of DEFS) this.state[d.key] = d.default;
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE) : null;
      if (raw) Object.assign(this.state, JSON.parse(raw));
    } catch {
      /* ignore malformed/unavailable storage */
    }
  }

  on(key: string): boolean {
    return this.state[key] === true;
  }

  set(key: string, val: boolean): void {
    this.state[key] = val;
    this.save();
  }

  toggle(key: string): void {
    this.set(key, !this.on(key));
  }

  setAll(val: boolean): void {
    for (const d of DEFS) this.state[d.key] = val;
    this.save();
  }

  any(): boolean {
    return DEFS.some((d) => this.state[d.key]);
  }

  private save(): void {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE, JSON.stringify(this.state));
    } catch {
      /* ignore */
    }
  }
}

export const Debug = new DebugFlags();
