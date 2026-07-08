import Phaser from 'phaser';
import { Depth, TILE, WORLD_H, WORLD_W } from '../config/constants';
import { Structures } from '../defs/structures';
import type { TileGrid } from '../world/TileGrid';
import { structureDraws } from './structureDraws';

/** Above-actors layer translucency (visual only — collision is the footprint, never the overlay).
 *  1 = a solid roof of leaves/blades; lower keeps units under the overhang dimly visible. Applied to the
 *  whole texture (not per-fill) so overlapping crowns can't stack darker. */
const OVERLAY_ALPHA = 0.85;

/**
 * Bakes the STRUCTURE layer into two RenderTextures — the GROUND pass (base-color fills + `bake` painters:
 * walls, door frames, trunks, the mill) and the ABOVE-ACTORS pass (`overlay` painters at Depth.Canopy: leaf
 * crowns, blade sweeps — units walk under them). Entirely def-driven: colors and keys come from StructureDef
 * rows, the painters are strategy rows in structureDraws.ts. Unlike the terrain bake (static for a level's
 * lifetime), structures can change — a door is per-frame state elsewhere (DoorRenderer), but place/remove
 * (building, destruction later) REBAKES here: update() watches the index's version counter (the dirty flag)
 * and repaints only when it moved, so the steady-state per-frame cost is one integer compare.
 */
export class StructureRenderer {
  private readonly rt: Phaser.GameObjects.RenderTexture;
  private readonly crt: Phaser.GameObjects.RenderTexture;
  private baked = -1; // last-baked index version; -1 = never (first update() always bakes)

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly grid: TileGrid,
  ) {
    // fail LOUD before painting anything: every def's bake AND overlay key must resolve to a painter (the
    // structure twin of the terrain-bake boot sweep) — a typo'd key must never ship as a silently-plain block.
    for (const d of Structures.all()) {
      if (d.bake && !structureDraws[d.bake]) throw new Error(`StructureRenderer: def '${d.id}' names unknown bake '${d.bake}'`);
      if (d.overlay && !structureDraws[d.overlay]) throw new Error(`StructureRenderer: def '${d.id}' names unknown overlay '${d.overlay}'`);
    }
    this.rt = scene.add.renderTexture(0, 0, WORLD_W, WORLD_H).setOrigin(0, 0);
    this.rt.setDepth(Depth.Structure);
    this.crt = scene.add.renderTexture(0, 0, WORLD_W, WORLD_H).setOrigin(0, 0);
    this.crt.setDepth(Depth.Canopy);
    this.crt.setAlpha(OVERLAY_ALPHA);
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
      // key existence swept in the ctor — a miss can't reach here
      if (d.bake) structureDraws[d.bake]!(g, s.tx, s.ty, d);
      if (d.overlay) structureDraws[d.overlay]!(cg, s.tx, s.ty, d);
    }
    this.rt.clear();
    this.rt.draw(g);
    g.destroy();
    this.crt.clear();
    this.crt.draw(cg);
    cg.destroy();
  }
}
