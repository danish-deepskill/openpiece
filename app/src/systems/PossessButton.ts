import Phaser from 'phaser';
import type { World } from '../ecs/World';
import type { GameDirector } from './GameDirector';
import type { InspectSystem } from './InspectSystem';
import { addText } from '../ui/text';

/**
 * The POSSESS button (debug). Rides the EXISTING inspect flow — no new key/pick: V+click a unit (InspectSystem
 * selects it, its ring shows), and this overlay floats a "▶ Control [Name]" button over that unit. Clicking the
 * BUTTON hands human control to it via GameDirector.possess (the canonical Moat path — moves `control`, releases
 * the old body to its AI, backfills avatar/combatant/effects so ANY body is playable). Camera + input already
 * follow world.first('control'), so the swap is the whole feature.
 *
 * Presentation-only: reads InspectSystem's selection + the world; the body-swap lives in GameDirector (sim-facing).
 * World-space (follows the unit). Hidden for the unit you ALREADY control (nothing to possess).
 */
export class PossessButton {
  private readonly box: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
    private readonly inspect: InspectSystem,
    private readonly director: GameDirector,
  ) {
    this.box = scene.add
      .rectangle(0, 0, 120, 26, 0x1b2b1b, 0.92)
      .setStrokeStyle(2, 0x6cff8a)
      .setDepth(9002)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.label = addText(scene, 0, 0, '', { fontFamily: 'Trebuchet MS', fontStyle: 'bold', fontSize: '13px', color: '#d8ffe0' })
      .setOrigin(0.5)
      .setDepth(9003)
      .setVisible(false);
    // clicking the BUTTON possesses the inspected unit. stopPropagation so the inspect pick-click underneath
    // doesn't ALSO re-fire (which would just re-select the same unit — harmless, but cleaner to stop it).
    this.box.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev?: Phaser.Types.Input.EventData) => {
      ev?.stopPropagation();
      const id = this.inspect.selected;
      const target = id !== null ? this.world.byId(id) : undefined;
      if (target) this.director.possess(target);
    });
  }

  update(): void {
    const id = this.inspect.selected;
    const target = id !== null ? this.world.byId(id) : undefined;
    // show the button ONLY for an inspected unit that isn't the one you already drive (nothing to possess there)
    if (!target?.transform || target.control) {
      this.box.setVisible(false);
      this.label.setVisible(false);
      return;
    }
    const t = target.transform;
    const bx = t.x;
    const by = t.y - t.r - 26; // float above the unit's head (above the inspect ring)
    const name = target.identity?.name ?? 'unit';
    this.label.setText(`▶ Control ${name}`).setVisible(true);
    this.box.setSize(this.label.width + 20, 26).setPosition(bx, by).setVisible(true); // size the plate to the text
    this.label.setPosition(bx, by);
  }

  destroy(): void {
    this.box.destroy();
    this.label.destroy();
  }
}
