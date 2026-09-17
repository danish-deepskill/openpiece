import { deckOf, tileAt, type DeckTile } from '../defs/decks';
import { angleDiff, clamp } from '../core/math';
import { ShipHulls } from '../defs/ships';
import type { DrawFn } from './actorDraws';

/** TOP-DOWN-HONEST canvas (the wheel precedent: no side-view shapes smuggled into the top-down world): from
 *  above, a sail is cloth seen EDGE-ON — a thin CRESCENT, straight along its spar, bowing to leeward by the
 *  billow. Filled as a quadratic arc (t-sampled) closed back along the spine; slack canvas flattens to a
 *  line, a pressed sail bows deep — the belly depth IS the power readout. `jit` ripples the arc while luffing. */
function sailBand(
  g: Parameters<DrawFn>[0],
  ax: number, ay: number, bx: number, by: number, // the spar: A → B
  px: number, py: number, // unit perpendicular, leeward side
  belly: number,
  jit: number,
): void {
  const pts = [{ x: ax, y: ay }];
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    const arc = 4 * t * (1 - t) * belly + (jit > 0 ? (Math.random() - 0.5) * jit : 0);
    pts.push({ x: ax + (bx - ax) * t + px * arc, y: ay + (by - ay) * t + py * arc });
  }
  pts.push({ x: bx, y: by });
  g.fillPoints(pts, true); // closes A→arc→B→A: the straight return edge IS the spar
  g.strokePoints(pts, true);
}

/** Per-ship VISUAL canvas fraction — presentation-only easing so W/S visibly RUNS the canvas up/down the
 *  mast (the VibeSail tactility) while the sim keeps its three named states (crew orders / AI actions /
 *  netcode all want states, not a throttle). Pace = the hull's `hoistT` (a lugsail flicks, a galleon's plan
 *  takes seconds — size reads as labor). Wall-clock dt is legal on the render side; keyed weakly so a sunk
 *  ship's entry just GCs. A ship first seen mid-state SNAPS (no phantom hoist on spawn). */
const sailAnim = new WeakMap<object, { vis: number; at: number }>();

const DECK_PLANK = 0xcaa06a; // the walkable deck surface (plank)
const RAIL_WOOD = 0x6b4522; // the gunwale wood — a rail tile is a FULL block of it (collision matches exactly)
const RAIL_EDGE = 0x3a2410; // the gunwale's outline
const HELM_TINT = 0x8a6a3a; // the helm station tile, a touch darker than plank so it reads
const CANNON_TILE = 0x4a4a52; // an iron gun tile
const GANGPLANK_WOOD = 0x9a7038; // the gangplank board — a distinct darker plank, the board/leave door in the rail

/** Per-tile deck-surface fill for the WALKABLE tiles only (rail is drawn separately as the full-tile gunwale, so
 *  it is NOT in here — a rail tile gets no deck floor). Stations tint over the plank; the gangplank is its own board. */
const SURFACE_FILL: Partial<Record<DeckTile, number>> = { deck: DECK_PLANK, helm: HELM_TINT, cannon: CANNON_TILE, hole: 0x241a10, gangplank: GANGPLANK_WOOD, mast: DECK_PLANK, hatch: DECK_PLANK }; // hatch: planked floor — the trapdoor (PASS 3) sits ON deck, never on open sea

/**
 * Oriented ship (bow at +x in LOCAL space; RenderSystem rotates the Graphics to the heading). The hull IS the
 * deck grid: walkable tiles are the plank floor; each RAIL tile is a FULL block of gunwale wood (its collision,
 * exactly), with outer corners cosmetically beveled at 45° so the hull tapers like a boat. All auto from the grid.
 */
