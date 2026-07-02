export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const dist = (ax: number, ay: number, bx: number, by: number): number =>
  Math.hypot(ax - bx, ay - by);

export const dist2 = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};

/** Normalize a vector; returns [0,0] for a zero vector. */
export const norm = (x: number, y: number): [number, number] => {
  const m = Math.hypot(x, y);
  return m === 0 ? [0, 0] : [x / m, y / m];
};

/** COSMETIC randomness only (FX jitter, presentation). Sim randomness goes through core/Rng streams. */
export const rand = (a: number, b: number): number => a + Math.random() * (b - a);

/** Frame-rate-independent smoothing factor: use `x += (target - x) * smoothFactor(rate, dt)` instead of
 *  `Math.min(1, rate * dt)` — the exponential form converges identically at ANY fps (DESIGN_PATTERNS §8). */
export const smoothFactor = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);

/** Distance from point (px,py) to the segment (ax,ay)→(bx,by). Used for blade/fist-vs-target contact. */
export const segDist = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

/** Smallest signed difference between two angles, in [-PI, PI]. */
export const angleDiff = (a: number, b: number): number => {
  let d = (a - b) % TAU;
  if (d < -Math.PI) d += TAU;
  if (d > Math.PI) d -= TAU;
  return d;
};
