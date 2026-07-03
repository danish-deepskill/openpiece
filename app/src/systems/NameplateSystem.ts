import Phaser from 'phaser';
import { tierColor } from '../combat/PowerTier';
import { entityHostile } from '../combat/targeting';
import { Depth } from '../config/constants';
import type { World } from '../ecs/World';

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

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
  ) {}

  update(): void {
    let n = 0;
    let ti = 0;
    const me = this.world.first('control');
    for (const e of this.world.with('transform', 'render')) {
      const idn = e.identity;
      if (!idn?.name || e.health?.dead) continue;
      const t = e.transform!;
      const y = t.y - t.r - 13;
      const nameColor =
        e === me
          ? COLOR_SELF
          : me && entityHostile(me, e) // faction-hostile OR a personal grudge either way (a betrayed ally reads red)
            ? COLOR_HOSTILE
            : COLOR_NEUTRAL;

      const nameText = this.slot(this.nameP, n++).setText(idn.name).setColor(nameColor);
      const tierStr = idn.tier ?? '';
      const tierText = tierStr ? this.slot(this.tierP, ti++).setText(tierStr).setColor(tierColor(tierStr)) : undefined;

      // center the combined "Name Tier" line around the unit
      const total = nameText.width + (tierText ? GAP + tierText.width : 0);
      const left = t.x - total / 2;
      nameText.setPosition(left, y).setVisible(true);
      if (tierText) tierText.setPosition(left + nameText.width + GAP, y).setVisible(true);
    }
    for (let i = n; i < this.nameP.length; i++) this.nameP[i].setVisible(false);
    for (let i = ti; i < this.tierP.length; i++) this.tierP[i].setVisible(false);
  }

  private slot(pool: Phaser.GameObjects.Text[], i: number): Phaser.GameObjects.Text {
    let o = pool[i];
    if (!o) {
      o = this.scene.add
        .text(0, 0, '', { fontFamily: 'Trebuchet MS', fontStyle: 'bold', fontSize: '11px', color: '#ffffff', stroke: '#20242a', strokeThickness: 3 })
        .setOrigin(0, 1) // left-bottom, so the two segments lay out left-to-right on one baseline
        .setDepth(Depth.Prompt);
      pool[i] = o;
    }
    return o;
  }
}
