import type { FxTheme } from '../combat/fxTheme';

/** The look of each FX theme (combat/fxTheme decides WHEN a body carries one): `body` = the substance (a crescent's
 *  stroke, a coated blade's fill, a themed ball), `edge` = its rim/highlight and the spark color. One row per theme,
 *  read by FxSystem, projectileProc, coating and the hit sparks — so the blade, the wave, the shot and the spark are
 *  visibly one material. */
export const FX_THEME_PALETTE: Record<FxTheme, { body: number; edge: number }> = {
  haki: { body: 0x120f1c, edge: 0x8a5ad8 }, // near-black with a violet cast — reads as haki, not as a missing texture
};
export const FX_THEMES: readonly FxTheme[] = Object.freeze(Object.keys(FX_THEME_PALETTE) as FxTheme[]);
