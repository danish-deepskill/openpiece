import Phaser from 'phaser';

/** Launches the parallel world + HUD scenes. (No assets to preload — art is procedural.) */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.scene.launch('World');
    this.scene.launch('Hud');
  }
}
