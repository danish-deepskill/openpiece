import Phaser from 'phaser';
import { Depth } from '../config/constants';
import { clamp, rand } from '../core/math';
import { Pool } from '../core/Pool';

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: number; r: number }
interface Corpse { x: number; y: number; r: number; color: number; life: number; max: number }
interface DmgText { obj: Phaser.GameObjects.Text; vy: number; life: number }

export interface SwingOpts {
  type: 'melee' | 'pistol' | 'thrust';
  x: number;
  y: number;
  angle: number;
  len: number;
  life: number;
  max: number;
  arc?: number; // half-angle of the melee swing visual (matches the ability's hit cone)
  enemy?: boolean;
  thin?: boolean;
}

/** Pooled, presentation-only effects. Lives outside the ECS to keep the hot path allocation-free. */
export class FxSystem {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private particles: Particle[] = [];
  private swings: SwingOpts[] = [];
  private corpses: Corpse[] = [];
  private texts: DmgText[] = [];
  private readonly textPool: Pool<Phaser.GameObjects.Text>;

  constructor(private readonly scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(Depth.Fx);
    this.textPool = new Pool<Phaser.GameObjects.Text>(
      () =>
        scene.add
          .text(0, 0, '', { fontFamily: 'Trebuchet MS', fontStyle: 'bold', fontSize: '14px' })
          .setDepth(Depth.DmgText)
          .setOrigin(0.5),
      (txt) => txt.setVisible(false),
      12,
    );
  }

  burst(x: number, y: number, color: number, n: number, spd: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(spd * 0.3, spd);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.25, 0.55), max: 0.55, color, r: rand(2, 4) });
    }
  }

  dmgText(x: number, y: number, val: number, color: string): void {
    const o = this.textPool.acquire();
    o.setText(String(Math.round(val))).setColor(color).setPosition(x, y).setAlpha(1).setVisible(true);
    this.texts.push({ obj: o, vy: -34, life: 0.8 });
  }

  swing(o: SwingOpts): void {
    this.swings.push(o);
  }

  corpse(x: number, y: number, r: number, color: number): void {
    this.corpses.push({ x, y, r, color, life: 6, max: 6 });
  }

  shake(amount: number): void {
    this.scene.cameras.main.shake(90, Math.min(0.012, amount * 0.0014));
  }

  update(dt: number): void {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.9;
      p.vy *= 0.9;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const s of this.swings) s.life -= dt;
    this.swings = this.swings.filter((s) => s.life > 0);

    for (const c of this.corpses) c.life -= dt;
    this.corpses = this.corpses.filter((c) => c.life > 0);

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const d = this.texts[i];
      d.obj.y += d.vy * dt;
      d.vy *= 0.92;
      d.life -= dt;
      d.obj.setAlpha(clamp(d.life / 0.8, 0, 1));
      if (d.life <= 0) {
        this.textPool.release(d.obj);
        this.texts.splice(i, 1);
      }
    }

    const g = this.gfx;
    g.clear();
    for (const c of this.corpses) {
      g.fillStyle(c.color, clamp(c.life / c.max, 0, 1));
      g.fillCircle(c.x, c.y, c.r);
    }
    for (const s of this.swings) this.drawSwing(s);
    for (const p of this.particles) {
      g.fillStyle(p.color, clamp(p.life / p.max, 0, 1));
      g.fillCircle(p.x, p.y, p.r);
    }
  }

  private drawSwing(s: SwingOpts): void {
    const g = this.gfx;
    const k = s.life / s.max;
    if (s.type === 'pistol') {
      g.lineStyle(s.thin ? 5 : 9, s.enemy ? 0xdc5050 : 0xffe08a, (s.enemy ? 1 : 0.9) * k);
      const ex = s.x + Math.cos(s.angle) * s.len * (1.05 - k * 0.1);
      const ey = s.y + Math.sin(s.angle) * s.len * (1.05 - k * 0.1);
      g.lineBetween(s.x, s.y, ex, ey);
      g.fillStyle(s.enemy ? 0xdc5050 : 0xffe08a, k);
      g.fillCircle(ex, ey, 12);
    } else if (s.type === 'thrust') {
      // straight forward stab — the line SHOOTS OUT then retracts (matches the weapon lunge), not full at once
      const ext = Math.sin((1 - k) * Math.PI); // 0 → 1 → 0
      const reach = s.len * (0.35 + 0.65 * ext);
      const ex = s.x + Math.cos(s.angle) * reach;
      const ey = s.y + Math.sin(s.angle) * reach;
      g.lineStyle(6, s.enemy ? 0xe6a0a0 : 0xeef2f6, (s.enemy ? 0.85 : 0.9) * (0.4 + 0.6 * k));
      g.lineBetween(s.x, s.y, ex, ey);
    } else {
      // a fixed-length crescent that CHASES the blade: a constant-size swoosh whose leading edge is the
      // blade's current angle and whose tail trails a fixed span behind — a motion trail, not a filling fan.
      const half = s.arc ?? 0.45;
      const prog = 1 - k; // 0 at strike start → 1 at end
      const start = s.angle + half; // edge the weapon sweeps from
      const lead = start - 2 * half * prog; // blade's current (leading) edge
      const trailLen = Math.min(2 * half, 0.6);
      const tail = Math.min(start, lead + trailLen); // fixed-length tail, clamped to the start edge
      g.lineStyle(6, s.enemy ? 0xe65a46 : 0xffffff, (s.enemy ? 0.8 : 0.7) * (0.4 + 0.6 * k));
      g.beginPath();
      g.arc(s.x, s.y, s.len, lead, tail, false);
      g.strokePath();
    }
  }
}
