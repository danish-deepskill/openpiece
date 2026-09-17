import Phaser from 'phaser';
import { Depth, FX_COLOR } from '../config/constants';
import { RENDER_SCALE } from '../config/render';
import { events, type SwingFx } from '../core/EventBus';
import { clamp, rand } from '../core/math';
import { Pool } from '../core/Pool';
import { addText } from '../ui/text';

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: number; r: number }
interface Corpse { x: number; y: number; r: number; color: number; life: number; max: number }
interface DmgText { obj: Phaser.GameObjects.Text; vy: number; life: number }
interface Spot { obj: Phaser.GameObjects.Text; life: number; max: number } // the "!" spotted marker
interface Ring { x: number; y: number; radius: number; color: number; life: number; max: number; width: number; alpha: number; under: boolean } // expanding shockwave

/** Pooled, presentation-only effects. Lives outside the ECS to keep the hot path allocation-free. */
export class FxSystem {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly gfxGround: Phaser.GameObjects.Graphics; // ground-plane layer (Depth.GroundFx) — splash rings draw beneath units
  private particles: Particle[] = [];
  private swings: SwingFx[] = [];
  private corpses: Corpse[] = [];
  private texts: DmgText[] = [];
  private spots: Spot[] = [];
  private rings: Ring[] = [];
  private textRot = 0; // counter-rotation to keep damage numbers upright under the shift-lock camera
  private readonly textPool: Pool<Phaser.GameObjects.Text>;

  /** Keep damage numbers screen-upright while the world camera spins (shift lock): WorldScene passes −camRot. */
  setTextRotation(rot: number): void {
    this.textRot = rot;
  }

  constructor(private readonly scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(Depth.Fx);
    this.gfxGround = scene.add.graphics().setDepth(Depth.GroundFx); // ground-plane FX (splash rings) — UNDER units
    // the sim EMITS fx events; this presentation system is their one subscriber (DESIGN_PATTERNS §7)
    events.on('fx:burst', ({ x, y, color, n, speed }) => this.burst(x, y, color, n, speed));
    events.on('fx:dmgText', ({ x, y, value, color }) => this.dmgText(x, y, value, color));
    events.on('fx:swing', (o) => this.swing(o));
    events.on('fx:corpse', ({ x, y, r, color }) => this.corpse(x, y, r, color));
    events.on('fx:shake', ({ amount }) => this.shake(amount));
    events.on('fx:spotted', ({ x, y, dur }) => this.spotted(x, y, dur));
    events.on('fx:ring', ({ x, y, radius, color, life, width, alpha, under }) =>
      this.rings.push({ x, y, radius, color, life, max: life, width: width ?? 4, alpha: alpha ?? 1, under: under ?? false }),
    );
    this.textPool = new Pool<Phaser.GameObjects.Text>(
      () =>
        addText(scene, 0, 0, '', { fontFamily: 'Trebuchet MS', fontStyle: 'bold', fontSize: '14px' })
          .setDepth(Depth.DmgText)
          .setOrigin(0.5),
      (txt) => txt.setVisible(false),
      12,
    );
  }

