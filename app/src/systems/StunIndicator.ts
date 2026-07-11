import Phaser from 'phaser';
import { Effects, TAG_STUNNED } from '../combat/Effect';
import type { World } from '../ecs/World';

/** Depth: above nameplates/actors so the tell is never hidden behind a body. */
const DEPTH = 9500;

/**
 * The STATUS INDICATOR — a small label over any unit carrying an active effect that declares a `status`
 * readout (EffectDef.status: label + theme color). Fully generic: "Slowed", "Stunned", "Electrified",
 * "Shocked" today; a future burn/chill/fear row shows up here with ZERO changes (the label is content).
 * When several statuses are active, the HARD-CC one (an effect granting state.stunned) wins the line.
 * Presentation-only: reads the sim's active effects; draws nothing sim-side. One pooled Text per affected
 * unit, freed when the last labeled effect ends. Screen-upright under the shift-lock camera spin.
 */
export class StunIndicator {
  private readonly labels = new Map<number, Phaser.GameObjects.Text>();
  private rot = 0; // counter-rotation to stay screen-upright under the shift-lock camera

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
  ) {}

  /** WorldScene passes −camRot so the label stays level while the shift-lock view rotates. */
  setRotation(rot: number): void {
    this.rot = rot;
  }

  update(): void {
    const seen = new Set<number>();
    for (const e of this.world.with('transform', 'effects')) {
      if (e.health?.dead) continue;
      // pick the labeled status to show: a HARD-CC effect (grants state.stunned) outranks a soft one
      let show: { label: string; color: number } | undefined;
      for (const a of e.effects.active) {
        const d = Effects.get(a.id);
        if (!d.status) continue; // unlabeled effects (i-frames, auras) are invisible here
        if (!show || d.grantTags?.includes(TAG_STUNNED)) show = d.status;
      }
      if (!show) continue;
      seen.add(e.id);
      const t = e.transform;
      let label = this.labels.get(e.id);
      if (!label) {
        label = this.scene.add
          .text(0, 0, '', { fontFamily: 'Trebuchet MS', fontStyle: 'bold', fontSize: '9px', stroke: '#000000', strokeThickness: 2 })
          .setOrigin(0.5)
          .setDepth(DEPTH);
        this.labels.set(e.id, label);
      }
      label
        .setText(show.label)
        .setColor(`#${show.color.toString(16).padStart(6, '0')}`)
        .setPosition(t.x, t.y - t.r - 13)
        .setRotation(this.rot)
        .setVisible(true);
    }
    // free the label for any unit no longer carrying a labeled effect (or gone)
    for (const [id, label] of this.labels) {
      if (!seen.has(id)) {
        label.destroy();
        this.labels.delete(id);
      }
    }
  }

  destroy(): void {
    for (const label of this.labels.values()) label.destroy();
    this.labels.clear();
  }
}
