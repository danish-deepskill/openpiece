import Phaser from 'phaser';
import { Depth, TILE, WIND_REF } from '../config/constants';
import { terrainByOrdinal } from '../defs/terrains';
import type { TileGrid } from '../world/TileGrid';
import type { WindSystem } from '../systems/WindSystem';

const CREST = 0xffffff; // wave-crest colour
const CREST_ALPHA = 0.05; // very faint — a shimmer, not a glare (grand_voyage used 0.04)
const BOB = 6; // px the crest line drifts vertically within its tile
const PHASE_X = 0.6; // spatial phase per tile in x …
const PHASE_Y = 0.4; // … and y — together they make the crests travel diagonally
const SPEED = 1.4; // time phase (rad/s)

/** WIND STREAKS — the sea itself is the wind indicator (the VibeSail steal, replacing the per-ship pennant):
 *  faint elongated lines oriented ALONG the wind, drifting with it, everywhere on open water. World-anchored
 *  in a repeating grid of cells so the pattern is stable under camera motion; per-streak fade cycles hide the
 *  wrap-around pops. */
const STREAK_PERIOD = 512; // px — the repeating world cell each streak family lives in
const STREAK_MAX = 9; // streaks per cell at full storm — DENSITY is the strength signal that reads in a
//                       single frame (speed only reads in motion): each streak has a stable hash RANK and
//                       eases in as strength covers it, so the count breathes without pop-in
const STREAK_DENSITY = 0.83; // strength → visible fraction of STREAK_MAX (reference breeze ≈ 7 of 9)
const STREAK_ALPHA = 0.16;
const STREAK_WIDTH = 2.5; // px line width — 1.5 read too thin against the crest shimmer (playtest feedback)
const STREAK_WIND_FRAC = 1.0; // streak speed as a fraction of the TRUE wind (strength × WIND_REF): the
//                               streaks ARE the air moving, so on a dead run they barely overtake you
//                               (apparent wind, read for free) and upwind they scream past. 1.0 ⇒ 260 px/s
//                               at 100%, 520 at a 200% storm — the ONE speed-feel knob.
const STREAK_FADE = 0.55; // rad/s FLOOR of each streak's fade cycle — the live rate scales with drift speed
//                           so a streak's modular wrap (a 512px teleport) statistically lands near its dim
//                           phase at ANY wind speed, not just the speed the constant was tuned at
const STREAK_CALM = 0.625; // strength below which the streaks THIN toward invisible — a calm reads as a dead
//                            sea, not slow lines. Sits at the natural band's floor so everyday weather never dims.
const TRAIL_STEP = 14; // px of drift between trail samples — the trail is DISTANCE-quantized, not time-
//                        quantized: a streamline's shape is spatial, so the streak body stays ~80px at any
//                        wind speed (time sampling stretched it into 350px lines once drift hit true-wind pace)
const TRAIL_POINTS = 7; // max samples kept ⇒ body ≈ (TRAIL_POINTS−1) × TRAIL_STEP