export const drawShip: DrawFn = (g, e, env) => {
  const sh = e.ship!;
  const d = ShipHulls.get(sh.hull);
  const L = d.length / 2;
  const W = d.width / 2;
  const grid = deckOf(sh.hull, d.deck);
  const s = grid.tilePx;
  const h = s / 2;
  const ship = (cx: number, cy: number): boolean => tileAt(grid, cx, cy) !== undefined; // is there hull here?

  // (water shadow removed — the developer's call: the old ellipse poked past the authored hull taper and
  // read as a dark ring around the boat, not depth. If a shadow returns it must follow the GRID outline.)

  // PASS 1 — the DECK SURFACE: fill only WALKABLE/station tiles with plank (NO fill on rail tiles — a rail is the
  // half-wood-half-sea edge, not floor). One flat color, no per-tile stroke → no box grid.
  for (const c of grid.cells) {
    const f = SURFACE_FILL[c.tile];
    if (f === undefined) continue; // rail → skip (drawn as the gunwale below)
    g.fillStyle(f, 1);
    g.fillRect(c.lx - h, c.ly - h, s, s);
  }

  // PASS 2 — the FULL-TILE GUNWALE (the developer's overhaul: simple collision, shaped looks). Every rail is a
  // FULL cell of wood — exactly its full-tile hitbox, no sub-tile seams. An OUTER CORNER rail (exactly two
  // ADJACENT sea sides) keeps the full-tile HITBOX but draws its sea corner CUT at 45° between the two sea
  // edges' midpoints — a purely COSMETIC bevel so the hull reads as a boat, not a brick. Neighbor-driven, so
  // any authored hull shape works.
  g.fillStyle(RAIL_WOOD, 1);
  g.lineStyle(1, RAIL_EDGE, 0.6);
  for (const c of grid.cells) {
    if (c.tile !== 'rail') continue;
    const seaN = !ship(c.cx, c.cy - 1);
    const seaS = !ship(c.cx, c.cy + 1);
    const seaW = !ship(c.cx - 1, c.cy);
    const seaE = !ship(c.cx + 1, c.cy);
    const x0 = c.lx - h;
    const x1 = c.lx + h;
    const y0 = c.ly - h;
    const y1 = c.ly + h;
    const cornerNW = seaN && seaW && !seaS && !seaE; // sea to the N and W → bevel the NW corner
    const cornerNE = seaN && seaE && !seaS && !seaW;
    const cornerSW = seaS && seaW && !seaN && !seaE;
    const cornerSE = seaS && seaE && !seaN && !seaW;
    if (cornerNW || cornerNE || cornerSW || cornerSE) {
      // a RIGHT TRIANGLE: the two deck-facing edges are the legs, the hypotenuse cuts the full cell diagonal
      // across the sea corner — the classic boat taper (cosmetic; the hitbox stays the full tile)
      let poly;
      if (cornerNW) poly = [{ x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]; // SE half kept
      else if (cornerNE) poly = [{ x: x0, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]; // SW half kept
      else if (cornerSW) poly = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }]; // NE half kept
      else poly = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x0, y: y1 }]; // NW half kept
      g.fillPoints(poly, true);
      g.strokePoints(poly, true);
      continue;
    }
    g.fillRect(x0, y0, s, s);
    g.strokeRect(x0, y0, s, s);
  }

  // PASS 3 — station markers (cannon barrels; the WHEEL is drawn last, after sail/pennant, so nothing covers it).
  for (const c of grid.cells) {
    if (c.tile === 'cannon') {
      g.fillStyle(0x1c1c22, 1);
      const dir = c.ly < 0 ? -1 : 1; // port cannon points −y, starboard +y
      g.fillRect(c.lx - s * 0.12, c.ly - (dir < 0 ? s * 0.5 : 0), s * 0.24, s * 0.5); // stubby barrel off the broadside
    } else if (c.tile === 'hatch') {
      // the HOLD HATCH: a dark inset trapdoor with a plank seam + a ring pull — reads as "the way below", the
      // spot you stand on to reach the cargo
      const h = s * 0.36;
      g.fillStyle(0x2a1c0e, 1);
      g.fillRect(c.lx - h, c.ly - h, h * 2, h * 2);
      g.lineStyle(1.5, 0x4a3018, 1);
      g.strokeRect(c.lx - h, c.ly - h, h * 2, h * 2);
      g.lineBetween(c.lx - h, c.ly, c.lx + h, c.ly); // the plank seam
      g.lineStyle(1.5, 0x8a8a8a, 1);
      g.strokeCircle(c.lx, c.ly - h * 0.45, 2.5); // the iron ring pull
    }
  }

  // THE SHIP'S WHEEL — drawn LAST so nothing on the hull layer paints over it. (The MAST + SAIL moved to
  // drawShipRig: rigging hangs OVERHEAD, so RenderSystem draws it on a lifted layer above the crew.)
  // Top-down-honest
  // (the developer's call): a real wheel stands VERTICALLY facing the helmsman, so from above the rim is a
  // FORESHORTENED ellipse — wide athwartships (its true diameter), squashed fore-aft — with the spoke
  // handles poking past the rim and a small binnacle/pedestal foot just forward. Iconic face-on circle
  // rejected as a projection cheat the sail already spends.
  for (const c of grid.cells) {
    if (c.tile !== 'helm') continue;
    const wx = c.lx + 6; // the wheel stands FORWARD of tile center — the pilot seats abaft, so the pair reads as station+helmsman, not a stack
    const ry = s * 0.36; // athwartships half-diameter (the wheel's real size)
    const rx = ry * 0.4; // fore-aft foreshortening
    g.fillStyle(0x2a1c0e, 1);
    g.fillRect(wx + rx, c.ly - 2, 5, 4); // the pedestal foot, forward of the rim
    g.lineStyle(2.5, 0x2a1c0e, 1);
    g.strokeEllipse(wx, c.ly, rx * 2, ry * 2); // the rim, edge-tilted to the camera
    // the wheel TURNS with the rudder: the spoke phase slides the handle tips around the rim in proportion
    // to the input echo — the readable top-down stand-in for wheel revolutions (a spinning ellipse can't
    // show rotation any other way). Hard over ≈ a quarter-turn of visible handle travel.
    const phase = sh.rudder * 1.2;
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI + phase; // 4 spokes → 8 handle tips past the rim
      const sx = Math.cos(a) * rx * 1.3;
      const sy = Math.sin(a) * ry * 1.3;
      g.lineBetween(wx - sx, c.ly - sy, wx + sx, c.ly + sy);
    }
    g.fillStyle(0x8a6a3a, 1);
    g.fillCircle(wx, c.ly, 2.5); // the hub
  }

  // the RUDDER — deflects with the input echo THE TICK you press (instant acknowledgment; the hull answers
  // late via yaw — that visible gap is what makes the mass read as weight, not lag)
  g.save();
  g.translateCanvas(-L * 0.98, 0);
  // NEGATED on purpose (±~35° hard over): the trailing edge deflects toward the TURN side — rudder to
  // starboard kicks the stern to port and the bow comes starboard. The unsigned version mirrored it.
  g.rotateCanvas(-sh.rudder * 0.6);
  g.fillStyle(0x4a3018, 1);
  g.fillRect(-14, -3, 14, 6);
  g.lineStyle(1, 0x2a1c0e, 0.8);
  g.strokeRect(-14, -3, 14, 6);
  g.restore();

  // anchor down (or coming up): a small chain dot off the stern — reads the STATE, not the old bool
  if (sh.anchor !== 'up') {
    g.fillStyle(0x2b2b33, 0.9);
    g.fillCircle(-L, 0, 4);
  }
};

