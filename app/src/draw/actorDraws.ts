import type Phaser from 'phaser';
import { clamp } from '../core/math';
import { Weapons } from '../defs/layers';
import type { DrawFn } from '../ecs/components';

const OUTLINE = 0x20242a;

interface WeaponVisual {
  kind: 'blade' | 'club';
  length: number;
  width: number;
  color: number;
}

/** A held weapon, drawn from the hand outward along the aim angle `a` (LOCAL space). */
function drawWeapon(g: Phaser.GameObjects.Graphics, hx: number, hy: number, a: number, v: WeaponVisual): void {
  const ex = hx + Math.cos(a) * v.length;
  const ey = hy + Math.sin(a) * v.length;
  g.lineStyle(v.width + 3, OUTLINE, 0.95);
  g.lineBetween(hx, hy, ex, ey);
  g.lineStyle(v.width, v.color, 1);
  g.lineBetween(hx, hy, ex, ey);
  g.fillStyle(v.color, 1);
  g.fillCircle(ex, ey, v.width * 0.6);
  g.fillStyle(0x6b4a2a, 1); // wooden grip
  g.fillCircle(hx, hy, v.width * 0.7);
}

/**
 * Shared moomoo.io-style actor: a body circle with a thick outline + faction-colored ring, two eyes facing
 * the aim, two hands (one jabs on attack), and — if a weapon is equipped — the weapon held in the lead hand,
 * rotated to aim. Equipment/gear contributes draw layers, mirroring how it contributes stats/abilities.
 */
export const drawActor: DrawFn = (g, e) => {
  const t = e.transform!;
  const rd = e.render!;
  const r = t.r;
  const a = t.angle;
  const flashing = !!e.health && e.health.hitFlash > 0;

  // contact shadow
  g.fillStyle(0x000000, 0.22);
  g.fillEllipse(0, r * 0.7, r * 1.8, r * 0.9);

  // Logia intangibility aura
  if (e.tags?.has('state.logia.intangible')) {
    g.fillStyle(0x9fd0ff, 0.22);
    g.fillCircle(0, 0, r * 1.35);
  }

  // body + thick outline + faction-colored inner ring (team identity)
  g.fillStyle(flashing ? 0xffffff : rd.baseColor, 1);
  g.fillCircle(0, 0, r);
  g.lineStyle(3, OUTLINE, 0.95);
  g.strokeCircle(0, 0, r);
  if (rd.hatColor != null) {
    g.lineStyle(2, rd.hatColor, 0.9);
    g.strokeCircle(0, 0, r - 2);
  }

  // Armament Haki coating ring while active
  if (e.tags?.has('haki.armament.active')) {
    g.lineStyle(3, 0x0a0a12, 0.92);
    g.strokeCircle(0, 0, r + 1);
  }

  // eyes (face the aim direction)
  g.fillStyle(0x14161b, 1);
  for (const side of [-1, 1] as const) {
    const ea = a + side * 0.42;
    g.fillCircle(Math.cos(ea) * r * 0.42, Math.sin(ea) * r * 0.42, r * 0.16);
  }

  // hands + held weapon. The acting hand SWEEPS the weapon through the cone (arc) or LUNGES it forward
  // (thrust); unarmed it's a forward jab.
  const handR = r * 0.45;
  const baseDist = r * 0.95;
  const swinging = !!rd.swingT && !!rd.swingMax;
  const p = swinging ? 1 - rd.swingT! / rd.swingMax! : 0; // 0 at strike start → 1 at end
  const wid = e.equipment?.weapon;
  const wv = wid ? Weapons.get(wid).visual : undefined;
  let weaponHx = Math.cos(a + 0.62) * baseDist;
  let weaponHy = Math.sin(a + 0.62) * baseDist;
  let weaponAngle = a;
  for (const side of [-1, 1] as const) {
    const swingHand = swinging && rd.swingSide === side;
    let hx = Math.cos(a + side * 0.62) * baseDist;
    let hy = Math.sin(a + side * 0.62) * baseDist;
    if (swingHand) {
      if (wv && side === 1 && rd.swingArc) {
        // sweep the weapon across the cone (a slash)
        const half = rd.swingArcHalf ?? 0.5;
        const sweep = a + half - 2 * half * p;
        hx = Math.cos(sweep) * baseDist * 1.12;
        hy = Math.sin(sweep) * baseDist * 1.12;
        weaponAngle = sweep;
      } else {
        // forward jab / thrust lunge — shoots out then retracts
        const lunge = Math.sin(p * Math.PI) * r * 0.7;
        hx += Math.cos(a) * lunge;
        hy += Math.sin(a) * lunge;
      }
    }
    g.fillStyle(flashing ? 0xffffff : rd.baseColor, 1);
    g.fillCircle(hx, hy, handR);
    g.lineStyle(2, OUTLINE, 0.5);
    g.strokeCircle(hx, hy, handR);
    if (side === 1) {
      weaponHx = hx;
      weaponHy = hy;
    }
  }
  if (wv) drawWeapon(g, weaponHx, weaponHy, weaponAngle, wv);

  // health bar
  if (rd.showHpBar && e.health) {
    const w = r * 2.2;
    const h = 4;
    const bx = -w / 2;
    const by = -r - 10;
    const pct = clamp(e.health.hp / e.health.maxhp, 0, 1);
    g.fillStyle(0x000000, 0.5);
    g.fillRect(bx - 1, by - 1, w + 2, h + 2);
    g.fillStyle(rd.hpColor ?? 0xd4483b, 1);
    g.fillRect(bx, by, w * pct, h);
  }
};

/** A ground pickup (weapon/fruit) with a glow so it reads as collectible. */
export const drawPickup: DrawFn = (g, e) => {
  const kind = e.pickup!.kind;
  const r = e.transform!.r;
  g.fillStyle(0x000000, 0.18);
  g.fillEllipse(0, r * 0.6, r * 1.6, r * 0.8);
  g.fillStyle(0xf0d060, 0.18);
  g.fillCircle(0, 0, r + 6);
  if (kind === 'weapon') {
    g.lineStyle(6, OUTLINE, 0.9);
    g.lineBetween(-r, r * 0.7, r, -r * 0.9);
    g.lineStyle(4, 0xcdd3da, 1);
    g.lineBetween(-r, r * 0.7, r, -r * 0.9);
    g.fillStyle(0x6b4a2a, 1);
    g.fillCircle(-r, r * 0.7, 3);
  } else {
    g.fillStyle(0x7a3da8, 1);
    g.fillCircle(0, 0, r);
    g.lineStyle(2, OUTLINE, 0.9);
    g.strokeCircle(0, 0, r);
    g.fillStyle(0x4a7c3f, 1);
    g.fillCircle(r * 0.3, -r * 0.8, 2.5); // stem leaf
  }
};

/** Draw registry keyed by ActorDef.DrawKey. All actors share the moomoo body look. */
export const draws: Record<string, DrawFn> = {
  hero: drawActor,
  grunt: drawActor,
  captain: drawActor,
  villager: drawActor,
  pirate: drawActor,
  crew: drawActor,
};