/** Tiny seeded hash → [0,1) — placement only (presentation), stable per (cell, k). */
function h01(a: number, b: number, k: number): number {
  let x = (a * 73856093) ^ (b * 19349663) ^ (k * 83492791);
  x = Math.imul(x ^ (x >>> 13), 0x5bd1e995);
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

/**
 * Animated sea in the grand_voyage style: faint white wave-crest lines that ripple across the deep water. Redrawn
 * every frame, but VIEWPORT-CULLED to the visible water tiles only (~a couple hundred rects at 2× zoom) — so it's
 * the stylised look without the "redraw the whole map each frame" lag trap. The water colour stays baked flat
 * (deep navy + teal shallows); this crest overlay is the only moving layer, and it ripples across both. Coastline
 * foam remains baked.
 */
export class SeaRenderer {
  private readonly g: Phaser.GameObjects.Graphics;
  private t = 0;
  /** Accumulated streak drift (px) — integrated INCREMENTALLY each frame along the wind's CURRENT
   *  direction. Never recompute as direction×totalTime: applying the live direction to the whole
   *  accumulated displacement made every veer ROTATE the entire field around a phantom center thousands
   *  of px out (the "streaks orbit a massive circle" report). Past travel is history; a veer only bends
   *  what comes next. */
  private driftX = 0;
  private driftY = 0;
  /** Recent drift positions (distance-quantized ring, oldest first) — the SHARED CURVE every streak draws:
   *  in a uniform wind all particles ride the same path, so one global history curves every streak correctly
   *  through a veer at zero per-streak state. Upgrade to per-particle trails only when the wind becomes
   *  position-dependent (regional fields) — then different places genuinely curve differently. */
  private readonly tail: { x: number; y: number }[] = [];
  /** Fade-cycle phase (rad) — INTEGRATED incrementally because the rate rides the wind speed; `t × rate`
   *  would snap every streak's alpha the moment strength changes (the orbit artifact's cousin). */
  private fadePhase = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly grid: TileGrid,
    private readonly wind: WindSystem, // the streaks stream the LIVE wind — the sea is the wind indicator
  ) {
    this.g = scene.add.graphics().setDepth(Depth.Sea);
  }

  update(dt: number): void {
    this.t += dt;
    const g = this.g;
    g.clear();
    const view = this.scene.cameras.main.worldView; // visible world rect — only draw crests inside it
    const x0 = Math.max(0, Math.floor(view.x / TILE));
    const y0 = Math.max(0, Math.floor(view.y / TILE));
    const x1 = Math.min(this.grid.w, Math.ceil((view.right) / TILE));
    const y1 = Math.min(this.grid.h, Math.ceil((view.bottom) / TILE));
    g.fillStyle(CREST, CREST_ALPHA);
    for (let ty = y0; ty < y1; ty++) {
      const row = this.grid.tiles[ty];
      for (let tx = x0; tx < x1; tx++) {
        const t = row[tx];
        if (terrainByOrdinal(t).water === undefined) continue; // both deep + shallow water ripple
        const ph = Math.sin(tx * PHASE_X + ty * PHASE_Y + this.t * SPEED) * 0.5 + 0.5;
        g.fillRect(tx * TILE, ty * TILE + ph * BOB, TILE + 1, 3);
      }
    }

    // WIND STREAKS: world-anchored repeating cells (stable under camera motion); each streak drifts along
    // the live wind, lengthens with strength, and fades on its own cycle so the modular wrap never pops in
    // view. Water-only (a streak whose head is on land is skipped — the coast clips the weather).
    const cos = Math.cos(this.wind.dir);
    const sin = Math.sin(this.wind.dir);
    // drift speed = the TRUE wind (strength × WIND_REF, × the one feel knob) — a gale streams, a calm
    // stalls. Correct for free because the integration is incremental: the shared trail simply records
    // however far the wind actually travelled
    const drift = this.wind.strength * WIND_REF * STREAK_WIND_FRAC;
    this.driftX += cos * drift * dt; // incremental integration — see the driftX/driftY field note
    this.driftY += sin * drift * dt;
    // fade phase: rate scales with speed (wraps must land near dim phases at any wind), integrated not t×rate
    this.fadePhase += (STREAK_FADE + (drift / STREAK_PERIOD) * Math.PI * 2) * dt;
    // sample the shared curve every TRAIL_STEP px of travel (spatial, not temporal — see the const note)
    const last = this.tail[this.tail.length - 1];
    if (!last || Math.hypot(this.driftX - last.x, this.driftY - last.y) >= TRAIL_STEP) {
      this.tail.push({ x: this.driftX, y: this.driftY });
      if (this.tail.length > TRAIL_POINTS) this.tail.shift();
    }
    // the streak = the shared trail (relative offsets, oldest → now) + a short head along the CURRENT wind
    // (strength lengthens the head, so gusts visibly stretch the streaks)
    const offs = this.tail.map((p) => ({ x: p.x - this.driftX, y: p.y - this.driftY }));
    const headLen = 8 + 22 * this.wind.strength;
    // calm thinning: below the natural floor the streaks fade toward nothing (0 wind = 0 streaks) — the
    // ABSENCE of weather is itself the signal, matching the sails going slack
    const vis = Math.min(1, this.wind.strength / STREAK_CALM);
    if (vis <= 0.01) return; // dead calm: no streaks at all (skip the whole cell sweep)
    const density = Math.min(1, this.wind.strength * STREAK_DENSITY); // fraction of each cell's ranks awake
    const len = (TRAIL_POINTS - 1) * TRAIL_STEP + headLen; // conservative culling margin for the cell sweep below
    const P = STREAK_PERIOD;
    const cx0 = Math.floor((view.x - len - P) / P);
    const cy0 = Math.floor((view.y - len - P) / P);
    const cx1 = Math.floor((view.right + len) / P);
    const cy1 = Math.floor((view.bottom + len) / P);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let k = 0; k < STREAK_MAX; k++) {
          // density gate: streak k wakes when strength covers its stable rank — the 0.12 ramp eases each
          // one in over a band of strength instead of popping at a threshold
          const wake = Math.min(1, Math.max(0, (density - h01(cx, cy, k + 303)) / 0.12));
          if (wake <= 0) continue;
          const sx = cx * P + ((h01(cx, cy, k) * P + this.driftX) % P + P) % P;
          const sy = cy * P + ((h01(cx, cy, k + 101) * P + this.driftY) % P + P) % P;
          if (terrainByOrdinal(this.grid.tileAtPx(sx, sy)).water === undefined) continue;
          const fade = 0.5 + 0.5 * Math.sin(this.fadePhase + h01(cx, cy, k + 202) * Math.PI * 2);
          g.lineStyle(STREAK_WIDTH, CREST, STREAK_ALPHA * fade * vis * wake);
          // the CURVED streak: the shared wind-history trail behind the head, then the head along the live
          // wind — a veer bends every streak through the turn in real time
          g.beginPath();
          if (offs.length > 0) {
            g.moveTo(sx + offs[0].x, sy + offs[0].y);
            for (let i = 1; i < offs.length; i++) g.lineTo(sx + offs[i].x, sy + offs[i].y);
            g.lineTo(sx, sy);
          } else {
            g.moveTo(sx, sy);
          }
          g.lineTo(sx + cos * headLen, sy + sin * headLen);
          g.strokePath();
        }
      }
    }
  }
}
