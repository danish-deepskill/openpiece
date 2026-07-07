import { describe, expect, it } from 'vitest';
import { DECK_TILE_PX, deckCanOccupy, deckCellAtLocal, deckHullError, deckHullSize, deckOf, deckToWorld, deckTryMove, deckWalkable, helmSpot, parseDeck, worldToDeck, type DeckTile } from '../src/defs/decks';
import { ShipHulls } from '../src/defs/ships';

/**
 * DECK PARSING (step 1 of the walkable-ship pillar) — the compact string rows a hull authors become a ship-LOCAL
 * tile grid centered on the ship origin (bow = +x). This is the shared substrate for render (now), deck collision
 * (step 2), and helm/cannon stations (step 4), so its coords + glyph mapping are pinned here.
 */
describe('parseDeck', () => {
  it('maps each glyph to its tile kind; a SPACE is off-hull (no cell)', () => {
    const g = parseDeck(['#H.C', 'O.. ']);
    const at = (cx: number, cy: number): DeckTile | undefined => g.cells.find((c) => c.cx === cx && c.cy === cy)?.tile;
    expect(at(0, 0)).toBe('rail');
    expect(at(1, 0)).toBe('helm');
    expect(at(2, 0)).toBe('deck'); // '.'
    expect(at(3, 0)).toBe('cannon');
    expect(at(0, 1)).toBe('hole');
    expect(at(3, 1)).toBeUndefined(); // ' ' → off-hull, no cell exists here
  });

  it('centers the grid on the ship origin — the deck middle sits at local (0,0)', () => {
    const g = parseDeck(['...', '...', '...'], 10); // 3x3 @ 10px → spans 30x30, centered
    // the four corners are symmetric about 0; the center cell is at the origin
    const center = g.cells.find((c) => c.cx === 1 && c.cy === 1)!;
    expect(center.lx).toBeCloseTo(0, 6);
    expect(center.ly).toBeCloseTo(0, 6);
    // the whole deck is symmetric: summed local positions cancel to ~0
    const sx = g.cells.reduce((a, c) => a + c.lx, 0);
    const sy = g.cells.reduce((a, c) => a + c.ly, 0);
    expect(sx).toBeCloseTo(0, 6);
    expect(sy).toBeCloseTo(0, 6);
  });

  it('the BOW is +x: the rightmost column has the largest local x', () => {
    const g = parseDeck(['....'], 10);
    const xs = g.cells.map((c) => c.lx);
    expect(Math.max(...xs)).toBeGreaterThan(0); // bow side
    expect(Math.min(...xs)).toBeLessThan(0); // stern side
    const bow = g.cells.find((c) => c.cx === 3)!; // last column
    expect(bow.lx).toBe(Math.max(...xs));
  });

  it('ragged rows past their end are OFF-HULL, not padded — a short row leaves those cells open sea', () => {
    const g = parseDeck(['#####', '#H']); // second row is short → cols 2..4 of row 1 are off-hull
    expect(g.cols).toBe(5); // grid width still spans the widest row
    expect(g.cells.filter((c) => c.cy === 1)).toHaveLength(2); // only the '#' and 'H' exist; the rest is sea
    expect(g.cells.find((c) => c.cx === 4 && c.cy === 1)).toBeUndefined(); // past the row end = no cell
  });

  it('throws on an unknown glyph — a deck typo fails at boot, never as an invisible hole', () => {
    expect(() => parseDeck(['#X#'])).toThrow(/unknown deck glyph/);
  });

  it('throws on an empty deck', () => {
    expect(() => parseDeck([])).toThrow(/empty deck/);
  });

  it('deckWalkable: stations are walkable deck; rail/hole block', () => {
    expect(deckWalkable('deck')).toBe(true);
    expect(deckWalkable('helm')).toBe(true);
    expect(deckWalkable('cannon')).toBe(true);
    expect(deckWalkable('rail')).toBe(false);
    expect(deckWalkable('hole')).toBe(false);
  });
});

describe('hull shape (the grid IS the boat)', () => {
  it('deckHullSize = the grid bounding box × tile size', () => {
    const g = parseDeck(['####', '#..#', '####'], 10); // 4 cols × 3 rows @ 10px
    expect(deckHullSize(g)).toEqual({ length: 40, width: 30 });
  });

  it('deckHullError flags a walkable cell open to the sea (a gap in the hull)', () => {
    const leaky = parseDeck(['####', '#..#', '##.#']); // the bottom '.' (col 2,row 2) has open sea to the S
    expect(deckHullError(leaky)).toMatch(/open to the sea/);
  });

  it('deckHullError passes a watertight hull (every walkable cell enclosed)', () => {
    const sound = parseDeck(['####', '#..#', '####']);
    expect(deckHullError(sound)).toBeNull();
  });

  it('a rail cell MAY face the sea — it IS the edge (not flagged)', () => {
    const g = parseDeck([' ## ', '#..#', ' ## ']); // rails on the open-sea boundary are fine
    expect(deckHullError(g)).toBeNull();
  });
});

