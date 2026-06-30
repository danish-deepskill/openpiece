import Phaser from 'phaser';
import { GameConfig } from './config/GameConfig';
import { bindDebugPanel } from './ui/debugPanel';
import { bindOverlay } from './ui/overlay';

// Wire the DOM start/help overlay to the EventBus before the game boots.
bindOverlay();
// Debug toggle panel ( ` to open).
bindDebugPanel();

// eslint-disable-next-line no-new
new Phaser.Game(GameConfig);
