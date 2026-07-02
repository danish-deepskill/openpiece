/**
 * Seeded, serializable PRNG (mulberry32) — SIM randomness only flows through named streams of this, never
 * Math.random, so a run is a pure function of its master seed (replay, server reconciliation, reproducible
 * bugs — see DESIGN_PATTERNS §8). Cosmetic randomness (FX jitter, wake spray) deliberately stays on
 * Math.random so visual call counts can never perturb sim sequences. State is one u32 — trivially saved.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed | 0;
  }

  /** Next float in [0, 1) — the primitive every other draw builds on. */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** ±1 coin flip (e.g. which hand throws a punch). */
  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }

  /** Serializable stream position (persist alongside the master seed). */
  get state(): number {
    return this.s >>> 0;
  }

  set state(v: number) {
    this.s = v | 0;
  }
}

/** Derive a stream seed from the master seed + a domain label (FNV-1a) — so each domain ('worldgen', 'ai',
 *  'combat') gets an independent sequence and consuming one stream can never shift another. */
export function streamSeed(masterSeed: number, label: string): number {
  let h = (0x811c9dc5 ^ masterSeed) | 0;
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x01000193);
  }
  return h | 0;
}
