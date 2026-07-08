import type Phaser from 'phaser';
import { TILE } from '../config/constants';
import type { StructureDef } from '../defs/structures';

/**
 * Per-structure BAKED-VISUAL painters — the strategy rows behind `StructureDef.bake` AND `StructureDef.overlay`
 * (defs/structures.ts). Function-bearing rows live beside their engine (content-is-data canon, like
 * terrainBakes/accessoryDraws): the def carries the KEY (data, serializable); the pixels live here. Each fn
 * paints ONE structure's detail during StructureRenderer's bake — `bake` keys onto the ground layer (over the
 * base-color fill), `overlay` keys onto the ABOVE-ACTORS layer (Depth.Canopy: leaf crowns, blade sweeps) —
 * pure presentation, rebaked only when the structure layer changes (place/remove), free at runtime.
 * StructureRenderer throws at boot on an unknown key, so a def typo fails loud, never as a silently-plain
 * block. Painters receive the ANCHOR cell + the def, so a multi-tile row (3×2 windmill) draws its whole
 * footprint itself.
 */
export type StructureDrawFn = (g: Phaser.GameObjects.Graphics, tx: number, ty: number, d: StructureDef) => void;

/** Deterministic per-cell jitter in [0,1) — gives every instance a stable individual silhouette (crown shape,
 *  blade spin) without Math.random (the same layout must bake the same pixels every session). */
