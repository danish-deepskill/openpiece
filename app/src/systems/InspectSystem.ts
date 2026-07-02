import Phaser from 'phaser';
import { RegKey } from '../config/constants';
import type { World } from '../ecs/World';
import type { SpatialQuery } from '../world/SpatialQuery';
import { unitPlateView } from '../ui/plateView';

/** Click forgiveness around a unit's center (px) — input feel, so file-local rather than sim data. */
const PICK_RANGE = 30;
/** Below the debug overlay (1e6) but above actors, so the ring never hides under bodies. */
const RING_DEPTH = 900_000;

/**
 * RimWorld-style unit inspection: hold V and click any unit to select it; its plate (the same readout the
 * player gets) shows on the HUD until it's deselected (V+click empty ground) or the entity leaves the
 * world. Selection is presentation-only state — it never touches the sim, so determinism/replay are
 * untouched; the future strategic-command selection will be its own sim-side concept (PlayerIntent).
 */
export class InspectSystem {
  private selectedId: number | null = null;
  private readonly keyV: Phaser.Input.Keyboard.Key;
  private readonly gfx: Phaser.GameObjects.Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
    private readonly query: SpatialQuery,
  ) {
    this.keyV = scene.input.keyboard!.addKey('V');
    this.gfx = scene.add.graphics().setDepth(RING_DEPTH);
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.pick(p));
  }

  /** True while the inspect modifier is held — InputSystem reads this so a pick-click never swings. */
  get modifierHeld(): boolean {
    return this.keyV.isDown;
  }

  private pick(p: Phaser.Input.Pointer): void {
    if (!this.keyV.isDown || !p.leftButtonDown()) return;
    const wp = this.scene.cameras.main.getWorldPoint(p.x, p.y);
    // corpses stay pickable until the director removes them — watching a unit die IS inspection
    const hit = this.query.nearest(wp.x, wp.y, PICK_RANGE, (e) => !!e.identity && !!e.health);
    this.selectedId = hit ? hit.id : null; // empty ground = deselect
  }

  /** Once per render frame: publish the selected unit's plate view + draw its selection ring. */
  update(): void {
    this.gfx.clear();
    const e = this.selectedId !== null ? this.world.byId(this.selectedId) : undefined;
    if (!e?.transform) {
      this.selectedId = null; // entity left the world — drop the stale selection
      this.scene.registry.set(RegKey.Inspect, null);
      return;
    }
    const t = e.transform;
    this.gfx.lineStyle(2, 0xf0b429, 0.9);
    this.gfx.strokeCircle(t.x, t.y, t.r + 6);
    this.gfx.lineStyle(1, 0xf0b429, 0.35);
    this.gfx.strokeCircle(t.x, t.y, t.r + 10);
    this.scene.registry.set(RegKey.Inspect, unitPlateView(e));
  }
}