  burst(x: number, y: number, color: number, n: number, spd: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2; // cosmetic — MUST stay off the sim Rng streams (fx call counts vary)
      const s = rand(spd * 0.3, spd);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.25, 0.55), max: 0.55, color, r: rand(2, 4) });
    }
  }

  dmgText(x: number, y: number, val: number, color: string): void {
    const o = this.textPool.acquire();
    // reset the shared-pool styling a "!" marker may have left on this recycled object (stroke + bigger font)
    o.setText(String(Math.round(val))).setColor(color).setStroke('', 0).setFontSize(14).setPosition(x, y).setAlpha(1).setVisible(true);
    this.texts.push({ obj: o, vy: -34, life: 0.8 });
  }

  swing(o: SwingFx): void {
    this.swings.push(o);
  }

  /** The "!" spotted marker: a bold amber exclamation with a DARK OUTLINE (so it reads on ANY terrain — a plain
   *  amber "!" washed out on desert/sand) that pops in over the unit's head for `dur` seconds while it registers
   *  you (the alert double-take), then fades. Shares the damage-number text pool; the stroke is cleared in
   *  dmgText so a recycled object can't carry a stray outline. */
  spotted(x: number, y: number, dur: number): void {
    const o = this.textPool.acquire();
    o.setText('!').setColor('#ffd24a').setStroke('#241a08', 4).setFontSize(18).setPosition(x, y).setAlpha(1).setVisible(true);
    this.spots.push({ obj: o, life: dur, max: dur });
  }

  corpse(x: number, y: number, r: number, color: number): void {
    this.corpses.push({ x, y, r, color, life: 6, max: 6 });
  }

  shake(amount: number): void {
    // Phaser computes the shake offset as intensity × camera WIDTH × zoom, then applies it THROUGH the camera's
    // already-zoomed matrix (Shake.preRender → matrix.translate), so in buffer px it scales with zoom². Width
    // and zoom each grew by RENDER_SCALE (config/render.ts) → RENDER_SCALE³ in the buffer; the buffer→screen
    // mapping absorbs one → divide by RENDER_SCALE² to keep the on-screen amplitude the tuned one. (The cap is
    // in the tuned units too.) Pre-existing + unchanged: amplitude also follows the VIEW zoom² — tuned at 2.
    this.scene.cameras.main.shake(90, Math.min(0.012, amount * 0.0014) / (RENDER_SCALE * RENDER_SCALE));
  }

  update(dt: number): void {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.9, dt * 60); // time-based (visual only)
      p.vy *= Math.pow(0.9, dt * 60);
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
      d.vy *= Math.pow(0.92, dt * 60);
      d.life -= dt;
      d.obj.setAlpha(clamp(d.life / 0.8, 0, 1)).setRotation(this.textRot); // stay upright under the shift-lock camera
      if (d.life <= 0) {
        this.textPool.release(d.obj);
        this.texts.splice(i, 1);
      }
    }

    for (let i = this.spots.length - 1; i >= 0; i--) {
      const s = this.spots[i];
      s.life -= dt;
      const k = s.life / s.max; // 1 → 0
      const pop = Math.min(1, (s.max - s.life) / 0.08); // quick pop-in over the first 80ms
      s.obj.setScale(pop * (0.9 + 0.3 * k)).setAlpha(clamp(k * 1.4, 0, 1)).setRotation(this.textRot); // upright under shift-lock
      if (s.life <= 0) {
        this.textPool.release(s.obj);
        this.spots.splice(i, 1);
      }
    }

    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);

    const g = this.gfx;
    g.clear();
    this.gfxGround.clear();
    for (const c of this.corpses) {
      g.fillStyle(c.color, clamp(c.life / c.max, 0, 1));
      g.fillCircle(c.x, c.y, c.r);
    }
    // SHOCKWAVE rings: expand from ~0 to `radius` while fading — a slam impact above the crowd, or a water-entry
    // splash on the GROUND plane (rg.under → drawn beneath units: the ring is ON the sea surface, the body above it).
    for (const rg of this.rings) {
      const prog = 1 - rg.life / rg.max; // 0 → 1 over its life
      const cur = rg.radius * (0.2 + 0.8 * prog); // grows outward
      const layer = rg.under ? this.gfxGround : g;
      layer.lineStyle(rg.width * (1 - prog) + 1, rg.color, rg.alpha * clamp(rg.life / rg.max, 0, 1)); // thick+opaque early, thin+faint late
      layer.strokeCircle(rg.x, rg.y, cur);
    }
    for (const s of this.swings) this.drawSwing(s);
    for (const p of this.particles) {
      g.fillStyle(p.color, clamp(p.life / p.max, 0, 1));
      g.fillCircle(p.x, p.y, p.r);
    }
  }

  private drawSwing(s: SwingFx): void {
    const g = this.gfx;
    const k = s.life / s.max;
    if (s.type === 'pistol') {
      g.lineStyle(s.thin ? 5 : 9, s.enemy ? 0xdc5050 : FX_COLOR.spark, (s.enemy ? 1 : 0.9) * k);
      const ex = s.x + Math.cos(s.angle) * s.len * (1.05 - k * 0.1);
      const ey = s.y + Math.sin(s.angle) * s.len * (1.05 - k * 0.1);
      g.lineBetween(s.x, s.y, ex, ey);
      g.fillStyle(s.enemy ? 0xdc5050 : FX_COLOR.spark, k);
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
