import Phaser from 'phaser';
import { Accessories } from '../defs/accessories';
import { Weapons } from '../defs/layers';
import { accessoryDraws } from '../draw/accessoryDraws';

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
    }
  }

  create(): void {
    this.scene.launch('World');
    this.scene.launch('Hud');
  }
}
