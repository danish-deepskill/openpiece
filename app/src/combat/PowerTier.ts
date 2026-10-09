/**
 * Per-unit power tier. Every letter rank F…X has three bands (`-`, base, `+`), weakest `F-` … strongest
 * `X+`. The tier is the single dial that scales a unit's combat magnitudes (hp/atk/def/attack-speed) so
 * content authors place an enemy at a tier instead of hand-tuning numbers. Drives threat, bounty, gates.
 * Rank lore: SS = Admiral class, SSS = Yonko class, `X` = the APEX band above them (index 27–29) — "beyond
 * Imu", the secret endgame tier.
 */
export type TierLetter = 'F' | 'E' | 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS' | 'X';
export type TierBand = '-' | '' | '+';
export type PowerTier = `${TierLetter}${TierBand}`;

const LETTERS: readonly TierLetter[] = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'X'];
const BANDS: readonly TierBand[] = ['-', '', '+'];

/** Bands per letter rank (3: `-`, base, `+`). The ladder's rungs, a coating's lift and a technique's parry shift are
 *  all authored in LETTERS through `letters()` — so the band granularity can change in one place. */
export const BANDS_PER_LETTER = BANDS.length;
/** `n` letters expressed in bands — the unit every tier-gap rule is authored in (combat/dominance). */
export const letters = (n: number): number => n * BANDS_PER_LETTER;

/** All 30 bands in ascending power order: F-, F, F+, E-, … SSS+, X-, X, X+. */
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
 * `hp`/`def` reach units as the `health`/`defense` attribute seeds (combat/attributes.tierAttributes);
 * `atk`/`atkSpeed` are read directly — there is deliberately no attack ATTRIBUTE (damage belongs to
 * weapon/style/tier, not stat allocation).
 */
/**
 * THE MAGNITUDE CURVE — the four numbers that say how much bigger each band is. FLATTENED 2026-10-09 (was hp ×1.29,
 * atk ×1.26, +0.1 attack speed per band = ×2.15 hp and ×2 atk PER LETTER, an 8× DPS gap two letters up): the tier's
 * QUALITY now lives on the dominance ladder (combat/dominance — poise, guard, interrupt, parry, rebound), so the
 * magnitudes only need to say "stronger", not "untouchable". Per letter now: hp ×1.56, atk ×1.40, +0.12 attack speed;
 * D- → B is a 2.8× DPS gap behind a two-letter wall, not 8.4× behind it. F- → X+ still spans ×75 hp / ×27 atk.
 * Tune HERE; every unit, test and the attribute seeds follow.
 */
export const TIER_CURVE = {
  hpBase: 60, // F- hp
  hpPerBand: 1.16, // ×1.56 per letter
  atkBase: 8, // F- atk
  atkPerBand: 1.12, // ×1.40 per letter
  defPerBand: 0.5, // flat damage reduction per band past `defFrom` — flattened WITH atk (a hit floors at 1 damage, so def at the old 1.3 slope would eat every small multi-hit cut: Kamaitachi's 6-damage cuts against a C-'s 9)
  defFrom: 2, // bands of free fodder before defense starts (0 through the F bands)
  atkSpeedBase: 0.8, // F- attack speed (swings AND cooldowns are divided by it)
  atkSpeedPerBand: 0.04, // +0.12 per letter — the hidden DPS multiplier, kept gentle on purpose
} as const;

export function tierStats(t: PowerTier): TierStats {
  const i = tierIndex(t);
  const c = TIER_CURVE;
  return {
    hp: Math.round(c.hpBase * Math.pow(c.hpPerBand, i)),
    atk: Math.round(c.atkBase * Math.pow(c.atkPerBand, i)),
    def: Math.round(Math.max(0, i - c.defFrom) * c.defPerBand),
    atkSpeed: +(c.atkSpeedBase + c.atkSpeedPerBand * i).toFixed(2),
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
  X: '#5ce1ff', // apex cyan — "beyond Imu", the secret endgame band above the Yonko-class SSS gold
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
