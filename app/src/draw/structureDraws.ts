import type Phaser from 'phaser';
import { TILE } from '../config/constants';
import type { StructureDef } from '../defs/structures';

/**
 * Per-structure BAKED-VISUAL painters — the strategy rows behind `StructureDef.bake` (defs/structures.ts).
 * Function-bearing rows live beside their engine (content-is-data canon, like terrainBakes/accessoryDraws):
 * the def carries the KEY (data, serializable); the pixels live here. Each fn paints ONE structure's detail
 * over its base-color fill during StructureRenderer's bake — pure presentation, rebaked only when the
 * structure layer changes (place/remove), free at runtime. StructureRenderer throws at boot on an unknown
 * key, so a def typo fails loud, never as a silently-plain block. Painters receive the ANCHOR cell + the def,
 * so a multi-tile row (3×2 windmill) draws its whole footprint itself.
 */
export type StructureDrawFn = (g: Phaser.GameObjects.Graphics, tx: number, ty: number, d: StructureDef) => void;

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
  // GROUND half of a tree only: root shadow + trunk on the 1-tile blocker (the crown is the separate canopy
  // overlay ABOVE actors — StructureRenderer's canopy pass, keyed on StructureDef.canopy — so units walk UNDER it)
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
};
