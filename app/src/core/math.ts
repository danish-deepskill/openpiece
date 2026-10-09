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

/** Closest approach of two segments A(ax,ay→bx,by) and B(cx,cy→dx,dy): the distance and the two closest points. Crossing
 *  segments report distance 0 at the crossing. The blade-meets-blade test (combat/clash) and nothing cheaper — four
 *  point-to-segment checks cover every non-crossing case exactly. */
export function segSegClosest(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): { d: number; x: number; y: number } {
  // proper crossing → distance 0 at the intersection point
  const r1x = bx - ax, r1y = by - ay, r2x = dx - cx, r2y = dy - cy;
  const den = r1x * r2y - r1y * r2x;
  if (Math.abs(den) > 1e-9) {
    const t = ((cx - ax) * r2y - (cy - ay) * r2x) / den;
    const u = ((cx - ax) * r1y - (cy - ay) * r1x) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return { d: 0, x: ax + r1x * t, y: ay + r1y * t };
  }
  // else the closest pair involves an endpoint: test each endpoint against the other segment, keep the nearest
  let best = { d: Infinity, x: 0, y: 0 };
  const consider = (px: number, py: number, qax: number, qay: number, qbx: number, qby: number): void => {
    const [fx, fy] = closestOnSeg(px, py, qax, qay, qbx, qby);
    const d = Math.hypot(px - fx, py - fy);
    if (d < best.d) best = { d, x: (px + fx) / 2, y: (py + fy) / 2 };
  };
  consider(ax, ay, cx, cy, dx, dy);
  consider(bx, by, cx, cy, dx, dy);
  consider(cx, cy, ax, ay, bx, by);
  consider(dx, dy, ax, ay, bx, by);
  return best;
}

/** The point on segment (ax,ay→bx,by) nearest to (px,py). */
export function closestOnSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): [number, number] {
  const vx = bx - ax, vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2)) : 0;
  return [ax + vx * t, ay + vy * t];
}
