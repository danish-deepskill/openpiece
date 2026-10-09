import type Phaser from 'phaser';
import type { AccessoryDef } from '../defs/accessories';
import type { Entity } from '../ecs/components';
import { ANATOMY, SLOT_ANCHOR } from './actorDraws';

/**
 * Procedural accessory silhouettes — the strategy rows behind `visual: { kind: 'procedural', draw: '<key>' }`.
 * Draw in LOCAL space around (0,0): AccessorySystem positions/rotates/fades the Graphics (forward = +x
 * after rotation), so a fn only shapes pixels — size off `e.transform.r`, colors off `d.palette` (with the fn's own
 * defaults), so one draw serves a family of looks (the indigo sode, the crimson sode).
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
  sode: (g, e, d) => {
    const r = e.transform!.r;
    const base = d.palette?.base ?? 0x2b2d4f; // lacquered indigo unless the row says otherwise
    const trim = d.palette?.trim ?? 0xc9a84a; // brass
    const cx = (ANATOMY.shoulderFwd - SLOT_ANCHOR.chest) * r;
    const cy = ANATOMY.shoulderOut * r;
    const hl = ANATOMY.shoulderHalfL * r * 1.15; // semi-axis along the facing
    const hw = ANATOMY.shoulderHalfW * r * 1.4; // semi-axis across it — armor overhangs the slab
    for (const side of [-1, 1]) {
      const y = side * cy;
      g.fillStyle(base, 1); // the lacquered plates
      g.fillEllipse(cx, y, hl * 2, hw * 2);
      g.lineStyle(1.5, trim, 0.95); // the rim
      g.strokeEllipse(cx, y, hl * 2, hw * 2);
      g.lineStyle(1, 0x8a6a3a, 0.8); // the lamellar rows
      g.lineBetween(cx - hl * 0.35, y - hw * 0.8, cx - hl * 0.35, y + hw * 0.8);
      g.lineBetween(cx + hl * 0.35, y - hw * 0.8, cx + hl * 0.35, y + hw * 0.8);
    }
  },
  // KABUTO — a war helmet from above: the lacquered BOWL (a touch under the kasa's brim — it's a cap, not a parasol),
  // a central ridge, the SHIKORO (neck guard) as three flaring plates fanned BEHIND the bowl (−x), and the MAEDATE
  // crest — a golden crescent with two prongs sweeping FORWARD (+x) off the brow. Palette: base = the lacquer, trim =
  // rim + crest. Slot-local px, +x = the aim, like every head draw.
  kabuto: (g, e, d) => {
    const R = e.transform!.r * 0.92;
    const base = d.palette?.base ?? 0x1b1518;
    const trim = d.palette?.trim ?? 0xd4af37;
    g.fillStyle(0x000000, 0.18);
    g.fillCircle(2, 3, R); // drop shadow
    // the shikoro: three plates behind, each a wider, shorter arc than the last — the fan of the neck guard
    for (let i = 0; i < 3; i++) {
      const rr = R * (1.05 + i * 0.14);
      g.fillStyle(base, 1);
      g.slice(0, 0, rr, Math.PI * 0.62, Math.PI * 1.38, false);
      g.fillPath();
      g.lineStyle(1, trim, 0.7);
      g.slice(0, 0, rr, Math.PI * 0.62, Math.PI * 1.38, false);
      g.strokePath();
    }
    // the bowl
    g.fillStyle(base, 1);
    g.fillCircle(0, 0, R);
    g.lineStyle(1.5, trim, 0.95);
    g.strokeCircle(0, 0, R);
    g.lineStyle(1, trim, 0.5); // the ridge seam, brow to nape
    g.lineBetween(-R * 0.9, 0, R * 0.7, 0);
    // the maedate: a crescent on the brow, prongs sweeping forward — the thing that turns with the aim
    g.lineStyle(2.5, trim, 1);
    g.beginPath();
    g.arc(R * 0.55, 0, R * 0.55, -Math.PI * 0.5, Math.PI * 0.5, false);
    g.strokePath();
    g.fillStyle(trim, 1);
    g.fillCircle(R * 0.55, 0, R * 0.14); // the crest's boss
  },
  // SPIKY HAIR — a jagged crown over the head (hair slot: pinned where a hat pins, under one), the silhouette seen from
  // above: a ring of short spikes around a filled core, the fringe trimmed darker. Turns with the aim like a hat (the
  // slot's default), so the spikes' lean shows the turn. Colors from the palette: base = the hair, trim = its shadow.
  spikyHair: (g, e, d) => {
    const r = e.transform!.r;
    const base = d.palette?.base ?? 0x8fd36a;
    const trim = d.palette?.trim ?? 0x4f8a3a;
    const rIn = ANATOMY.headR * r * 1.05; // the core just covers the head
    const rOut = ANATOMY.headR * r * 1.38; // the spike tips
    const spikes = 14;
    g.fillStyle(0x000000, 0.18);
    g.fillCircle(2, 3, rIn); // drop shadow
    g.fillStyle(base, 1);
    g.lineStyle(1.5, trim, 0.95);
    g.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const rr = i % 2 === 0 ? rOut : rIn * 0.98; // tip, valley, tip, valley …
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.lineStyle(1, trim, 0.5); // a few strands across the crown — the fringe reads as hair, not a star
    for (let i = 0; i < 5; i++) {
      const a = -0.9 + i * 0.45;
      g.lineBetween(Math.cos(a) * rIn * 0.25, Math.sin(a) * rIn * 0.25, Math.cos(a) * rIn * 0.85, Math.sin(a) * rIn * 0.85);
    }
  },
  // SASH — a band across the WAIST (chest slot, body-follow so it twists with the torso): a cloth strip across the body
  // behind the chest anchor, knotted at the wearer's LEFT with two short tails trailing back. Drawn in the chest slot's
  // local frame (+x = facing), corrected for the slot's own forward anchor like the sode.
  sash: (g, e, d) => {
    const r = e.transform!.r;
    const base = d.palette?.base ?? 0xa0233a;
    const trim = d.palette?.trim ?? 0x5a1020;
    const cx = (-0.1 - SLOT_ANCHOR.chest) * r; // just behind the body center — the waist
    const hw = 0.95 * r; // half-width across the body
    const th = 0.3 * r; // the band's thickness along the facing
    g.fillStyle(base, 1);
    g.fillRect(cx - th / 2, -hw, th, hw * 2);
    g.lineStyle(1, trim, 0.9);
    g.strokeRect(cx - th / 2, -hw, th, hw * 2);
    g.lineStyle(1, trim, 0.5); // the cloth's folds
    g.lineBetween(cx, -hw * 0.6, cx, hw * 0.6);
    const kx = cx; // the knot at his LEFT (−y in a +x-facing frame)
    const ky = -hw;
    g.fillStyle(base, 1);
    g.fillCircle(kx, ky, 0.16 * r);
    g.lineStyle(1, trim, 0.9);
    g.strokeCircle(kx, ky, 0.16 * r);
    g.lineStyle(2, base, 1); // two tails trailing back from the knot
    g.lineBetween(kx, ky, kx - 0.5 * r, ky - 0.1 * r);
    g.lineBetween(kx, ky, kx - 0.42 * r, ky - 0.3 * r);
  },
  // EARRINGS — three gold drops off the wearer's LEFT ear (face slot: the facing half of the head), trailing outward in a
  // line the way they hang in the concept. The face anchor sits forward of the head center, so the ear is corrected back
  // to the head's rim. Tiny by design: a glint, not a feature.
  earrings: (g, e, d) => {
    const r = e.transform!.r;
    const base = d.palette?.base ?? 0xe0b23a;
    const trim = d.palette?.trim ?? 0x8a6a1a;
    const headCx = -(ANATOMY.headR * 0.55) * r; // the head center, in the face slot's frame
    const ex = headCx;
    const ey = -ANATOMY.headR * r; // the left ear, on the rim (his left = −y when facing +x)
    for (let i = 0; i < 3; i++) {
      const x = ex - i * 0.06 * r;
      const y = ey - 0.08 * r - i * 0.15 * r;
      g.fillStyle(base, 1);
      g.fillCircle(x, y, 0.065 * r);
      g.lineStyle(1, trim, 0.9);
      g.strokeCircle(x, y, 0.065 * r);
    }
  },
  // add more proc accessories here; a def opts in with visual: { kind: 'procedural', draw: '<key>' }.
};
