import Phaser from 'phaser';
import { Abilities } from '../combat/Ability';
import { Accessories } from '../defs/accessories';
import { Weapons } from '../defs/layers';
import { accessoryDraws } from '../draw/accessoryDraws';
import { bakeCoatedWeapons, offArtKey } from '../draw/coating';
import { bakeProjectileTextures } from '../draw/projectileProc';

/** Texture key for a projectile art file (the art path IS the key, so two abilities sharing one bullet art
 *  load it once and ProjectileRenderer can derive the key from the shape). */
export const shotArtKey = (art: string): string => `shot:${art}`;

/** Bundled URL for every art asset, keyed by its src/art-relative path. Vite-only machinery lives HERE
 *  (presentation) so defs stay plain data a headless server can import (DESIGN_PATTERNS §9). */
const ART_URLS = import.meta.glob('../art/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<
  string,
  string
>;

/** Loads the (few) image assets — every def whose `visual` is a sprite — and asserts proc visuals resolve
 *  to a real draw fn. BOTH fail loud here (the presentation half of fail-loud-at-boot: the sim-side content
 *  sweep can't see art files or draw registries). Everything else is procedural. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    for (const d of Accessories.all()) {
      const v = d.visual;
      if (v.kind === 'sprite') {
        const url = ART_URLS[`../art/${v.art}`];
        if (!url) throw new Error(`Accessory art not found: ${v.art} (${d.id})`); // fail loud at boot, not as a blank hat
        this.load.image(d.id, url);
      } else if (v.kind === 'procedural' && !accessoryDraws[v.draw]) {
        throw new Error(`Accessory draw key not found: '${v.draw}' (${d.id}) — add it to draw/accessoryDraws`);
      }
    }
    for (const w of Weapons.all()) {
      if (w.visual?.kind !== 'sprite') continue;
      const url = ART_URLS[`../art/${w.visual.art}`];
      if (!url) throw new Error(`Weapon art not found: ${w.visual.art} (${w.id})`); // fail loud at boot
      this.load.image(w.id, url); // texture key = def id (the convention every sprite consumer uses)
      if (w.visual.offArt) {
        const offUrl = ART_URLS[`../art/${w.visual.offArt}`]; // a pair's second blade — its own art under the off key
        if (!offUrl) throw new Error(`Weapon off-hand art not found: ${w.visual.offArt} (${w.id})`); // fail loud at boot
        this.load.image(offArtKey(w.id), offUrl);
      }
    }
    // projectile arts (a 'shot' ability's flying ball) — keyed by the art path so shared arts load once
    const shotArts = new Set<string>();
    for (const a of Abilities.all()) {
      const art = a.shape?.shotArt;
      if (art) shotArts.add(art);
    }
    for (const art of shotArts) {
      const url = ART_URLS[`../art/${art}`];
      if (!url) throw new Error(`Projectile art not found: ${art}`); // fail loud at boot
      this.load.image(shotArtKey(art), url);
    }
  }

  create(): void {
    bakeProjectileTextures(this); // generate the proc bullet textures (needs the live renderer — create, not preload)
    bakeCoatedWeapons(this); // the Armament-black variant of every sprite weapon (Canvas can't tint — see draw/coating)
    this.scene.launch('World');
    this.scene.launch('Hud');
  }
}
