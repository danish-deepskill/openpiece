import Phaser from 'phaser';
import { Accessories } from '../defs/accessories';

/** Bundled URL for every art asset, keyed by its src/art-relative path. Vite-only machinery lives HERE
 *  (presentation) so defs stay plain data a headless server can import (DESIGN_PATTERNS §9). */
const ART_URLS = import.meta.glob('../art/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<
  string,
  string
>;

/** Loads the (few) image assets — accessory sprites — then launches the parallel world + HUD scenes.
 *  Everything else is procedural. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    for (const d of Accessories.all()) {
      const url = ART_URLS[`../art/${d.art}`];
      if (!url) throw new Error(`Accessory art not found: ${d.art} (${d.id})`); // fail loud at boot, not as a blank hat
      this.load.image(d.id, url);
    }
  }

  create(): void {
    this.scene.launch('World');
    this.scene.launch('Hud');
  }
}