/** THE RIGGING OVERLAY — everything hung ABOVE head height (spars, canvas, mastheads, the bow flag).
 *  RenderSystem paints this into a separate depth-LIFTED Graphics so the crew walk UNDER the boom (the
 *  developer's catch: the sail was painting beneath the walkers). Same ship-local space as drawShip.
 *  MASTS ARE DECK TILES ('M' in the hull's deck grid): one sail hangs PER mast cell, so a two-masted
 *  galleon is pure deck data and the future ship-building palette just places 'M's. `sailKind` stays
 *  per-HULL for now — per-mast kinds (mixed rigs) arrive with part defs, a data change behind this loop. */
export const drawShipRig: DrawFn = (g, e, env) => {
  const sh = e.ship!;
  const d = ShipHulls.get(sh.hull);
  const L = d.length / 2;
  const W = d.width / 2;
  const grid = deckOf(sh.hull, d.deck);
  // billow reads the momentum vector (way on), not thrust — a luffing ship goes slack
  const vmag = Math.hypot(sh.vx, sh.vy);
  const sailTarget = sh.sail === 'furled' ? 0 : sh.sail === 'quarter' ? 0.35 : sh.sail === 'half' ? 0.6 : 1;
  let anim = sailAnim.get(e);
  if (!anim) {
    anim = { vis: sailTarget, at: performance.now() };
    sailAnim.set(e, anim);
  }
  const now = performance.now();
  const adt = Math.min(0.1, (now - anim.at) / 1000); // capped: a tab-sleep must not teleport the canvas
  anim.at = now;
  // exp ease reaches ~95% in 3τ, so τ = hoistT/3 makes a furled→full hoist READ over ~hoistT seconds
  anim.vis += (sailTarget - anim.vis) * (1 - Math.exp(-(3 / d.hoistT) * adt));
  if (Math.abs(sailTarget - anim.vis) < 0.015) anim.vis = sailTarget; // settle exactly (rest states are crisp)
  const sailVis = anim.vis;
  // SPAR sizes — deliberately LARGE (the developer's read: the rig should command the hull, not decorate
  // it). Rigid wood: constant in every state; only the canvas unrolls (cFrac) and bellies (billow).
  const boomLen = L * 0.85;
  const yardLen = W * 0.8;
  // shared trim geometry (one wind, one ship — every mast reads the same weather until regional wind)
  const wl = (env?.windDir ?? e.transform!.angle + Math.PI) - e.transform!.angle; // wind TOWARD, ship-local
  const off = Math.abs(angleDiff(0, wl + Math.PI)); // bow ↔ wind SOURCE: 0 = in irons … π = dead run
  const side = Math.sin(wl) >= 0 ? 1 : -1; // leeward sign (+ = starboard)
  // LUFFING (the in-irons alarm): canvas set + sail rig + anchor up + almost no way on — wind is hitting
  // the cloth but nothing flows across it, so it flogs. Needs actual WIND to flog: a dead calm (Calm Belt,
  // strength ~0) hangs the canvas limp and STILL — flapping is the wind's doing, not the stall's.
  const luffing = d.rig === 'sail' && sh.anchor === 'up' && vmag < 20 && (env?.windStrength ?? 0.8) > 0.12;
  const billow = sailVis * (4 + W * 0.35 * clamp(vmag / d.maxSpeed, 0, 1) + 7 * (env?.windStrength ?? 0.8));
  const jit = luffing ? 6 : 0; // ripple the arcs while the canvas flogs
  const cFrac = 0.3 + 0.7 * sailVis; // how far the cloth has unrolled along its spar
  for (const m of grid.cells) {
    if (m.tile !== 'mast') continue;
    if (sailVis < 0.05) {
      // FURLED: the spar never leaves — boom resting on the fore-aft line / yard square athwartships,
      // with the canvas bundle lashed along it
      g.lineStyle(2.5, 0x8a6a3a, 1);
      g.fillStyle(0xd8c79a, 1);
      if (d.sailKind === 'foreAft') {
        g.lineBetween(m.lx, m.ly, m.lx - boomLen, m.ly);
        g.fillRect(m.lx - boomLen * 0.8, m.ly - 2, boomLen * 0.55, 4);
      } else {
        g.lineBetween(m.lx, m.ly - yardLen, m.lx, m.ly + yardLen);
        g.fillRect(m.lx - 2, m.ly - yardLen * 0.75, 4, yardLen * 1.5);
      }
    } else {
      // TRIM: the canvas is an ANGLED membrane pivoting at this mast — the picture shows the point of
      // sail (spine near the fore-aft line = close-hauled, squared out = running) and the tack (leeward).
      g.fillStyle(0xf3e7c9, 1);
      g.lineStyle(2, 0xd8c79a, 1);
      if (d.sailKind === 'foreAft') {
        // the boom swings to leeward by ~half the off-wind angle (the sailor's trim rule)
        const trim = clamp(off / 2, 0.15, 1.45);
        const thb = Math.PI - side * trim;
        const bx = Math.cos(thb) * boomLen;
        const by = Math.sin(thb) * boomLen;
        let px = -by / boomLen; // unit perpendicular of the spine…
        let py = bx / boomLen;
        if (px * Math.cos(wl) + py * Math.sin(wl) < 0) {
          px = -px; // …flipped to the DOWNWIND side (the canvas bellies away from the wind)
          py = -py;
        }
        sailBand(g, m.lx, m.ly, m.lx + bx * cFrac, m.ly + by * cFrac, px, py, billow, jit);
        g.lineStyle(2.5, 0x8a6a3a, 1);
        g.lineBetween(m.lx, m.ly, m.lx + bx, m.ly + by); // the full boom spar over the canvas
      } else {
        // 'square': the yard BRACES toward the wind (clamped, like real rigging); canvas bellies downwind
        let dev = wl % Math.PI; // a yard is a LINE (mod π): fold ⟂-to-wind into [−π/2, π/2] of athwartships
        if (dev > Math.PI / 2) dev -= Math.PI;
        if (dev < -Math.PI / 2) dev += Math.PI;
        const thy = Math.PI / 2 + clamp(dev, -0.6, 0.6);
        const yx = Math.cos(thy) * yardLen;
        const yy = Math.sin(thy) * yardLen;
        let px = Math.cos(wl);
        let py = Math.sin(wl);
        // project out the along-yard component so the arc bows perpendicular to its own spar (no shearing)
        const along = (px * yx + py * yy) / yardLen;
        px -= (yx / yardLen) * along;
        py -= (yy / yardLen) * along;
        const pm = Math.hypot(px, py) || 1;
        sailBand(g, m.lx - yx * cFrac, m.ly - yy * cFrac, m.lx + yx * cFrac, m.ly + yy * cFrac, px / pm, py / pm, billow + 4, jit);
        g.lineStyle(2.5, 0x8a6a3a, 1);
        g.lineBetween(m.lx - yx, m.ly - yy, m.lx + yx, m.ly + yy); // the full yard spar over the canvas
      }
    }
    g.fillStyle(0x5a3a1c, 1);
    g.fillCircle(m.lx, m.ly, 4); // the masthead
  }

  // bow flag (marks heading) — at the forward tip
  g.fillStyle(0xd4483b, 1);
  g.fillTriangle(L * 0.96, -3, L * 0.96, -16, L * 0.82, -9);
};
