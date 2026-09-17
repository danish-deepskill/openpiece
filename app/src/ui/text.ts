import Phaser from 'phaser';
import { RENDER_SCALE } from '../config/render';

/**
 * THE one door for Phaser text (presentation). Phaser rasterizes each Text into its own canvas at
 * `style.resolution` and forces 1 when unset — under a camera zoomed by RENDER_SCALE (config/render.ts) that
 * 1× raster is magnified and every glyph blurs. Routing creation through here stamps the resolution once, so
 * no call site can forget it: a forgotten field throws nothing, the text is just soft — the silent-failure
 * class, so test/render-text.test.ts enforces the door (`add.text(` lives only in this file). Layout units
 * are unchanged — fontSize/wordWrap/stroke stay logical px; only the raster density scales.
 */
export function addText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string | string[],
  style: Phaser.Types.GameObjects.Text.TextStyle,
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, { ...style, resolution: RENDER_SCALE });
}
