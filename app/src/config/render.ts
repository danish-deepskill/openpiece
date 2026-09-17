import { GAME_H, GAME_W } from './constants';

/**
 * PRESENTATION-ONLY render scale — this module reads the window; never import it from a sim folder
 * (test/render-text.test.ts enforces that). Consumers: GameConfig, the scenes, the presentation systems.
 *
 * The game is DESIGNED at a fixed logical 1280×720 (GAME_W×GAME_H — HUD layout, camera framing, every
 * screen-space coordinate) and `Scale.FIT` stretches that picture to the window. A canvas has TWO sizes: the
 * BUFFER (the pixel grid we draw into) and the CSS size (how big the browser shows it). When the buffer is
 * smaller than the screen area it covers, the browser resamples the finished image and every edge, glyph
 * and sprite arrives interpolated — a 1280-px buffer on a 3840-px screen is a 3× bilinear blur, whatever
 * devicePixelRatio says. The fix is the one every crisp .io game uses: size the buffer to the PHYSICAL
 * pixels it will cover and scale the DRAWING (camera zoom, text resolution), never the picture.
 *
 * RENDER_SCALE = physical pixels per logical pixel = the FIT factor × devicePixelRatio, measured ONCE at
 * boot (a later window resize re-FITs the CSS size; the buffer keeps its boot size — reload to re-measure).
 * Rejected: `Scale.RESIZE` (the visible world area would grow with the window — a fairness/design change,
 * not a sharpness fix); `pixelArt`/`roundPixels` (blocky nearest sampling everywhere + the ~1px follow
 * jitter WorldScene already rejected). Floor 1: never render BELOW the design resolution.
 */

/** KNOB — the cap. Canvas fill cost grows with RENDER_SCALE² (a 4K buffer is 9× the pixels of the 1280×720
 *  one), so the min-spec target (a decade-old office PC — DESIGN_BACKLOG #12) may want 2 or even 1;
 *  3 = pixel-perfect on a 4K display. */
export const RENDER_SCALE_MAX = 3;

/** KNOB — sampling for the TERRAIN bake + the minimap texture. Both are axis-aligned flat fills (a tile map:
 *  pixel art at 32-px tiles, in effect), so 'nearest' magnifies to HARD tile edges at zero memory cost,
 *  where 'linear' smears every edge across 2×RENDER_SCALE px. Trade-off: while the shift-lock camera ROTATES,
 *  nearest shows stair-steps on tile borders where linear shows a soft edge. The structure + canopy bakes
 *  (curves) stay linear regardless. */
export const BAKE_FILTER: 'nearest' | 'linear' = 'nearest';

function measure(): number {
  const fit = Math.min(window.innerWidth / GAME_W, window.innerHeight / GAME_H); // what Scale.FIT will stretch by
  const dpr = window.devicePixelRatio || 1; // CSS px → physical px
  return Math.min(RENDER_SCALE_MAX, Math.max(1, fit * dpr));
}

/** The canvas BUFFER width — whole pixels (a fractional canvas size is rounded by the browser anyway). */
export const BUFFER_W = Math.round(GAME_W * measure());
/** Re-derived from the ROUNDED buffer so camera zoom and buffer agree exactly (logical x → x × RENDER_SCALE). */
export const RENDER_SCALE = BUFFER_W / GAME_W;
export const BUFFER_H = Math.round(GAME_H * RENDER_SCALE);
