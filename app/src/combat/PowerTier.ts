/**
 * Per-unit power tier. Every letter rank F…SSS has three bands (`-`, base, `+`), weakest `F-` … strongest
 * `SSS+`. The tier is the single dial that scales a unit's combat magnitudes (hp/atk/def/attack-speed) so
 * content authors place an enemy at a tier instead of hand-tuning numbers. Drives threat, bounty, gates.
 */
export type TierLetter = 'F' | 'E' | 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS';
export type TierBand = '-' | '' | '+';
export type PowerTier = `${TierLetter}${TierBand}`;

const LETTERS: readonly TierLetter[] = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
const BANDS: readonly TierBand[] = ['-', '', '+'];

/** All 27 bands in ascending power order: F-, F, F+, E-, … SSS, SSS+. */
export const TIER_ORDER: readonly PowerTier[] = LETTERS.flatMap((l) => BANDS.map((b) => `${l}${b}` as PowerTier));

export function tierIndex(t: PowerTier): number {
  return TIER_ORDER.indexOf(t);
}

export interface TierStats {
  hp: number;
  atk: number;
  def: number;
  /** Attack-speed multiplier: effective cooldown = ability.cooldown / atkSpeed. */
  atkSpeed: number;
}

/**
 * Baseline combat stats for a tier band. A smooth curve so it extends cleanly from `F-` fodder to `SSS+`
 * monsters; a unit composes these onto its body archetype, then gear/fruit/haki modifiers stack on top.
 * (Move speed is NOT here — it's a body/race property, so a weak and a strong human run about the same.)
 */
export function tierStats(t: PowerTier): TierStats {
  const i = tierIndex(t);
  return {
    hp: Math.round(46 * Math.pow(1.29, i)),
    atk: Math.round(5 * Math.pow(1.26, i)),
    def: Math.round(Math.max(0, i - 2) * 1.3), // stays 0 through the F bands; matters from E- up
    atkSpeed: +(0.45 + 0.1 * i).toFixed(2), // deliberate base pace; only high tiers climb past 1.0 (fast)
  };
}

/**
 * Rank color per letter tier (the -/+ bands share their letter's color), matching the design reference:
 * F/E/D are grayscale (weak → light), then green → blue → purple → red → orange → gold at the apex.
 * (F/E kept legibly light rather than near-black so they read on the dark nameplate stroke.)
 */
const TIER_COLORS: Record<TierLetter, string> = {
  F: '#7c8085', // dark gray
  E: '#a7adb3', // gray
  D: '#cfd4d8', // light gray
  C: '#5ec84d', // green
  B: '#4a90e2', // blue
  A: '#9b59f6', // purple
  S: '#ff4d4d', // red
  SS: '#ff8c1a', // orange
  SSS: '#ffd24a', // gold
};

/** CSS hex color for a tier band (accepts 'F-', 'SS+', …); falls back to white for anything unrecognized. */
export function tierColor(tier: string): string {
  const letter = tier.replace(/[+-]+$/, '') as TierLetter;
  return TIER_COLORS[letter] ?? '#e3e3e3';
}

/** Placeholder reverse map (numeric power score → tier band); real formula from attributes+gear is TBD. */
export function tierFromScore(score: number): PowerTier {
  const i = Math.max(0, Math.min(TIER_ORDER.length - 1, Math.floor(score)));
  return TIER_ORDER[i];
}
