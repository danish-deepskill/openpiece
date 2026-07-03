import type Phaser from 'phaser';
import type { AccessoryDef } from '../defs/accessories';
import type { Entity } from '../ecs/components';

/**
 * Procedural accessory silhouettes — the strategy rows behind `visual: { kind: 'procedural', draw: '<key>' }`.
 * Draw in LOCAL space around (0,0): AccessorySystem positions/rotates/fades the Graphics (forward = +x
 * after rotation), so a fn only shapes pixels — size off `e.transform.r`, tint off `visual.color`.
 * Function-bearing strategy rows live beside their engine (content-is-data canon), like MOTIONS/draws.
 * BootScene asserts every proc def's key resolves here — a typo fails at boot, never as a blank hat.
 */
export type AccessoryDrawFn = (g: Phaser.GameObjects.Graphics, e: Entity, d: AccessoryDef) => void;

export const accessoryDraws: Record<string, AccessoryDrawFn> = {
  // empty until the first proc accessory — add e.g.
  //   greatHelm: (g, e) => { const r = e.transform!.r; g.fillStyle(0x8a8781, 1); g.fillCircle(0, 0, r * 0.7); … },
  // then a def opts in with visual: { kind: 'procedural', draw: 'greatHelm' }.
};
