import Phaser from 'phaser';
import { Depth, TILE, WORLD_H, WORLD_W } from '../config/constants';
import { Structures, type StructureDef } from '../defs/structures';
import type { Structure } from '../ecs/components';
import type { TileGrid } from '../world/TileGrid';
import { structureDraws } from './structureDraws';

/** Canopy overlay knobs (visual only — the trunk tile is the blocker; the leaves overhang walkable tiles). */
const CANOPY_ALPHA = 0.85; // 1 = solid leaf roof; lower lets units under the overhang stay dimly visible
const CANOPY_RADIUS = 1.4; // tiles of leaf spread from the trunk — ~3 tiles of visual crown per 1-tile trunk

/** Deterministic per-cell jitter in [0,1) — gives every tree a stable individual silhouette without
 *  Math.random (the same layout must bake the same pixels every session). */
function hash01(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Bakes the STRUCTURE layer (wall/door/trunk visuals + the canopy overlay) into two RenderTextures — entirely
 * def-driven: base colors and bake keys come from StructureDef rows, the painters are strategy rows in
 * structureDraws.ts. Unlike the terrain bake (static for a level's lifetime), structures can change — a door
 * is per-frame state elsewhere (DoorRenderer), but place/remove (building, destruction later) REBAKES here:
 * update() watches the index's version counter (the dirty flag) and repaints only when it moved, so the
 * steady-state per-frame cost is one integer compare.
 */
export class StructureRenderer {
  private readonly rt: Phaser.GameObjects.RenderTexture;
  private readonly crt: Phaser.GameObjects.RenderTexture;
  private baked = -1; // last-baked index version; -1 = never (first update() always bakes)

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly grid: TileGrid,
  ) {
    // fail LOUD before painting anything: every def's bake key must resolve to a painter (the structure twin
    // of the terrain-bake boot sweep) — a typo'd key must never ship as a silently-plain block.
    for (const d of Structures.all()) {
      if (d.bake && !structureDraws[d.bake]) throw new Error(`StructureRenderer: def '${d.id}' names unknown bake '${d.bake}'`);
    }
    this.rt = scene.add.renderTexture(0, 0, WORLD_W, WORLD_H).setOrigin(0, 0);
    this.rt.setDepth(Depth.Structure);
    // the whole canopy texture gets CANOPY_ALPHA (not per-fill alpha) so overlapping crowns can't stack darker
    this.crt = scene.add.renderTexture(0, 0, WORLD_W, WORLD_H).setOrigin(0, 0);
    this.crt.setDepth(Depth.Canopy);
    this.crt.setAlpha(CANOPY_ALPHA);
    this.update(); // correct look before the first play frame
  }

  /** Rebake only when the structure set changed (place/remove bumps the index version) — the dirty flag. */
  update(): void {
    if (this.grid.structures.version === this.baked) return;
    this.baked = this.grid.structures.version;
    this.bake();
  }

  private bake(): void {
    const g = this.scene.add.graphics();
    const cg = this.scene.add.graphics();
    for (const e of this.grid.structures.all()) {
      const s = e.structure;
      const d = Structures.get(s.def);
      if (d.color !== undefined) {
        g.fillStyle(d.color, 1);
        g.fillRect(s.tx * TILE, s.ty * TILE, d.size.w * TILE + 1, d.size.h * TILE + 1);
      }
      if (d.bake) structureDraws[d.bake]!(g, s.tx, s.ty, d); // key existence swept in the ctor — a miss can't reach here
      if (d.canopy) this.drawCrown(cg, s, d);
    }
    this.rt.clear();
    this.rt.draw(g);
    g.destroy();
    this.crt.clear();
    this.crt.draw(cg);
    cg.destroy();
  }

  /** One tree's leaf crown, centered on its footprint — baked at Depth.Canopy, above the actor y-sort band,
   *  so units on the walkable tiles around a trunk pass UNDER the leaves. */
  private drawCrown(cg: Phaser.GameObjects.Graphics, s: Structure, d: StructureDef): void {
    const cx = (s.tx + d.size.w / 2) * TILE;
    const cy = (s.ty + d.size.h / 2) * TILE;
    const R = TILE * CANOPY_RADIUS * (0.86 + 0.28 * hash01(s.tx, s.ty, 1)); // per-tree crown size variation
    const spin = hash01(s.tx, s.ty, 2) * Math.PI; // rotate each tree's lobe ring so silhouettes never repeat
    // dark under-layer: a ring of lobes + a core disc = one irregular crown silhouette
    cg.fillStyle(0x27522c, 1);
    for (let k = 0; k < 6; k++) {
      const a = spin + (k / 6) * Math.PI * 2;
      const rr = R * (0.42 + 0.16 * hash01(s.tx, s.ty, 3 + k));
      cg.fillCircle(cx + Math.cos(a) * R * 0.46, cy + Math.sin(a) * R * 0.42, rr);
    }
    cg.fillCircle(cx, cy, R * 0.64);
    // mid foliage clumps, nudged toward the light (NW)
    cg.fillStyle(0x3a7a40, 1);
    for (let k = 0; k < 5; k++) {
      const a = spin + (k / 5) * Math.PI * 2;
      const rr = R * (0.3 + 0.14 * hash01(s.tx, s.ty, 10 + k));
      cg.fillCircle(cx + Math.cos(a) * R * 0.3 - R * 0.08, cy + Math.sin(a) * R * 0.28 - R * 0.1, rr);
    }
    // sunlit tops: small bright lobes clustered on the NW shoulder
    cg.fillStyle(0x549e55, 1);
    for (let k = 0; k < 4; k++) {
      const a = -2.4 + (k - 1.5) * 0.55 + hash01(s.tx, s.ty, 20 + k) * 0.4;
      cg.fillCircle(cx + Math.cos(a) * R * 0.34, cy + Math.sin(a) * R * 0.32, R * (0.16 + 0.1 * hash01(s.tx, s.ty, 30 + k)));
    }
  }
}
