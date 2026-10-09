import Phaser from 'phaser';
import { clamp } from '../core/math';
import type { UnitPlateView } from './plateView';
import { addText } from './text';

/** Content height of the plate (name + bars + meta + stat rows + gear/bag rows). Cards may be taller — the
 *  player's plate reserves extra space below for the ability bar — but the readout block itself is fixed. */
export const PLATE_CONTENT_H = 150;

const css = (c: number): string => '#' + c.toString(16).padStart(6, '0');

/**
 * THE unit readout — every plate on screen is an instance of this class, so any unit (hero, brute,
 * townsperson) presents identically: name · tier · faction, hp/stam bars, squad/AI state, the six
 * attributes, and the effective combat stats. Extras (ability bar, combo) are the HUD's business and are
 * drawn OUTSIDE the content block, never inside it — that's what keeps the readout consistent per unit.
 */
export class UnitPlate {
  private readonly name: Phaser.GameObjects.Text;
  private readonly tier: Phaser.GameObjects.Text;
  private readonly faction: Phaser.GameObjects.Text;
  private readonly hp: Phaser.GameObjects.Text;
  private readonly meta: Phaser.GameObjects.Text;
  private readonly attrs: Phaser.GameObjects.Text;
  private readonly combat: Phaser.GameObjects.Text;
  private readonly gear: Phaser.GameObjects.Text;
  private readonly bag: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    readonly x: number,
    readonly y: number,
    readonly w: number,
    /** Card height — PLATE_CONTENT_H, or more when the caller appends its own rows below the readout. */
    readonly h: number = PLATE_CONTENT_H,
  ) {
    const mk = (tx: number, ty: number, style: Phaser.Types.GameObjects.Text.TextStyle) =>
      addText(scene, tx, ty, '', style).setDepth(2).setVisible(false);
    this.name = mk(x + 12, y + 8, { fontFamily: 'Georgia', fontStyle: 'bold', fontSize: '13px', color: '#ffffff' });
    this.tier = mk(0, y + 9, { fontFamily: 'Trebuchet MS', fontStyle: 'bold', fontSize: '12px', color: '#ffffff' });
    this.faction = mk(x + w - 12, y + 10, { fontFamily: 'Trebuchet MS', fontSize: '10px', color: '#9a9a9a' }).setOrigin(1, 0);
    this.hp = mk(x + w - 12, y + 28, { fontFamily: 'Trebuchet MS', fontStyle: 'bold', fontSize: '11px', color: '#ffffff' }).setOrigin(1, 0);
    this.meta = mk(x + 12, y + 60, { fontFamily: 'Trebuchet MS', fontSize: '10px', color: '#b8b0a0' });
    this.attrs = mk(x + 12, y + 76, { fontFamily: 'monospace', fontSize: '10px', color: '#f3e7c9' });
    this.combat = mk(x + 12, y + 92, { fontFamily: 'monospace', fontSize: '10px', color: '#cfd4d8' });
    this.gear = mk(x + 12, y + 106, { fontFamily: 'monospace', fontSize: '10px', color: '#e8c25c', lineSpacing: 2 });
    this.bag = mk(x + 12, y + 134, { fontFamily: 'monospace', fontSize: '10px', color: '#9aa6b2' });
  }

  /** Render into the HUD's shared per-frame Graphics. Null view = plate hidden entirely. */
  draw(g: Phaser.GameObjects.Graphics, v: UnitPlateView | null): void {
    const texts = [this.name, this.tier, this.faction, this.hp, this.meta, this.attrs, this.combat, this.gear, this.bag];
    if (!v) {
      for (const t of texts) t.setVisible(false);
      return;
    }
    this.card(g);
    this.bar(g, this.x + 12, this.y + 30, this.w - 114, 12, v.hp, v.maxHp, 0xd4483b);
    if (v.stam !== null && v.maxStam !== null && v.maxStam > 0) {
      // ONE row, two layers, both from the LEFT: the GREY bar is VIGOR (today's ceiling — how far stamina can fill),
      // ending at a white divider; the BLUE stamina fills inside it; past the divider the dark track is what's spent
      // for the day. (Greying the LOST tail instead read as a second bar filling from the right.)
      const x = this.x + 12;
      const y = this.y + 48;
      const w = this.w - 114;
      const cap = v.stamCap ?? v.maxStam;
      const cw = (w * cap) / v.maxStam;
      g.fillStyle(0x000000, 0.55);
      g.fillRoundedRect(x - 2, y - 2, w + 4, 10, 4); // the full track
      g.fillStyle(0x8e8e9a, 0.75); // VIGOR — the usable bar, grey, from the left
      g.fillRect(x, y, cw, 6);
      g.fillStyle(0x5ea0d8, 1); // STAMINA inside it
      g.fillRect(x, y, w * clamp(v.stam / v.maxStam, 0, 1), 6);
      if (cap < v.maxStam) {
        g.fillStyle(0xffffff, 0.95); // the divider at the ceiling
        g.fillRect(x + cw - 1, y - 2, 2, 10);
      }
    }
    // WILL — the haki pool (violet, the coating's own color): only a body that HAS one shows the bar
    if (v.will !== null && v.maxWill !== null && v.maxWill > 0) this.bar(g, this.x + 12, this.y + 62, this.w - 114, 4, v.will, v.maxWill, 0x8a5ad8);
    // posture is an INVERSE bar: it FILLS amber toward the guard break (empty = composed) — combat/guard
    if (v.posture !== null && v.maxPosture !== null && v.maxPosture > 0) this.bar(g, this.x + 12, this.y + 57, this.w - 114, 3, v.posture, v.maxPosture, 0xe8a33d);
    // BREATH — a CONTEXTUAL bar (only present when underwater): a cyan air-gauge that empties as you hold your
    // breath (drowning at 0). Slots just under the posture line so it never displaces the permanent bars.
    if (v.breath !== null && v.maxBreath !== null && v.maxBreath > 0) this.bar(g, this.x + 12, this.y + 68, this.w - 114, 4, v.breath, v.maxBreath, 0x3fd4e8);

    this.name.setText(v.name);
    this.tier.setText(v.tier).setColor(v.tierColor).setPosition(this.name.x + this.name.width + 8, this.tier.y);
    this.faction.setText(v.factionName).setColor(css(v.factionColor));
    this.hp.setText(`${Math.max(0, Math.ceil(v.hp))}/${v.maxHp}`);
    this.meta.setText([v.squadName, v.aiState].filter(Boolean).join(' · '));
    const a = v.attributes;
    const r = Math.round;
    this.attrs.setText(`HP ${r(a.health)}  EN ${r(a.endurance)}  DF ${r(a.defense)}  WP ${r(a.willpower)}  LK ${r(a.luck)}  SP ${r(a.spiritual)}`);
    const vig = v.stamCap !== null && v.maxStam !== null && v.maxStam > 0 ? `  VIG ${Math.round((v.stamCap / v.maxStam) * 100)}%` : '';
    const pace = v.pace ? `  PACE ${v.pace}` : '';
    this.combat.setText(`ATK ${r(v.atk)}  DEF ${r(v.def)}  AS ${v.atkSpeed.toFixed(2)}  RCH ${r(v.reach)}${vig}${pace}`); // VIG = today's stamina ceiling; PACE = the held stance
    // gear: the worn slots (labels already read "Hat: X") on two lines so 4 slots fit the plate width;
    // bag: the owned-unequipped items
    this.gear.setText(`${v.equipped.slice(0, 2).join('   ')}\n${v.equipped.slice(2).join('   ')}`);
    this.bag.setText(`Bag ${v.inventory.length}/${v.bagSlots}: ${v.inventory.length ? v.inventory.join(', ') : '—'}`);
    for (const t of texts) t.setVisible(true);
  }

  /** Dark card with the gold trim — the shared plate frame (matches the start-screen theme). */
  private card(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(0x0b0a08, 0.72);
    g.fillRoundedRect(this.x, this.y, this.w, this.h, 8);
    g.lineStyle(1.5, 0xf0b429, 0.5);
    g.strokeRoundedRect(this.x, this.y, this.w, this.h, 8);
    g.lineStyle(1, 0x7a4f1f, 0.4);
    g.strokeRoundedRect(this.x + 3, this.y + 3, this.w - 6, this.h - 6, 6);
  }

  private bar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, val: number, max: number, color: number): void {
    g.fillStyle(0x000000, 0.55);
    g.fillRoundedRect(x - 2, y - 2, w + 4, h + 4, 4);
    g.fillStyle(color, 1);
    g.fillRect(x, y, w * clamp(val / max, 0, 1), h);
  }
}
