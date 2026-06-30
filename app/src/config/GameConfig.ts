import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { HudScene } from '../scenes/HudScene';
import { WorldScene } from '../scenes/WorldScene';
import { GAME_H, GAME_W } from './constants';

export const GameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.CANVAS,
  width: GAME_W,
  height: GAME_H,
  parent: 'game-canvas',
  backgroundColor: '#06121f',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: { antialias: true, pixelArt: false },
  scene: [BootScene, WorldScene, HudScene],
};
