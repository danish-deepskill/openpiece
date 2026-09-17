import Phaser from 'phaser';
import { tierColor } from '../combat/PowerTier';
import { entityHostile } from '../combat/targeting';
import { Depth } from '../config/constants';
import type { World } from '../ecs/World';
import { addText } from '../ui/text';

const COLOR_SELF = '#ffd24a'; // the body you control
const COLOR_HOSTILE = '#ff6b5a'; // hostile to your faction
const COLOR_NEUTRAL = '#f4ead2'; // allies / neutrals
const GAP = 4; // px between name and tier on the line

/**
 * Always-on nameplates over each unit: the name (colored by allegiance — you/hostile/neutral) followed on
 * the same line by the power tier, colored by rank (F gray … SSS gold). Two pooled Text objects per unit
 * (one per color) are width-measured and laid out so they read as one centered "Name Tier" label.
 */
export class NameplateSystem {
  private readonly nameP: Phaser.GameObjects.Text[] = [];
  private readonly tierP: Phaser.GameObjects.Text[] = [];
  private textRot = 0; // counter-rotation (rad) to keep labels screen-upright under the shift-lock camera

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
  ) {}

  /** Keep nameplates screen-upright while the world camera spins (shift lock): the WorldScene passes −camRot. */
  setTextRotation(rot: number): void {
    this.textRot = rot;
  }

  update(): void {
    let n = 0;
    let ti = 0;
    const me = this.world.first('control');
    for (const e of this.world.with('transform', 'render')) {
      const idn = e.identity;
      if (!idn?.name || e.health?.dead) continue;
      const t = e.transform!;
      const above = t.r + 13; // distance the label sits ABOVE the unit (on screen)
      const nameColor =
        e === me
          ? COLOR_SELF
          : me && entityHostile(me, e) // faction-hostile OR a personal grudge either way (a betrayed ally reads red)
            ? COLOR_HOSTILE
            : COLOR_NEUTRAL;

      const nameText = this.slot(this.nameP, n++).setText(idn.name).setColor(nameColor);
      const tierStr = idn.tier ?? '';
      const tierText = tierStr ? this.slot(this.tierP, ti++).setText(tierStr).setColor(tierColor(tierStr)) : undefined;

      // The whole "Name Tier" line counter-rotates as a RIGID unit about the actor center (t.x,t.y) so it
      // stays ABOVE the unit ON SCREEN and upright while the shift-lock camera spins. Each segment's local
      // offset (right = dx from line-left, up = `above`) is rotated by textRot into world space; the glyphs
      // also rotate by textRot to read level. (Just rotating the glyphs left the line pinned world-above, so a
      // 180° view flip dropped it BELOW the unit — this rotates the anchor too.)
      const total = nameText.width + (tierText ? GAP + tierText.width : 0);
      const cos = Math.cos(this.textRot);
      const sin = Math.sin(this.textRot);
      const place = (txt: Phaser.GameObjects.Text, dx: number): void => {
        const lx = dx - total / 2; // local right offset (along the label line)
        const ly = -above; // local up offset (the label sits this far above the unit, on screen)
        // rotate the local (lx, ly) into world space about the actor center, then place + orient the glyphs
        txt.setPosition(t.x + lx * cos - ly * sin, t.y + lx * sin + ly * cos).setRotation(this.textRot).setVisible(true);
      };
      place(nameText, 0);
      if (tierText) place(tierText, nameText.width + GAP);
    }
    for (let i = n; i < this.nameP.length; i++) this.nameP[i].setVisible(false);
    for (let i = ti; i < this.tierP.length; i++) this.tierP[i].setVisible(false);
  }

  private slot(pool: Phaser.GameObjects.Text[], i: number): Phaser.GameObjects.Text {
    let o = pool[i];
    if (!o) {
      o = addText(this.scene, 0, 0, '', { fontFamily: 'Trebuchet MS', fontStyle: 'bold', fontSize: '11px', color: '#ffffff', stroke: '#20242a', strokeThickness: 3 })
        .setOrigin(0, 1) // left-bottom, so the two segments lay out left-to-right on one baseline
        .setDepth(Depth.Prompt);
      pool[i] = o;
    }
    return o;
  }
}
