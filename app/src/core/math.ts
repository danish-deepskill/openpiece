export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

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

export const rand = (a: number, b: number): number => a + Math.random() * (b - a);

export const randInt = (a: number, b: number): number => Math.floor(rand(a, b + 1));

export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Smallest signed difference between two angles, in [-PI, PI]. */
export const angleDiff = (a: number, b: number): number => {
  let d = (a - b) % TAU;
  if (d < -Math.PI) d += TAU;
  if (d > Math.PI) d -= TAU;
  return d;
};
