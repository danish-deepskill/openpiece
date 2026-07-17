/** Base wander period of the wind DIRECTION (s per noise lattice cell) — one weather "mood" is roughly a
 *  minute; the full circle drifts over several. */
const DIR_PERIOD = 55;
/** Small fast flutter on top of the slow wander (rad of swing, s of period) — the vane never sits dead still. */
const FLUTTER_AMP = 0.35;
const FLUTTER_PERIOD = 9;
/** Everyday strength band (multiplier; >1 is reserved for storm spikes via future field MODIFIERS). */
const STRENGTH_BASE = 0.63;
const STRENGTH_SPAN = 0.31;
const STRENGTH_PERIOD = 40;
/** Gust texture: ±7% on a ~6–12s cycle — the one source-backed calibration number (Bethwaite, *High
 *  Performance Sailing*, via SAILING_RESEARCH.md §1). */
const GUST_AMP = 0.07;
const GUST_PERIOD = 9;

/** Seeded integer hash → [0,1) (mulberry-style avalanche). Pure: the same (seed, i) is the same number on
 *  every call, machine, and replay — the property everything below stands on. */
function hash01(seed: number, i: number): number {
  let h = (seed ^ Math.imul(i, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  h = (h ^ (h >>> 15)) >>> 0;
  return h / 4294967296;
}

/** 1D value noise over t: smoothstep-interpolated seeded lattice — C1-smooth, closed-form, unbounded t. */
function noise1(seed: number, t: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const s = f * f * (3 - 2 * f);
  return hash01(seed, i) * (1 - s) + hash01(seed, i + 1) * s;
}

/**
 * The WORLD-frame wind — SAILING.md piece #1, restructured to the research verdict (SAILING_RESEARCH.md §1):
 * an EVALUATED FIELD, not a stepped simulation. `at(x, y, t)` is a pure function of (seed, position, time):
 * no stored weather state, no rng draws, no history — so the ledger tier and the live sim read the SAME
 * function by construction (X4's tier-divergence failure mode is impossible), a navigator's FORECAST is just
 * evaluation at a future t ("she reads the future the sim already knows"), and the same-seed replay holds
 * with zero effort. This also aligns sailing with SEAMLESS_WORLD's thesis: a dehydrated thing is EVALUATED,
 * not slow-ticked.
 * Position (x, y) is accepted but currently unused — ONE global weather until regions/chunks land, at which
 * point spatial octaves + region modifiers (Calm Belts, storm cells — multiplied on the POTENTIAL, per the
 * curl-noise rule) slot in behind the same signature. Storms via the event director land there too.
 * The class itself is just the field plus a clock: update() advances sim time and refreshes the cached
 * global sample (`dir`/`strength`) that per-tick consumers read.
 */
export class WindSystem {
  /** Sim time (s) the cached sample was taken at — advanced by update(), never wall-clock. */
  time = 0;
  /** Cached global sample at `time` (the direction the wind BLOWS TOWARD, rad; strength multiplier). */
  dir: number;
  strength: number;
  /** DEBUG override (the panel's manual wind control, synced in by DebugOverlay — the god-mode pattern:
   *  UI owns the knob, presentation writes the sim fact). While set, at() returns it verbatim — replay
   *  purity is deliberately suspended (never serialized; the harness never sets it). */
  override?: { dir: number; strength: number };

  constructor(private readonly seed: number) {
    const w = this.at(0, 0, 0);
    this.dir = w.dir;
    this.strength = w.strength;
  }

  /** The field: wind at a world position and sim time. Pure — same (seed, x, y, t) ⇒ same wind, whether
   *  sampled live, replayed, forecast ahead, or evaluated by a dehydrated ship's ledger math. */
  at(_x: number, _y: number, t: number = this.time): { dir: number; strength: number } {
    if (this.override) return this.override; // manual debug wind — every consumer (ships, streaks, forecast) follows it
    const dir =
      noise1(this.seed, t / DIR_PERIOD) * Math.PI * 4 + // slow wander, range 2 full circles so direction visits everywhere
      (noise1(this.seed ^ 0x5f3759df, t / FLUTTER_PERIOD) - 0.5) * FLUTTER_AMP;
    const base = STRENGTH_BASE + STRENGTH_SPAN * noise1(this.seed ^ 0x9e3779b9, t / STRENGTH_PERIOD);
    const gust = 1 + GUST_AMP * (2 * noise1(this.seed ^ 0x517cc1b7, t / GUST_PERIOD) - 1);
    return { dir, strength: base * gust };
  }

  /** The wind as a unit vector (world frame), for consumers that dot against headings. */
  get vecX(): number {
    return Math.cos(this.dir);
  }
  get vecY(): number {
    return Math.sin(this.dir);
  }

  update(dt: number): void {
    this.time += dt;
    const w = this.at(0, 0);
    this.dir = w.dir;
    this.strength = w.strength;
  }
}