function hash01(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Crown/blade size knobs (visual only — collision is the footprint, never the overlay). */
const CANOPY_RADIUS = 1.4; // tiles of leaf spread from a trunk — ~3 tiles of visual crown per 1-tile trunk
const BLADE_LEN = 1.55; // windmill blade length in tiles from the hub — the sweep overhangs walkable ground

export const structureDraws: Record<string, StructureDrawFn> = {
  // building wall: a lit top edge + dark base so the block reads solid/3D
  wall: (g, x, y) => {
    g.fillStyle(0x6e5a38, 1);
    g.fillRect(x * TILE, y * TILE, TILE + 1, 4);
    g.fillStyle(0x000000, 0.25);
    g.fillRect(x * TILE, y * TILE + TILE - 4, TILE + 1, 4);
  },
  // doorway: wood frame posts on the sides → reads as an N-S opening you pass through (the shut panel
  // between the posts is per-frame presentation — draw/DoorRenderer — because open/close is live state)
  door: (g, x, y) => {
    g.fillStyle(0x6b4a2a, 1);
    g.fillRect(x * TILE, y * TILE, 5, TILE + 1);
    g.fillRect(x * TILE + TILE - 4, y * TILE, 5, TILE + 1);
  },
  // freestanding stone: bright top ridge + dark base + a mortar seam — raised rock, distinct from building wall
  stoneWall: (g, x, y) => {
    g.fillStyle(0xa6a29a, 1);
    g.fillRect(x * TILE, y * TILE, TILE + 1, 5);
    g.fillStyle(0x000000, 0.28);
    g.fillRect(x * TILE, y * TILE + TILE - 5, TILE + 1, 5);
    g.fillStyle(0x6d6a63, 1);
    g.fillRect(x * TILE, y * TILE + TILE / 2 - 1, TILE + 1, 2);
  },
  // GROUND half of a tree only: root shadow + trunk on the 1-tile blocker (the crown is the treeCrown
  // OVERLAY row, baked above actors, so units walk UNDER the leaves)
  tree: (g, x, y) => {
    const cx = x * TILE + TILE / 2;
    const cy = y * TILE + TILE / 2;
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(cx + 3, cy + 8, TILE * 0.9, TILE * 0.42); // ground shadow, offset with the light
    g.fillStyle(0x4a3018, 1);
    g.fillEllipse(cx, cy + 8, TILE * 0.5, 9); // root flare
    g.fillRect(cx - 5, cy - 12, 11, 22); // trunk column
    g.fillStyle(0x6b4a2c, 1);
    g.fillRect(cx - 5, cy - 12, 4, 22); // lit bark edge (sun from the NW)
  },
  // OVERLAY: a tree's leaf crown — an irregular lobed silhouette, per-instance jitter so no two repeat
  treeCrown: (cg, x, y) => {
    const cx = x * TILE + TILE / 2;
    const cy = y * TILE + TILE / 2;
    const R = TILE * CANOPY_RADIUS * (0.86 + 0.28 * hash01(x, y, 1)); // per-tree crown size variation
    const spin = hash01(x, y, 2) * Math.PI; // rotate each tree's lobe ring so silhouettes never repeat
    // dark under-layer: a ring of lobes + a core disc = one irregular crown silhouette
    cg.fillStyle(0x27522c, 1);
    for (let k = 0; k < 6; k++) {
      const a = spin + (k / 6) * Math.PI * 2;
      const rr = R * (0.42 + 0.16 * hash01(x, y, 3 + k));
      cg.fillCircle(cx + Math.cos(a) * R * 0.46, cy + Math.sin(a) * R * 0.42, rr);
    }
    cg.fillCircle(cx, cy, R * 0.64);
    // mid foliage clumps, nudged toward the light (NW)
    cg.fillStyle(0x3a7a40, 1);
    for (let k = 0; k < 5; k++) {
      const a = spin + (k / 5) * Math.PI * 2;
      const rr = R * (0.3 + 0.14 * hash01(x, y, 10 + k));
      cg.fillCircle(cx + Math.cos(a) * R * 0.3 - R * 0.08, cy + Math.sin(a) * R * 0.28 - R * 0.1, rr);
    }
    // sunlit tops: small bright lobes clustered on the NW shoulder
    cg.fillStyle(0x549e55, 1);
    for (let k = 0; k < 4; k++) {
      const a = -2.4 + (k - 1.5) * 0.55 + hash01(x, y, 20 + k) * 0.4;
      cg.fillCircle(cx + Math.cos(a) * R * 0.34, cy + Math.sin(a) * R * 0.32, R * (0.16 + 0.1 * hash01(x, y, 30 + k)));
    }
  },
  // GROUND half of the windmill (3×2): stone footing across the footprint, the round tower on the west pair
  // of cells, a wood door facing south. The blade sweep is the windmillBlades OVERLAY row.
  windmill: (g, x, y, d) => {
    const px = x * TILE;
    const py = y * TILE;
    const w = d.size.w * TILE;
    const h = d.size.h * TILE;
    // footing plinth: lit top edge + dark base, same 3D grammar as wall/stoneWall
    g.fillStyle(0x8f887a, 1);
    g.fillRect(px, py, w + 1, 5);
    g.fillStyle(0x000000, 0.25);
    g.fillRect(px, py + h - 5, w + 1, 5);
    // the round tower, centered on the west 2×2 of the footprint (the east column reads as the mill yard)
    const cx = px + TILE; // tower center: one tile in from the west edge
    const cy = py + h / 2;
    g.fillStyle(0x000000, 0.18);
    g.fillEllipse(cx + 5, cy + 8, TILE * 2.1, TILE * 1.1); // ground shadow, offset with the light
    g.fillStyle(0x9a927e, 1);
    g.fillCircle(cx, cy, TILE * 0.92); // masonry drum
    g.fillStyle(0xb0a890, 1);
    g.fillCircle(cx - TILE * 0.22, cy - TILE * 0.22, TILE * 0.62); // lit shoulder (sun from the NW)
    g.fillStyle(0x6d6a63, 1);
    g.fillCircle(cx, cy, TILE * 0.3); // cap ring the blades mount on
    // south-facing wood door at the drum's foot
    g.fillStyle(0x6b4a2a, 1);
    g.fillRect(cx - 5, py + h - 14, 10, 14);
    // grain sacks in the yard (the east cell pair) so the extra footprint reads as USED, not padding
    g.fillStyle(0xc9b083, 1);
    g.fillEllipse(px + w - TILE * 0.55, cy - 8, 14, 10);
    g.fillEllipse(px + w - TILE * 0.75, cy + 7, 14, 10);
  },
  // OVERLAY: the windmill's blade cross, above actors (walk UNDER the sweep) — static in the bake; a turning
  // mill would move this to a live per-frame sprite when it's worth it
  windmillBlades: (cg, x, y, d) => {
    const cx = x * TILE + TILE; // hub over the tower center (see the windmill ground painter)
    const cy = y * TILE + (d.size.h * TILE) / 2;
    const len = TILE * BLADE_LEN;
    const spin = hash01(x, y, 40) * (Math.PI / 2); // per-mill resting angle so two mills never match
    for (let k = 0; k < 4; k++) {
      const a = spin + Math.PI / 4 + (k * Math.PI) / 2;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const nx = -uy; // perpendicular — the sail's width direction
      const ny = ux;
      // wood spar hub → tip
      cg.lineStyle(3, 0x5a4326, 1);
      cg.lineBetween(cx + ux * 6, cy + uy * 6, cx + ux * len, cy + uy * len);
      // canvas sail: a quad along the spar's trailing side, wider at the tip (classic mill silhouette)
      cg.fillStyle(0xe8e0cc, 1);
      cg.fillPoints(
        [
          { x: cx + ux * (len * 0.3), y: cy + uy * (len * 0.3) },
          { x: cx + ux * len, y: cy + uy * len },
          { x: cx + ux * len + nx * 9, y: cy + uy * len + ny * 9 },
          { x: cx + ux * (len * 0.3) + nx * 5, y: cy + uy * (len * 0.3) + ny * 5 },
        ],
        true,
      );
    }
    cg.fillStyle(0x4a3018, 1);
    cg.fillCircle(cx, cy, 5); // hub
  },
};
