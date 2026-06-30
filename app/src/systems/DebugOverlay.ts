import Phaser from 'phaser';
import { GAME_W, TILE, Tile } from '../config/constants';
import { Debug } from '../core/Debug';
import { Abilities, abilityRange } from '../combat/Ability';
import type { AIProfileDef } from '../defs/aiProfiles';
import type { Entity } from '../ecs/components';
import type { World } from '../ecs/World';
import type { TileGrid } from '../world/TileGrid';

const DEPTH = 1_000_000;
const SQUAD_COLORS = [0xff5a5a, 0x5aa0ff, 0x7fd17f, 0xf0b429, 0xc97fff, 0xff9f43];

interface Waypoint {
  x: number;
  y: number;
}

/**
 * World-space debug view, drawn per-layer from the Debug flags (toggled via the DOM panel — backtick).
 * Read-only; no gameplay effect. Each layer is an independent flag, so this scales: add a flag in
 * core/Debug + a small `if (Debug.on('x'))` block here.
 */
export class DebugOverlay {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private readonly hint: Phaser.GameObjects.Text;
  private readonly perf: Phaser.GameObjects.Text;
  private used = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
    private readonly grid: TileGrid,
  ) {
    this.gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);
    this.hint = scene.add
      .text(GAME_W / 2, 6, '● DEBUG   [ ` panel ]', { fontFamily: 'monospace', fontSize: '11px', color: '#00e0ff' })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH)
      .setVisible(false);
    this.perf = scene.add
      .text(8, 24, '', { fontFamily: 'monospace', fontSize: '11px', color: '#9cf' })
      .setScrollFactor(0)
      .setDepth(DEPTH)
      .setVisible(false);
  }

  private label(x: number, y: number, text: string, color: string): void {
    let t = this.labels[this.used];
    if (!t) {
      t = this.scene.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '10px' }).setDepth(DEPTH).setOrigin(0.5, 1);
      this.labels.push(t);
    }
    t.setText(text).setColor(color).setPosition(x, y).setVisible(true);
    this.used++;
  }

  update(): void {
    const any = Debug.any();
    this.gfx.setVisible(any);
    this.hint.setVisible(any);
    if (!any) {
      for (const l of this.labels) l.setVisible(false);
      this.perf.setVisible(false);
      return;
    }

    const g = this.gfx;
    g.clear();
    this.used = 0;

    // World: highlight wall tiles in view (pathfinding obstacles)
    if (Debug.on('world.collision')) {
      const v = this.scene.cameras.main.worldView;
      const x0 = Math.max(0, Math.floor(v.x / TILE));
      const y0 = Math.max(0, Math.floor(v.y / TILE));
      const x1 = Math.min(this.grid.w - 1, Math.ceil((v.x + v.width) / TILE));
      const y1 = Math.min(this.grid.h - 1, Math.ceil((v.y + v.height) / TILE));
      g.fillStyle(0xff2b2b, 0.22);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (this.grid.tileAt(x, y) === Tile.Wall) g.fillRect(x * TILE, y * TILE, TILE, TILE);
        }
      }
    }

    // Combat: attack reach circles (player + enemies)
    if (Debug.on('combat.reach')) {
      g.lineStyle(1, 0xffaa00, 0.35);
      for (const e of this.world.with('loadout', 'transform')) {
        const ab = Abilities.get(e.loadout!.primary);
        const range = abilityRange(ab, e.attributes?.get('reach') ?? 0);
        if (range > 0) g.strokeCircle(e.transform!.x, e.transform!.y, range);
      }
    }

    // AI layers (per enemy)
    const rings = Debug.on('squad.rings');
    const stats = Debug.on('ai.stats');
    const paths = Debug.on('ai.paths');
    const focusL = Debug.on('ai.focus');
    const sight = Debug.on('ai.sight');
    const tokens = Debug.on('ai.tokens');
    if (rings || stats || paths || focusL || sight || tokens) {
      for (const e of this.world.with('ai', 'transform')) {
        const t = e.transform!;
        const bb = e.ai!.bb;
        const p = bb.profile as AIProfileDef | undefined;
        const sq = e.squad;
        const color = sq ? SQUAD_COLORS[sq.id % SQUAD_COLORS.length] : 0x999999;
        const hex = '#' + color.toString(16).padStart(6, '0');

        if (rings) {
          g.lineStyle(2, color, 0.9);
          g.strokeCircle(t.x, t.y, t.r + 4);
          this.label(t.x, t.y - t.r - 22, sq ? sq.name : 'solo', hex);
        }
        if (sight && p) {
          g.lineStyle(1, color, 0.12);
          g.strokeCircle(t.x, t.y, p.sight);
        }
        if (focusL) {
          const f = bb.focus as Entity | undefined;
          if (f?.transform) {
            g.lineStyle(1, color, 0.5);
            g.lineBetween(t.x, t.y, f.transform.x, f.transform.y);
          }
        }
        if (paths) {
          const path = bb.path as Waypoint[] | null;
          if (path && path.length) {
            g.lineStyle(2, 0x00e0ff, 0.85);
            g.beginPath();
            g.moveTo(t.x, t.y);
            for (const w of path) g.lineTo(w.x, w.y);
            g.strokePath();
            g.fillStyle(0x00e0ff, 0.9);
            for (const w of path) g.fillCircle(w.x, w.y, 2.5);
          }
        }
        if (tokens && bb.attackOk === true) {
          g.fillStyle(0xff3b3b, 1);
          g.fillTriangle(t.x, t.y - t.r - 16, t.x - 4, t.y - t.r - 9, t.x + 4, t.y - t.r - 9);
        }
        if (stats) {
          const hp = e.health ? `${Math.ceil(e.health.hp)}/${e.health.maxhp}` : '';
          const atk = e.attributes ? ` atk${Math.round(e.attributes.get('atk'))}` : '';
          this.label(t.x, t.y - t.r - 33, `${p?.name ?? '?'}·${bb.state}·${hp}${atk}${bb.broken ? '·FLEE' : ''}`, '#e6e6e6');
        }
      }
    }

    if (stats) {
      const hero = this.world.first('control');
      if (hero?.transform) {
        const hp = hero.health ? `${Math.ceil(hero.health.hp)}/${hero.health.maxhp}` : '';
        const atk = hero.attributes ? Math.round(hero.attributes.get('atk')) : 0;
        const stam = hero.combatant ? Math.round(hero.combatant.stam) : 0;
        const tier = hero.attributes ? ` spd${Math.round(hero.attributes.get('atkSpeed') * 100) / 100}` : '';
        this.label(hero.transform.x, hero.transform.y - hero.transform.r - 18, `YOU hp${hp} atk${atk} stam${stam}${tier}`, '#ffd166');
      }
    }

    if (Debug.on('perf.hud')) {
      this.perf.setVisible(true).setText(`fps ${Math.round(this.scene.game.loop.actualFps)}  entities ${this.world.count}`);
    } else {
      this.perf.setVisible(false);
    }

    for (let i = this.used; i < this.labels.length; i++) this.labels[i].setVisible(false);
  }
}
