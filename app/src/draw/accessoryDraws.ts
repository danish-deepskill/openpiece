import type Phaser from 'phaser';
import type { AccessoryDef } from '../defs/accessories';
import type { Entity } from '../ecs/components';
import { ANATOMY, SLOT_ANCHOR } from './actorDraws';

/**
 * Procedural accessory silhouettes — the strategy rows behind `visual: { kind: 'procedural', draw: '<key>' }`.
 * Draw in LOCAL space around (0,0): AccessorySystem positions/rotates/fades the Graphics (forward = +x
 * after rotation), so a fn only shapes pixels — size off `e.transform.r`, tint off `visual.color`.
 * Function-bearing strategy rows live beside their engine (content-is-data canon), like MOTIONS/draws.
 * BootScene asserts every proc def's key resolves here — a typo fails at boot, never as a blank hat.
 */
export type AccessoryDrawFn = (g: Phaser.GameObjects.Graphics, e: Entity, d: AccessoryDef) => void;

export const accessoryDraws: Record<string, AccessoryDrawFn> = {
  // KASA — the samurai's conical straw hat, seen from above: a brim as wide as the shoulders (a sugegasa shades
  // the whole frame), the cone's contours as woven rings, radial ribs, and the dark apex knot. The ribs are what
  // make its turn with the aim readable.
  kasa: (g, e) => {
    const R = e.transform!.r * 1.05; // the body radius IS the brim (procedural draws are in slot-local px)
    g.fillStyle(0x000000, 0.18);
    g.fillCircle(2, 3, R); // a soft drop shadow, offset down-right
    g.fillStyle(0xd9b86a, 1); // straw
    g.fillCircle(0, 0, R);
    g.lineStyle(1.5, 0x9a7a3a, 0.9);
    g.strokeCircle(0, 0, R);
    g.lineStyle(1, 0xb8984a, 0.8); // the woven rings — the cone's contour lines from above
    g.strokeCircle(0, 0, R * 0.72);
    g.strokeCircle(0, 0, R * 0.45);
    g.lineStyle(1, 0x9a7a3a, 0.55); // the ribs
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.lineBetween(Math.cos(a) * R * 0.2, Math.sin(a) * R * 0.2, Math.cos(a) * R, Math.sin(a) * R);
    }
    g.fillStyle(0x6b4a2a, 1); // the apex knot
    g.fillCircle(0, 0, R * 0.16);
  },
  // SODE — the samurai's shoulder guards, purely visual (no stats): two lacquered lamellar plates sitting ON the
  // rig's shoulder slabs (ANATOMY's pauldron mounts, a touch bigger than the slab so they read as armor over the
  // garb), brass-rimmed, with the lamellar rows across the facing. Drawn in the chest slot's local frame (+x =
  // facing), so the slab centers are corrected for the slot's own forward anchor.
  sode: (g, e) => {
    const r = e.transform!.r;
    const cx = (ANATOMY.shoulderFwd - SLOT_ANCHOR.chest) * r;
    const cy = ANATOMY.shoulderOut * r;
    const hl = ANATOMY.shoulderHalfL * r * 1.15; // semi-axis along the facing
    const hw = ANATOMY.shoulderHalfW * r * 1.4; // semi-axis across it — armor overhangs the slab
    for (const side of [-1, 1]) {
      const y = side * cy;
      g.fillStyle(0x2b2d4f, 1); // lacquered indigo plates
      g.fillEllipse(cx, y, hl * 2, hw * 2);
      g.lineStyle(1.5, 0xc9a84a, 0.95); // brass rim
      g.strokeEllipse(cx, y, hl * 2, hw * 2);
      g.lineStyle(1, 0x8a6a3a, 0.8); // the lamellar rows
      g.lineBetween(cx - hl * 0.35, y - hw * 0.8, cx - hl * 0.35, y + hw * 0.8);
      g.lineBetween(cx + hl * 0.35, y - hw * 0.8, cx + hl * 0.35, y + hw * 0.8);
    }
  },
  // add more proc accessories here; a def opts in with visual: { kind: 'procedural', draw: '<key>' }.
};
