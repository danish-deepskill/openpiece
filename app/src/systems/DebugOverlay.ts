import Phaser from 'phaser';
import { visionOf } from '../ai/perception';
import { GAME_W, TILE, WIND_REF } from '../config/constants';
import { RENDER_SCALE } from '../config/render';
import { angleDiff } from '../core/math';
import { Debug } from '../core/Debug';
import { events } from '../core/EventBus';
import { Abilities, abilityRange } from '../combat/Ability';
import { BLOCK_ARC, PARRY_ARC } from '../combat/guard';
import { strikeFrameOf, strikeVolumes } from '../combat/hitVolume';
import { phaseAt } from '../combat/phases';
import { swingGeomOf, swingPose } from '../combat/swing';
import { deckOf, deckToWorld, type ShipPose } from '../defs/decks';
import { ShipHulls } from '../defs/ships';
import type { World } from '../ecs/World';
import type { WindSystem } from './WindSystem';
import { hullDebugMasks } from '../world/deckCollision';
import { Q_NE, Q_NW, Q_SE, Q_SW, type MoveCtx } from '../world/GridCollider';
import { TileGrid } from '../world/TileGrid';
import { addText } from '../ui/text';

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
  /** Per-walker MEASURED-speed samples for the frames readout (last frame-local position + smoothed px/s).
   *  Presentation-side only; `frame` (shipId or −1 for world) resets the sample across frame hops. */
  private readonly walkSpd = new Map<number, { x: number; y: number; at: number; frame: number; v: number }>();
  /** The follow camera's rotation (shift-lock), pushed by WorldScene each frame — the pinned readouts invert it.
   *  Handed over rather than read off the camera because Phaser's Camera TYPE lacks the `rotation` getter its
   *  JS has; the owner already does the same for nameplates (setTextRotation). */
  private viewRot = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
    private readonly grid: TileGrid,
    private readonly wind: WindSystem,
  ) {
    this.gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);
    events.on('debug:aoe', ({ x, y, radius }) => {
      this.aoes.push({ x, y, radius, until: scene.time.now + 500 }); // linger 0.5s
    });
    this.hint = addText(scene, GAME_W / 2, 6, '● DEBUG   [ ` panel ]', { fontFamily: 'monospace', fontSize: '11px', color: '#00e0ff' })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH)
      .setVisible(false);
    this.perf = addText(scene, 8, 24, '', { fontFamily: 'monospace', fontSize: '11px', color: '#9cf' })
      .setScrollFactor(0)
      .setDepth(DEPTH)
      .setVisible(false);
  }

  /** Draw a DECK-LOCAL axis-aligned rect as the rotated world quad it really is (the collision overlay's
   *  hull-quarter primitive) — corners through deckToWorld, so the debug rides the ship's live pose. */
  private quad(pose: ShipPose, lx0: number, ly0: number, lx1: number, ly1: number, fill?: number, line?: number, alpha = 0.5): void {
    const g = this.gfx;
    const p0 = deckToWorld(pose, lx0, ly0);
    const p1 = deckToWorld(pose, lx1, ly0);
    const p2 = deckToWorld(pose, lx1, ly1);
    const p3 = deckToWorld(pose, lx0, ly1);
    g.beginPath();
    g.moveTo(p0.x, p0.y);
    g.lineTo(p1.x, p1.y);
    g.lineTo(p2.x, p2.y);
    g.lineTo(p3.x, p3.y);
    g.closePath();
    if (fill !== undefined) {
      g.fillStyle(fill, alpha);
      g.fillPath();
    }
    if (line !== undefined) {
      g.lineStyle(1.5, line, 0.9);
      g.strokePath();
    }
  }

  private label(x: number, y: number, text: string, color: string): void {
    let t = this.labels[this.used];
    if (!t) {
      t = addText(this.scene, 0, 0, '', { fontFamily: 'monospace', fontSize: '10px' }).setDepth(DEPTH).setOrigin(0.5, 1);
      this.labels.push(t);
    }
    t.setText(text).setColor(color).setPosition(x, y).setVisible(true);
    this.used++;
  }

  /** Place a scrollFactor-0 readout at LOGICAL screen point (sx, sy) whatever the camera's zoom/rotation. Phaser
   *  projects such an object as screen = origin + R(rot)·zoom·(p − origin) (Camera.preRender; origin = the
   *  viewport center) — NOT at (x, y) — so a raw (8, 24) sits off-screen at any zoom > 1; invert the transform.
   *  Scale RENDER_SCALE/zoom keeps the font at its logical px; the counter-rotation keeps it upright. */
  private pin(o: Phaser.GameObjects.Text, sx: number, sy: number): void {
    const cam = this.scene.cameras.main;
    const ox = cam.x + cam.width * cam.originX; // Phaser's own rotation/zoom origin (preRender), not an assumed half-viewport
    const oy = cam.y + cam.height * cam.originY;
    const dx = (sx * RENDER_SCALE - ox) / cam.zoom;
    const dy = (sy * RENDER_SCALE - oy) / cam.zoom;
    const c = Math.cos(this.viewRot);
    const s = Math.sin(this.viewRot);
    o.setPosition(ox + dx * c + dy * s, oy - dx * s + dy * c) // (dx, dy) rotated by −rotation
      .setRotation(-this.viewRot)
      .setScale(RENDER_SCALE / cam.zoom);
  }

  setViewRotation(rot: number): void {
    this.viewRot = rot;
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
    // MANUAL WIND (the panel's sliders under world.wind) — the god-mode pattern: the UI owns the knobs,
    // this pass writes the sim fact. Synced BEFORE the any()-early-return, so closing the panel or the
    // flag always clears a stale override (the wind returns to its field).
    this.wind.override = Debug.on('world.wind') && Debug.on('wind.override')
      ? { dir: ((Debug.value('wind.dir') ?? 0) * Math.PI) / 180, strength: (Debug.value('wind.strength') ?? 85) / 100 }
      : undefined;

    const any = Debug.any();
    this.gfx.setVisible(any);
    this.hint.setVisible(any);
    // screen-pinned readouts, re-pinned every frame: the camera's zoom (debug zoom-out) and rotation
    // (shift-lock) both change live, and each moves where a scrollFactor-0 object lands
    this.pin(this.hint, GAME_W / 2, 6);
    this.pin(this.perf, 8, 24);
    if (!any) {
      for (const l of this.labels) l.setVisible(false);
      this.perf.setVisible(false);
      return;
    }

    const g = this.gfx;
    g.clear();
    this.used = 0;

    // World: the COLLISION TRUTH view — everything a mover actually collides with, drawn from the same tables
    // the colliders read (never re-derived, so it can't drift): world foot-solids, ship hulls at quarter
    // accuracy under BOTH truths (orange = the drawn wood everyone bumps and a swimmer floats up to;
    // translucent red = the WALKER wall band — full rail cells, grounded movers only; green outline = the
    // gangplank door), and every unit's true body circle (green = foot, blue = swim, faded = airborne).
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
      // SHIP HULLS — drawn from the collider's own mask table (never re-derived, so it can't drift), rotated
      // with the ship. Interior cells are skipped (solid from outside, but they're the deck floor — filling
      // them is noise); rails (full-tile blocks) + the door carry all the interesting truth.
      for (const s of this.world.with('ship', 'transform')) {
        const st = s.transform!;
        const hull = ShipHulls.get(s.ship!.hull);
        const grid = deckOf(s.ship!.hull, hull.deck);
        const { wood } = hullDebugMasks(grid);
        const h = grid.tilePx / 2;
        for (const c of grid.cells) {
          if (c.tile === 'gangplank') {
            this.quad(st, c.lx - h, c.ly - h, c.lx + h, c.ly + h, undefined, 0x5aff7a); // the door
            continue;
          }
          if (c.tile !== 'rail') continue;
          const m = wood[c.cy * grid.cols + c.cx];
          if (m & Q_NW) this.quad(st, c.lx - h, c.ly - h, c.lx, c.ly, 0xffaa00, undefined, 0.45);
          if (m & Q_NE) this.quad(st, c.lx, c.ly - h, c.lx + h, c.ly, 0xffaa00, undefined, 0.45);
          if (m & Q_SW) this.quad(st, c.lx - h, c.ly, c.lx, c.ly + h, 0xffaa00, undefined, 0.45);
          if (m & Q_SE) this.quad(st, c.lx, c.ly, c.lx + h, c.ly + h, 0xffaa00, undefined, 0.45);
        }
      }
      // UNIT BODIES — the true collision circle every mover sweeps (r, not the sprite): mode-tinted so the
      // two hull truths read visually (a BLUE swimmer may hug the wood; a GREEN walker is walled at the band).
      for (const e of this.world.with('transform', 'mover')) {
        if (e.ship) continue; // boats draw their hull truth above
        const t = e.transform!;
        const m = e.mover!;
        const color = m.mode === 'swim' ? 0x5ab8ff : 0x5aff7a;
        g.lineStyle(1.5, color, m.layer === 'air' ? 0.3 : 0.9); // faded while airborne (passes over ground solids)
        g.strokeCircle(t.x, t.y, t.r);
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

    // MOVEMENT-FRAME readout — makes the invisible frame state + its TRANSITIONS visible for EVERY walker,
    // not just the controlled one (an AI's handoffs — a recruit sliding to a door, a chaser boarding — need
    // the same eyes): which grid each body resolves against (color flips deck↔world at the exact handoff
    // tick), its coords IN that frame, the perch, and the post-transition beat.
    if (Debug.on('world.frames')) {
      for (const c of this.world.with('transform', 'mover')) {
        if (c.mover!.mode === 'boat' || c.health?.dead) continue; // ships ARE frames; the dead don't move
        const m = c.mover!;
        const t = c.transform!;
        const cdv = m.frameCd ?? 0;
        const cd = cdv > 0 ? ` cd:${cdv.toFixed(2)}` : '';
        const perch = m.onLedge ? ' PERCH' : '';
        const air = m.layer === 'air' ? ' AIR' : '';
        // TRUE speed (tiles per SIM second), MEASURED from displacement rather than read off the stat —
        // mover.vx/vy hold the pre-multiplier INTENT, so a stat readout showed 2.5t/s while perched/wading
        // (the developer's report). Displacement captures every real modifier (terrain, perch, aim, slow,
        // Geppo) and even a blocked walker (reads 0). The denominator is SIM time (wind.time — the sim
        // clock this overlay already holds), NOT wall time: under lag the fixed-step loop time-dilates the
        // whole world, and a wall-clock read showed that dilation (2.5 → 1.2) — true, but noise here; this
        // readout audits MULTIPLIERS, and perf.hud owns frame health (the developer's call). FRAME-AWARE:
        // deck riders measure in DECK coords, so the ship carrying you isn't counted as walking; a frame
        // hop resets the sample instead of spiking.
        const simNow = this.wind.time;
        const fx = c.onDeck ? c.onDeck.lx : t.x;
        const fy = c.onDeck ? c.onDeck.ly : t.y;
        const frameKey = c.onDeck ? c.onDeck.shipId : -1;
        const rec = this.walkSpd.get(c.id);
        let v = rec && rec.frame === frameKey ? rec.v : 0;
        if (rec && rec.frame === frameKey) {
          const sdt = Math.min(0.25, simNow - rec.at);
          if (sdt > 0.001) v += (Math.hypot(fx - rec.x, fy - rec.y) / sdt - v) * 0.25; // light EMA: steady digits
        }
        this.walkSpd.set(c.id, { x: fx, y: fy, at: simNow, frame: frameKey, v });
        const spd = v > 3 ? `  ${(v / TILE).toFixed(1)}t/s` : '';
        const txt = c.onDeck
          ? `DECK ship#${c.onDeck.shipId} local(${c.onDeck.lx.toFixed(0)},${c.onDeck.ly.toFixed(0)})${air}${perch}${cd}${spd}`
          : `WORLD (${t.x.toFixed(0)},${t.y.toFixed(0)}) ${m.mode}${air}${perch}${cd}${spd}`;
        this.label(t.x, t.y + t.r + 14, txt, c.onDeck ? '#7fd7ff' : '#a8e6a1');
      }
    }

    // WIND readout (sailing phase 1) — the world wind as a screen-pinned arrow (top-center, under the DEBUG
    // hint): it points where the wind BLOWS TOWARD; length + label scale with strength. Drawn in world
    // coords at the camera's live view (the shared gfx scrolls), so no extra scroll-locked objects needed.
    // Debug-only until sail states land (the developer's call — the HUD stays untouched).
    if (Debug.on('world.wind')) {
      const v = this.scene.cameras.main.worldView;
      const zoom = this.scene.cameras.main.zoom;
      const cx = v.centerX;
      const cy = v.y + 56 / zoom;
      const len = (14 + 22 * this.wind.strength) / zoom;
      const dx = Math.cos(this.wind.dir);
      const dy = Math.sin(this.wind.dir);
      g.lineStyle(3 / zoom, 0x9fd8ff, 0.95);
      g.lineBetween(cx - dx * len, cy - dy * len, cx + dx * len, cy + dy * len);
      const hx = cx + dx * len;
      const hy = cy + dy * len;
      g.fillStyle(0x9fd8ff, 0.95);
      g.fillTriangle(hx + (dx * 9) / zoom, hy + (dy * 9) / zoom, hx - (dy * 5) / zoom, hy + (dx * 5) / zoom, hx + (dy * 5) / zoom, hy - (dx * 5) / zoom);
      const deg = Math.round((((this.wind.dir * 180) / Math.PI) % 360 + 360) % 360);
      // both units on purpose: % is the sim's truth (a multiplier of WIND_REF — 100% = reference, not max),
      // tiles/s is the absolute read (the ONE debug speed unit — the developer's call) for comparing against
      // hull speeds. Player-facing wind gets NEITHER number (diegetic reads + navigator bands — SAILING.md).
      const wts = ((this.wind.strength * WIND_REF) / TILE).toFixed(1);
      this.label(cx, cy + 14 / zoom, `wind ${deg}°  ${Math.round(this.wind.strength * 100)}% (${wts}t/s)`, '#9fd8ff');
      // PER-SHIP sailing readout — the numbers the momentum feel is tuned by: true speed vs the hull's
      // rating, and the DRIFT angle (velocity vs bow — the disagreement IS the carve; a car reads 0°).
      // Two lines at the hull make it visible: white tick = where the BOW points, cyan arrow = where the
      // MASS is actually going, scaled by speed.
      for (const s of this.world.with('ship', 'transform')) {
        const st = s.transform!;
        const sh = s.ship!;
        const spd = Math.hypot(sh.vx, sh.vy);
        const hull = ShipHulls.get(sh.hull);
        const max = hull.maxSpeed;
        // POINT OF SAIL by the same angle the thrust math reads (bow vs the wind's SOURCE) — named bands
        // matching the playtest card, so "why this speed?" answers itself at a glance. Sail rigs only.
        const off = Math.abs(angleDiff(st.angle, this.wind.dir + Math.PI)) * (180 / Math.PI);
        const pos = hull.rig === 'sail'
          ? `  ${off < 20 ? 'IN IRONS' : off < 52 ? 'close-hauled' : off < 78 ? 'close reach' : off < 102 ? 'beam reach' : off < 150 ? 'broad reach' : 'running'} ${Math.round(off)}°`
          : '';
        if (spd > 1) {
          g.lineStyle(2, 0xffffff, 0.7); // bow tick
          g.lineBetween(st.x, st.y, st.x + Math.cos(st.angle) * st.r, st.y + Math.sin(st.angle) * st.r);
          g.lineStyle(3, 0x35e0c0, 0.9); // velocity arrow — where the mass is really going
          g.lineBetween(st.x, st.y, st.x + (sh.vx / spd) * (st.r * 0.4 + spd * 0.4), st.y + (sh.vy / spd) * (st.r * 0.4 + spd * 0.4));
        }
        let drift = ((Math.atan2(sh.vy, sh.vx) - st.angle) % (Math.PI * 2)) * (180 / Math.PI);
        if (drift > 180) drift -= 360;
        if (drift < -180) drift += 360;
        const driftTxt = spd > 1 ? `  drift ${Math.round(Math.abs(drift))}°` : '';
        // yaw = the ROTATION rate (deg/s, signed: + = swinging to starboard) — the number to read when a
        // turn feels too fast; its ceiling is the hull's turnRate (×authority from waterflow)
        const yawTxt = Math.abs(sh.yaw) > 0.02 ? `  yaw ${sh.yaw > 0 ? '+' : ''}${Math.round(sh.yaw * (180 / Math.PI))}°/s` : '';
        const anchorTxt = sh.anchor === 'up' ? '' : `  ⚓${sh.anchor}`;
        const lashTxt = sh.lash ? '  ⊗lashed' : '';
        // tiles/s — the ONE debug speed unit (walkers + wind match), actual/rated
        this.label(st.x, st.y + st.r + 12, `${sh.sail}  spd ${(spd / TILE).toFixed(1)}/${(max / TILE).toFixed(1)}t/s${pos}${driftTxt}${yawTxt}${anchorTxt}${lashTxt}`, '#35e0c0');
      }
    }

    if (Debug.on('perf.hud')) {
      this.perf.setVisible(true).setText(`fps ${Math.round(this.scene.game.loop.actualFps)}  entities ${this.world.count}  render ×${RENDER_SCALE.toFixed(2)}`);
    } else {
      this.perf.setVisible(false);
    }

    for (let i = this.used; i < this.labels.length; i++) this.labels[i].setVisible(false);
  }
}
