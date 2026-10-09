import type Phaser from 'phaser';
import type { FxTheme } from '../combat/fxTheme';
import { Weapons, type WeaponDef } from '../defs/layers';
import type { HandSide } from './actorDraws';
import { FX_THEME_PALETTE, FX_THEMES } from './fxThemes';

/**
 * THEMED COATING for sprite weapons — the blade turns BLACK while the body carries the haki theme (combat/fxTheme). Baked at boot, not
 * tinted live: the game runs Phaser's CANVAS renderer (config/GameConfig), whose Tint component is WebGL-only, so a
 * coated look is a second texture per weapon — the art's exact silhouette filled near-black with a ghost of the
 * original on top (edges and highlights still read as steel, not a flat cutout). One small texture per sprite
 * weapon per theme at boot, zero per-frame cost; WeaponSpriteSystem swaps the key by the body's theme. A new theme is a
 * palette row (draw/fxThemes) — the bake runs for every theme.
 */

/** How much of the original art ghosts through the fill (0 = flat silhouette, 1 = uncoated). */
const COAT_DETAIL = 0.22;

/** Texture key of a weapon's look under an FX theme (texture keys are def ids by convention — that id, suffixed by
 *  the theme). Memoized per (weapon, theme): WeaponSpriteSystem asks every frame a blade is coated, and a per-frame
 *  string is an allocation. */
const COATED_KEYS = new Map<string, Map<FxTheme, string>>();
export function coatedKey(weaponId: string, theme: FxTheme): string {
  let byTheme = COATED_KEYS.get(weaponId);
  if (!byTheme) {
    byTheme = new Map();
    COATED_KEYS.set(weaponId, byTheme);
  }
  let k = byTheme.get(theme);
  if (k === undefined) {
    k = `${weaponId}:${theme}`;
    byTheme.set(theme, k);
  }
  return k;
}

/** Texture key of a pair's OFF-HAND blade (WeaponVisual.offArt) — the def id suffixed, the same "key = def id"
 *  convention with one key per drawn art. BootScene loads it; the sprite system and the bake read it from here. */
const OFF_ART_KEYS = new Map<string, string>(); // memoized like coatedKey: WeaponSpriteSystem asks every frame a pair is drawn
export function offArtKey(weaponId: string): string {
  let k = OFF_ART_KEYS.get(weaponId);
  if (k === undefined) {
    k = `${weaponId}:off`;
    OFF_ART_KEYS.set(weaponId, k);
  }
  return k;
}

/** Every UNCOATED texture a weapon draws: its own id, plus the off-hand art when a pair authors one. */
export function weaponTextureKeys(w: WeaponDef): string[] {
  return w.visual?.kind === 'sprite' && w.visual.offArt ? [w.id, offArtKey(w.id)] : [w.id];
}

/** The texture the weapon shows in `side`'s hand — the off art for a pair's off hand when it has one, else the def's. */
export function weaponTextureKey(w: WeaponDef, side: HandSide): string {
  return side === -1 && w.visual?.kind === 'sprite' && w.visual.offArt ? offArtKey(w.id) : w.id;
}

/** Bake the coated variant of every sprite weapon texture the BootScene loaded (both blades of a pair). Idempotent (a
 *  scene restart skips baked keys). Call in a scene `create()` — the source images must be loaded. */
export function bakeCoatedWeapons(scene: Phaser.Scene): void {
  for (const w of Weapons.all()) {
    if (w.visual?.kind !== 'sprite') continue;
    for (const key of weaponTextureKeys(w)) {
      if (!scene.textures.exists(key)) throw new Error(`coating: weapon texture '${key}' never loaded`); // textures.get() would hand back the __MISSING placeholder and we'd coat a black square
      for (const theme of FX_THEMES) bakeCoat(scene, key, theme);
    }
  }
}

function bakeCoat(scene: Phaser.Scene, textureKey: string, theme: FxTheme): void {
  const key = coatedKey(textureKey, theme);
  if (scene.textures.exists(key)) return;
  {
    const src = scene.textures.get(textureKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement; // engine boundary: Phaser types the source loosely
    const tex = scene.textures.createCanvas(key, src.width, src.height);
    if (!tex) throw new Error(`coating: could not create the coated texture for ${textureKey}`); // fail loud at boot, not as a vanishing blade
    const ctx = tex.context;
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = 'source-in'; // paint ONLY where the art has alpha → the exact silhouette
    ctx.fillStyle = `#${FX_THEME_PALETTE[theme].body.toString(16).padStart(6, '0')}`; // the theme's substance (one palette for blade, wave, shot, spark)
    ctx.fillRect(0, 0, src.width, src.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = COAT_DETAIL;
    ctx.drawImage(src, 0, 0); // the ghost: edge detail survives the fill
    ctx.globalAlpha = 1;
    tex.refresh();
  }
}
