import Phaser from 'phaser';
import { visionOf } from '../ai/perception';
import { GAME_W, TILE } from '../config/constants';
import { Debug } from '../core/Debug';
import { events } from '../core/EventBus';
import { Abilities, abilityRange } from '../combat/Ability';
import { BLOCK_ARC, PARRY_ARC } from '../combat/guard';
import { strikeFrameOf, strikeVolumes } from '../combat/hitVolume';
import { phaseAt } from '../combat/phases';
import { swingGeomOf, swingPose } from '../combat/swing';
import type { World } from '../ecs/World';
import type { MoveCtx } from '../world/GridCollider';
import { TileGrid } from '../world/TileGrid';

/** Phase → debug tint: the tell reads warning-yellow, the live strike red, the punishable tail gray. */
const PHASE_COLORS = { windup: '#ffd24a', active: '#ff5a5a', recover: '#9aa6b2' } as const;

const DEPTH = 1_000_000;
const SQUAD_COLORS = [0xff5a5a, 0x5aa0ff, 0x7fd17f, 0xf0b429, 0xc97fff, 0xff9f43];

/** The grounded-walker context the collision overlay probes with (read-only — never mutated). */
const FOOT_CTX: MoveCtx = { mode: 'foot', airborne: false, onLedge: false };

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
  /** Recent instantaneous AoEs (Gomu Rocket landing) held ~0.5s so they're visible, not a one-frame flash. */
  private aoes: { x: number; y: number; radius: number; until: number }[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
    private readonly grid: TileGrid,
  ) {
    this.gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);
    events.on('debug:aoe', ({ x, y, radius }) => {
      this.aoes.push({ x, y, radius, until: scene.time.now + 500 }); // linger 0.5s
    });
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
    // GOD MODE: keep the 'state.godMode' tag in sync with the flag ON THE CONTROLLED unit (the Moat — follows
    // possession). The sim reads only the tag (deterministic/serializable); this UI toggle owns the tag. Runs
    // BEFORE the early-return so turning the flag OFF still strips the tag.
    const god = Debug.on('combat.god');
    const me = this.world.first('control');
    if (me?.tags) {
      if (god) me.tags.add('state.godMode');
      else me.tags.remove('state.godMode');
    }

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

    // World: highlight foot-blocking cells in view (pathfinding obstacles) — BOTH layers, terrain + structures
    if (Debug.on('world.collision')) {
      const v = this.scene.cameras.main.worldView;
      const x0 = Math.max(0, Math.floor(v.x / TILE));
      const y0 = Math.max(0, Math.floor(v.y / TILE));
      const x1 = Math.min(this.grid.w - 1, Math.ceil((v.x + v.width) / TILE));
      const y1 = Math.min(this.grid.h - 1, Math.ceil((v.y + v.height) / TILE));
      g.fillStyle(0xff2b2b, 0.22);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const blocked = !TileGrid.walkable(this.grid.tileAt(x, y), 'foot') || this.grid.structures.blocks(x, y, FOOT_CTX);
          if (blocked) g.fillRect(x * TILE, y * TILE, TILE, TILE);
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

    // Combat: the ACCURACY CONE of every unit holding a ranged weapon — the same live spread wedge the player
    // sees (combatant.spread), drawn per unit so you can watch every enemy's cone narrow as it settles / widen
    // as it moves. BRIGHT green while AIMING (leveled), DIM white otherwise (hip spread). Same g.slice wedge as
    // the vision cone + the player reticle — one cone look everywhere.
    if (Debug.on('combat.aim')) {
      const CONE_R = 90;
      for (const e of this.world.with('transform', 'combatant')) {
        if (e.ship) continue;
        const spread = e.combatant!.spread;
        if (spread === undefined || spread <= 0) continue; // only ranged holders carry a spread
        const t = e.transform!;
        const aiming = e.combatant!.aiming === true;
        const color = aiming ? 0x5aff7a : 0xffffff;
        g.fillStyle(color, aiming ? 0.12 : 0.06);
        g.slice(t.x, t.y, CONE_R, t.angle - spread, t.angle + spread, false);
        g.fillPath();
        g.lineStyle(1, color, aiming ? 0.5 : 0.3);
        g.slice(t.x, t.y, CONE_R, t.angle - spread, t.angle + spread, false);
        g.strokePath();
        // CLOSE-PASS RING — the point-blank fumble radius of this unit's ranged primary (AbilityShape.closePassRange):
        // a shot fired with a hostile INSIDE this red ring has a chance to phase THROUGH (peak at contact, fading to
        // 0 at the ring edge). Red so it reads as "danger zone for the SHOOTER" — get this close and his gun fumbles.
        const primary = e.loadout ? Abilities.get(e.loadout.primary) : undefined;
        const passR = primary?.shape?.closePassRange ?? 0;
        if (passR > 0) {
          g.lineStyle(1, 0xff5a5a, 0.55);
          g.strokeCircle(t.x, t.y, passR);
        }
      }
    }

    // Combat: GUARD arc — the directional block/parry COVER of every guarding unit (the real BLOCK_ARC/PARRY_ARC
    // the guard code tests, so the debug shows the exact arc a hit must fall inside to be stopped; the open rear
    // is the flank window). Parry (wider + brighter) vs block. Moved here from normal play — a debug aid now.
    if (Debug.on('combat.guard')) {
      for (const e of this.world.with('combatant', 'transform')) {
        const c = e.combatant!;
        const parrying = (c.parryT ?? 0) > 0;
        if (!c.blocking && !parrying) continue;
        const t = e.transform!;
        const half = parrying ? PARRY_ARC : BLOCK_ARC;
        g.lineStyle(parrying ? 3 : 2, parrying ? 0xf2f7ff : 0x9fd0ff, parrying ? 0.9 : 0.6);
        g.beginPath();
        g.arc(t.x, t.y, t.r + 8, t.angle - half, t.angle + half);
        g.strokePath();
      }
    }

    // Combat: LIVE strike volumes of every swing in flight — the actual hitboxes (weapon segments incl.
    // dead zones, slash arcs), colored by phase: dim while the volume's window is closed, red while it can
    // hit. This is the ground truth the reach circle only approximates.
    if (Debug.on('combat.hitbox')) {
      for (const e of this.world.with('melee', 'transform')) {
        const m = e.melee!;
        const t = e.transform!;
        const d = Abilities.get(m.ability);
        const shape = d.shape;
        if (!shape) continue;
        const p = m.dur > 0 ? Math.min(1, m.t / m.dur) : 1;
        // the phase label shows for EVERY swing — even a noHit one (Gomu Rocket's grab) has meaningful
        // windup/active/recover timing (when it launches, when it recovers), just no strike volumes to draw.
        const phase = phaseAt(m.phases, p);
        this.label(t.x, t.y - t.r - 44, `${phase} ${(p * 100).toFixed(0)}%`, PHASE_COLORS[phase]);
        if (shape.noHit) continue; // no contact hitboxes to draw (damage is the landing AoE) — label only
        const w0 = m.phases.windup;
        const aEnd = w0 + m.phases.active;
        const volumes = strikeVolumes(e, d, [w0, aEnd]);
        if (volumes.length === 0) continue;
        const pose = swingPose(m, shape, swingGeomOf(e));
        const f = strikeFrameOf(e, m, d, pose); // the EXACT frame MeleeSystem tests — ground truth by construction
        for (const v of volumes) {
          const live = p >= (v.active ? v.active[0] : w0) && p <= (v.active ? v.active[1] : aEnd);
          const color = live ? 0xff5a5a : 0x8899aa;
          const alpha = live ? 0.5 : 0.15;
          if (v.kind === 'weaponSegment') {
            const ax = f.handX + (f.tipX - f.handX) * (v.from ?? 0);
            const ay = f.handY + (f.tipY - f.handY) * (v.from ?? 0);
            const bx = f.handX + (f.tipX - f.handX) * (v.to ?? 1);
            const by = f.handY + (f.tipY - f.handY) * (v.to ?? 1);
            const halfW = v.width !== undefined ? v.width / 2 : f.segmentHalfW;
            g.lineStyle(halfW * 2, color, alpha);
            g.lineBetween(ax, ay, bx, by);
            g.fillStyle(color, alpha); // rounded caps → the capsule MeleeSystem actually tests
            g.fillCircle(ax, ay, halfW);
            g.fillCircle(bx, by, halfW);
          } else {
            const dir = v.follow === 'swing' ? f.swingAngle : f.aim;
            g.beginPath();
            g.arc(f.x, f.y, v.radius, dir - v.halfAngle, dir + v.halfAngle, false);
            g.arc(f.x, f.y, Math.max(1, v.radius - v.thickness), dir + v.halfAngle, dir - v.halfAngle, true);
            g.closePath();
            g.fillStyle(color, alpha * 0.6);
            g.fillPath();
            g.lineStyle(1.5, color, Math.min(1, alpha * 2));
            g.strokePath();
          }
        }
      }
      // lingering AoEs (Gomu Rocket landing slam) — a red circle at the impact, fading over its ~0.5s hold,
      // so you can SEE the instantaneous radial hit (it's a one-frame check, invisible without this).
      const now = this.scene.time.now;
      this.aoes = this.aoes.filter((a) => a.until > now);
      for (const a of this.aoes) {
        const life = Math.max(0, (a.until - now) / 500); // 1 → 0 over the hold
        g.fillStyle(0xff5a5a, 0.25 * life);
        g.fillCircle(a.x, a.y, a.radius);
        g.lineStyle(2, 0xff5a5a, 0.7 * life);
        g.strokeCircle(a.x, a.y, a.radius);
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
        const p = bb.profile;
        const sq = e.squad;
        const color = sq ? SQUAD_COLORS[sq.id % SQUAD_COLORS.length] : 0x999999;
        const hex = '#' + color.toString(16).padStart(6, '0');

        if (rings) {
          g.lineStyle(2, color, 0.9);
          g.strokeCircle(t.x, t.y, t.r + 4);
          this.label(t.x, t.y - t.r - 22, sq ? sq.name : 'solo', hex);
        }
        if (sight && p) {
          const v = visionOf(p);
          const a = t.angle;
          // forward vision cone (full sight range) — translucent wedge
          g.fillStyle(color, 0.08);
          g.slice(t.x, t.y, v.sight, a - v.cone, a + v.cone, false);
          g.fillPath();
          g.lineStyle(1, color, 0.3);
          g.slice(t.x, t.y, v.sight, a - v.cone, a + v.cone, false);
          g.strokePath();
          // short side/peripheral range on each flank, out to the rear blind arc (the gap behind = blind)
          g.lineStyle(1, color, 0.25);
          g.beginPath();
          g.arc(t.x, t.y, v.nearSight, a + v.cone, a + Math.PI - v.blind, false);
          g.strokePath();
          g.beginPath();
          g.arc(t.x, t.y, v.nearSight, a - Math.PI + v.blind, a - v.cone, false);
          g.strokePath();
        }
        if (focusL) {
          const f = bb.focusId !== undefined ? this.world.byId(bb.focusId) : undefined;
          if (f?.transform) {
            g.lineStyle(1, color, 0.5);
            g.lineBetween(t.x, t.y, f.transform.x, f.transform.y);
          }
        }
        if (paths) {
          const path = bb.path;
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
          const id = `${e.identity?.name ?? '?'} ${e.identity?.tier ?? ''}`.trim(); // e.g. "Brute F+"
          const hp = e.health ? `${Math.ceil(e.health.hp)}/${e.health.maxHp}` : '';
          const atk = e.attributes ? ` atk${Math.round(e.attributes.get('atk'))}` : '';
          this.label(t.x, t.y - t.r - 33, `${id}·${p?.name ?? '?'}·${bb.state}·${hp}${atk}${bb.broken ? '·FLEE' : ''}`, '#e6e6e6');
          // COMBAT INTENT line — the hidden per-tick state that drives combat feel (stamina %, the tactical-retreat
          // sub-mode, and the committed reposition PLAN). Only shown when there's something to see, so idle units
          // don't clutter. This is the readout for verifying the regroup/harry/plannedSpecial behavior by eye.
          const c = e.combatant;
          const parts: string[] = [];
          if (c && c.maxStam > 0) parts.push(`stam ${Math.round((c.stam / c.maxStam) * 100)}%`);
          if (bb.regrouping === true) parts.push('REGROUP');
          if (bb.plannedSpecial) parts.push(`plan:${bb.plannedSpecial.replace(/^ability\./, '')}`); // e.g. "plan:gomuRocket"
          if (parts.length) this.label(t.x, t.y - t.r - 44, parts.join('·'), '#ffd24a'); // amber = combat-intent line
        }
      }
    }

    if (stats) {
      const hero = this.world.first('control');
      if (hero?.transform) {
        const hp = hero.health ? `${Math.ceil(hero.health.hp)}/${hero.health.maxHp}` : '';
        const atk = hero.attributes ? Math.round(hero.attributes.get('atk')) : 0;
        const stam = hero.combatant ? Math.round(hero.combatant.stam) : 0;
        const spd = hero.attributes ? ` spd${Math.round(hero.attributes.get('atkSpeed') * 100) / 100}` : '';
        const tier = hero.identity?.tier ? ` ${hero.identity.tier}` : '';
        this.label(hero.transform.x, hero.transform.y - hero.transform.r - 18, `YOU${tier} hp${hp} atk${atk} stam${stam}${spd}`, '#ffd166');
      }
    }

    // MOVEMENT-FRAME readout — makes the invisible frame state + its TRANSITIONS visible: which grid the
    // controlled body resolves against (color flips deck↔world at the exact handoff tick), its coords IN that
    // frame, the perch, and the post-transition beat. The tool the walk-off/boarding feel hunts were begging for.
    if (Debug.on('world.frames')) {
      const c = this.world.first('control');
      if (c?.transform) {
        const m = c.mover;
        const cdv = m?.frameCd ?? 0;
        const cd = cdv > 0 ? ` cd:${cdv.toFixed(2)}` : '';
        const perch = m?.onLedge ? ' PERCH' : '';
        const air = m?.layer === 'air' ? ' AIR' : '';
        const txt = c.onDeck
          ? `DECK ship#${c.onDeck.shipId} local(${c.onDeck.lx.toFixed(0)},${c.onDeck.ly.toFixed(0)})${air}${perch}${cd}`
          : `WORLD (${c.transform.x.toFixed(0)},${c.transform.y.toFixed(0)}) ${m?.mode ?? ''}${air}${perch}${cd}`;
        this.label(c.transform.x, c.transform.y + c.transform.r + 14, txt, c.onDeck ? '#7fd7ff' : '#a8e6a1');
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