describe('every ship hull has a valid deck', () => {
  it('parses, uses the default tile size, and carries exactly one helm', () => {
    for (const hull of ShipHulls.all()) {
      const g = deckOf(hull.id, hull.deck);
      expect(g.tilePx, `${hull.id} deck tile size`).toBe(DECK_TILE_PX);
      const helms = g.cells.filter((c) => c.tile === 'helm').length;
      expect(helms, `${hull.id} must have exactly one helm`).toBe(1);
      // a walkable interior exists (not all rail) — you can actually stand somewhere
      expect(g.cells.some((c) => deckWalkable(c.tile)), `${hull.id} has no walkable deck`).toBe(true);
    }
  });

  it('deckOf caches — the same hull returns the identical parsed grid object', () => {
    const a = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const b = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    expect(a).toBe(b); // same reference → parsed once
  });
});

describe('deck ↔ world transform (local-space parenting)', () => {
  it('deckToWorld with angle 0 is a plain translate (bow = +x)', () => {
    const w = deckToWorld({ x: 100, y: 50, angle: 0 }, 20, -10);
    expect(w.x).toBeCloseTo(120, 6);
    expect(w.y).toBeCloseTo(40, 6);
  });

  it('deckToWorld rotates the local point by the ship heading', () => {
    // ship at origin, heading +90° (facing +y): a bow-forward local point (+x) lands at +y in the world.
    const w = deckToWorld({ x: 0, y: 0, angle: Math.PI / 2 }, 30, 0);
    expect(w.x).toBeCloseTo(0, 6);
    expect(w.y).toBeCloseTo(30, 6);
  });

  it('worldToDeck is the exact inverse of deckToWorld (roundtrip at an arbitrary pose)', () => {
    const pose = { x: 640, y: 360, angle: 0.7 };
    const world = deckToWorld(pose, 42, -18);
    const back = worldToDeck(pose, world.x, world.y);
    expect(back.lx).toBeCloseTo(42, 6);
    expect(back.ly).toBeCloseTo(-18, 6);
  });

  it('click→tile: a world point over a deck cell resolves back to that cell', () => {
    const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
    const pose = { x: 500, y: 200, angle: 0.4 };
    const helm = helmSpot(grid);
    const helmWorld = deckToWorld(pose, helm.lx, helm.ly); // where the helm tile is in the world
    const local = worldToDeck(pose, helmWorld.x, helmWorld.y); // click there → back to local
    const cell = deckCellAtLocal(grid, local.lx, local.ly);
    expect(cell?.tile).toBe('helm'); // the click resolved to the helm cell
  });
});

describe('deck collision (walking the deck)', () => {
  const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck); // 6×4, rail ring around a 4×2 interior

  it('a small body can stand on a walkable interior cell', () => {
    const c = grid.cells.find((cell) => deckWalkable(cell.tile))!;
    expect(deckCanOccupy(grid, c.lx, c.ly, 6)).toBe(true);
  });

  it('a body cannot stand off the hull (open sea past the deck)', () => {
    // way beyond the grid span in +x
    expect(deckCanOccupy(grid, grid.cols * grid.tilePx, 0, 6)).toBe(false);
  });

  it('the rail BLOCKS a foot body but an AIRBORNE body clears it (low wall)', () => {
    const rail = grid.cells.find((c) => c.tile === 'rail')!;
    // a body centered on the rail cell overlaps it
    expect(deckCanOccupy(grid, rail.lx, rail.ly, 10, false)).toBe(false); // on foot → walled
    expect(deckCanOccupy(grid, rail.lx, rail.ly, 10, true)).toBe(true); // airborne → clears the low rail
  });

  it('deckTryMove walls a foot walker at the rail — it slides, does not pass into the sea', () => {
    // start on an interior cell, push hard toward +x (the bow rail); the walker should not end up off-hull
    const interior = grid.cells.filter((c) => deckWalkable(c.tile)).reduce((a, b) => (b.lx > a.lx ? b : a)); // easternmost walkable
    const pos = { lx: interior.lx, ly: interior.ly };
    for (let i = 0; i < 50; i++) deckTryMove(pos, 5, 0, grid, 6, false); // shove east repeatedly
    expect(deckCanOccupy(grid, pos.lx, pos.ly, 6, false)).toBe(true); // still on a valid deck spot (walled, not off-ship)
    expect(pos.lx).toBeLessThan(grid.cols * grid.tilePx / 2); // did not cross the hull's +x edge
  });
});
