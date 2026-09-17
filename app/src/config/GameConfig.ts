import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { HudScene } from '../scenes/HudScene';
import { WorldScene } from '../scenes/WorldScene';
import { BUFFER_H, BUFFER_W } from './render';

export const GameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.CANVAS,
  // the canvas BUFFER (physical pixels — config/render.ts); the LOGICAL 1280×720 design size is what every
  // camera projects onto it (each zooms by RENDER_SCALE), and Scale.FIT then shows the buffer 1:1 on screen
  width: BUFFER_W,
  height: BUFFER_H,
  parent: 'game-canvas',
  backgroundColor: '#06121f',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: { antialias: true, pixelArt: false },
  scene: [BootScene, WorldScene, HudScene],
};
