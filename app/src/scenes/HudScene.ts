import Phaser from 'phaser';
import { Abilities } from '../combat/Ability';
import { GAME_H, GAME_W, MAPH, MAPW, RegKey, WORLD_H, WORLD_W, type AbilityBarEntry, type MinimapDot } from '../config/constants';
import { events } from '../core/EventBus';
import { clamp } from '../core/math';
import type { DialogueView } from '../systems/DialogueSystem';
import { PLATE_CONTENT_H, UnitPlate } from '../ui/UnitPlate';
import type { UnitPlateView } from '../ui/plateView';

/** Canvas HUD overlay (parallel scene). Reads continuous state from the registry; one-offs via EventBus. */
export class HudScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private txt: Record<string, Phaser.GameObjects.Text> = {};
  private notifText!: Phaser.GameObjects.Text;
  private notifT = 0;
  private minimap?: Phaser.GameObjects.Image;
  private mm = { x: 0, y: 0, w: 150, h: 94 };
  private cardBg!: Phaser.GameObjects.Graphics;
  private cardTitle!: Phaser.GameObjects.Text;
  private cardMsg!: Phaser.GameObjects.Text;
  private abilSlots: { key: Phaser.GameObjects.Text; name: Phaser.GameObjects.Text }[] = [];
  private dlg!: { name: Phaser.GameObjects.Text; text: Phaser.GameObjects.Text; hint: Phaser.GameObjects.Text };
  private playerPlate!: UnitPlate;
  private inspectPlate!: UnitPlate;

  /** Bottom-left player card: THE shared unit readout (UnitPlate) + a player-only ability-bar row below
   *  the content block — extras go OUTSIDE the readout so every unit's plate stays identical. */
  private readonly panel = { x: 12, y: GAME_H - 168, w: 290, h: 156 };
  private readonly barX = 24; // panel.x + inner pad
  private barY = 0; // ability-row top (set in create)

  constructor() {
    super('Hud');
  }

  create(): void {
    this.g = this.add.graphics().setDepth(1);
    const mk = (x: number, y: number, style: Phaser.Types.GameObjects.Text.TextStyle) =>
      this.add.text(x, y, '', style).setDepth(2);
    const P = this.panel;

    // --- bottom-left player card: the SAME UnitPlate any unit gets; badges sit ABOVE the card ---
    this.playerPlate = new UnitPlate(this, P.x, P.y, P.w, P.h);
    this.txt.hudCombo = mk(P.x + P.w - 4, P.y - 20, { fontFamily: 'Trebuchet MS', fontStyle: 'bold', fontSize: '12px', color: '#ffcf5a' }).setOrigin(1, 0).setVisible(false);
    this.txt.autoaim = mk(P.x + 4, P.y - 20, { fontFamily: 'Trebuchet MS', fontStyle: 'bold', fontSize: '11px', color: '#7fd1ff' }).setVisible(false);

    // --- corners / center (world + objective info, not "the player") ---
    this.txt.gold = mk(GAME_W - 18, 16, { fontFamily: 'Trebuchet MS', fontStyle: 'bold', fontSize: '14px', color: '#f0b429' }).setOrigin(1, 0);
    this.txt.enemies = mk(GAME_W - 18, 50, { fontFamily: 'Trebuchet MS', fontSize: '12px', color: '#ffffff' }).setOrigin(1, 0);
    this.txt.objective = mk(GAME_W / 2, GAME_H - 24, { fontFamily: 'Georgia', fontStyle: 'italic', fontSize: '13px', color: '#ffffff' }).setOrigin(0.5, 0);
    this.txt.prompt = mk(GAME_W / 2, GAME_H - 50, { fontFamily: 'Trebuchet MS', fontStyle: 'bold', fontSize: '14px', color: '#f0b429' }).setOrigin(0.5, 0);
    this.txt.combo = mk(GAME_W / 2, 40, { fontFamily: 'Georgia', fontStyle: 'bold', fontSize: '20px', color: '#f0b429' }).setOrigin(0.5, 0);
    this.notifText = mk(GAME_W / 2, 74, { fontFamily: 'Georgia', fontStyle: 'bold', fontSize: '16px', color: '#f0b429' }).setOrigin(0.5, 0);

    this.mm.h = Math.round(this.mm.w * (MAPH / MAPW));
    this.mm.x = GAME_W - 18 - this.mm.w;
    this.mm.y = GAME_H - 18 - this.mm.h;
    this.add
      .rectangle(this.mm.x + this.mm.w / 2, this.mm.y + this.mm.h / 2, this.mm.w + 8, this.mm.h + 8, 0x08121c, 0.75)
      .setStrokeStyle(1.5, 0xf0b429, 0.4)
      .setDepth(0);

    // inspected unit (V+click): the IDENTICAL readout, docked above the minimap
    this.inspectPlate = new UnitPlate(this, GAME_W - 18 - P.w, this.mm.y - PLATE_CONTENT_H - 10, P.w);

    this.cardBg = this.add.graphics().setDepth(5).setVisible(false);
    this.cardTitle = this.add.text(GAME_W / 2, GAME_H / 2 - 10, '', { fontFamily: 'Georgia', fontStyle: 'bold', fontSize: '42px', color: '#ffffff' }).setOrigin(0.5).setDepth(6).setVisible(false);
    this.cardMsg = this.add.text(GAME_W / 2, GAME_H / 2 + 28, '', { fontFamily: 'Trebuchet MS', fontSize: '16px', color: '#f3e7c9' }).setOrigin(0.5).setDepth(6).setVisible(false);

    // dialogue box texts (the box graphics are drawn on `g` each frame in drawDialogue)
    this.dlg = {
      name: this.add.text(0, 0, '', { fontFamily: 'Georgia', fontStyle: 'bold', fontSize: '15px', color: '#f0b429' }).setDepth(4).setVisible(false),
      text: this.add.text(0, 0, '', { fontFamily: 'Trebuchet MS', fontSize: '14px', color: '#f3e7c9', wordWrap: { width: 486 } }).setDepth(4).setVisible(false),
      hint: this.add.text(0, 0, '', { fontFamily: 'Trebuchet MS', fontStyle: 'bold', fontSize: '12px', color: '#f0b429' }).setOrigin(1, 1).setDepth(4).setVisible(false),
    };

    // ability bar (player-only row, below the shared readout block): one box per equipped/granted ability
    this.barY = P.y + PLATE_CONTENT_H + 4;
    for (let i = 0; i < 5; i++) {
      const bx = this.barX + i * 53 + 24;
      const key = this.add.text(bx, this.barY + 4, '', { fontFamily: 'Trebuchet MS', fontStyle: 'bold', fontSize: '10px', color: '#f0b429' }).setOrigin(0.5, 0).setDepth(2).setVisible(false);
      const name = this.add.text(bx, this.barY + 20, '', { fontFamily: 'Trebuchet MS', fontSize: '9px', color: '#f3e7c9' }).setOrigin(0.5, 0).setDepth(2).setVisible(false);
      this.abilSlots.push({ key, name });
    }

    events.on('notify', ({ msg }) => {
      this.notifText.setText(msg);
      this.notifT = 3.2;
    });
    events.on('autoAimChanged', ({ on }) => {
      this.txt.autoaim.setText('◎ AUTO-AIM').setVisible(on);
    });
  }

  private drawAbilityBar(g: Phaser.GameObjects.Graphics, bar: AbilityBarEntry[] | undefined): void {
    for (let i = 0; i < this.abilSlots.length; i++) {
      const slot = this.abilSlots[i];
      const entry = bar?.[i];
      if (!entry) {
        slot.key.setVisible(false);
        slot.name.setVisible(false);
        continue;
      }
      const bx = this.barX + i * 53;
      const w = 48;
      const h = 36;
      const def = Abilities.has(entry.id) ? Abilities.get(entry.id) : undefined;
      g.fillStyle(0x140c06, 0.82);
      g.fillRoundedRect(bx, this.barY, w, h, 5);
      g.lineStyle(1.5, 0xf0b429, 0.5);
      g.strokeRoundedRect(bx, this.barY, w, h, 5);
      if (entry.cd > 0 && def) {
        const frac = Math.min(1, entry.cd / def.cooldown);
        g.fillStyle(0x000000, 0.6);
        g.fillRect(bx, this.barY, w, h * frac);
      }
      slot.key.setText(entry.key).setPosition(bx + w / 2, this.barY + 3).setVisible(true);
      slot.name.setText(def ? def.name : entry.id).setPosition(bx + w / 2, this.barY + 19).setVisible(true);
    }
  }

  /** Bottom-center dialogue box: speaker avatar + name + typewriter line + an [E] advance hint. */
  private drawDialogue(g: Phaser.GameObjects.Graphics): void {
    const v = this.registry.get(RegKey.Dialogue) as DialogueView | null | undefined;
    if (!v) {
      this.dlg.name.setVisible(false);
      this.dlg.text.setVisible(false);
      this.dlg.hint.setVisible(false);
      return;
    }
    const BW = 600;
    const BH = 112;
    const BX = (GAME_W - BW) / 2;
    const BY = GAME_H - 168;
    g.fillStyle(0x000000, 0.35); // drop shadow
    g.fillRoundedRect(BX + 4, BY + 5, BW, BH, 10);
    g.fillStyle(0x140c06, 0.95); // panel
    g.fillRoundedRect(BX, BY, BW, BH, 10);
    g.lineStyle(2, 0xf0b429, 0.85);
    g.strokeRoundedRect(BX, BY, BW, BH, 10);
    g.lineStyle(1, 0xf0b429, 0.28);
    g.strokeRoundedRect(BX + 3, BY + 3, BW - 6, BH - 6, 8);
    // speaker avatar — skin circle + faction ring + outline (matches the actor art)
    const cx = BX + 48;
    const cy = BY + BH / 2;
    const ar = 30;
    g.fillStyle(v.skin, 1);
    g.fillCircle(cx, cy, ar);
    g.lineStyle(4, v.ring, 1);
    g.strokeCircle(cx, cy, ar - 2);
    g.lineStyle(2, 0x4d4a45, 1);
    g.strokeCircle(cx, cy, ar);
    this.dlg.name.setText(v.name).setPosition(BX + 92, BY + 16).setVisible(true);
    this.dlg.text.setText(v.text).setPosition(BX + 92, BY + 42).setVisible(true);
    const hint = v.done ? (v.last ? '[E] ✕  close' : '[E] ▼  more') : '[E] ▶▶  skip';
    this.dlg.hint.setText(hint).setPosition(BX + BW - 16, BY + BH - 12).setVisible(true);
  }

  override update(_t: number, delta: number): void {
    const dt = delta / 1000;
    const r = this.registry;
    const g = this.g;
    g.clear();

    // both plates render the SAME view-model shape — player bottom-left, inspected unit by the minimap
    this.playerPlate.draw(g, (r.get(RegKey.Player) as UnitPlateView | null) ?? null);
    this.inspectPlate.draw(g, (r.get(RegKey.Inspect) as UnitPlateView | null) ?? null);

    this.txt.gold.setText('● ' + ((r.get(RegKey.Gold) as number) ?? 0) + ' gold');
    this.txt.enemies.setText('Enemies left: ' + ((r.get(RegKey.EnemiesLeft) as number) ?? 0));
    this.txt.objective.setText('◆ ' + ((r.get(RegKey.Objective) as string) ?? ''));
    this.txt.prompt.setText((r.get(RegKey.Prompt) as string) ?? '');
    this.drawDialogue(g);
    const combo = (r.get(RegKey.Combo) as number) ?? 0;
    this.txt.combo.setText(combo > 1 ? combo + 'x combo' : '').setVisible(combo > 1);
    this.txt.hudCombo.setText('⚔ ' + combo + 'x').setVisible(combo > 1);

    // minimap (texture is baked by WorldScene; create the image lazily once it exists)
    if (!this.minimap && this.textures.exists('minimap')) {
      this.minimap = this.add.image(this.mm.x, this.mm.y, 'minimap').setOrigin(0, 0).setDepth(0);
      this.minimap.setDisplaySize(this.mm.w, this.mm.h);
    }
    const dots = r.get(RegKey.Minimap) as MinimapDot[] | undefined;
    if (dots) {
      const sx = this.mm.w / WORLD_W;
      const sy = this.mm.h / WORLD_H;
      for (const d of dots) {
        g.fillStyle(d.c, 1);
        g.fillCircle(this.mm.x + d.x * sx, this.mm.y + d.y * sy, d.r);
      }
    }

    this.drawAbilityBar(g, r.get(RegKey.AbilityBar) as AbilityBarEntry[] | undefined);

    if (this.notifT > 0) {
      this.notifT -= dt;
      this.notifText.setAlpha(clamp(this.notifT, 0, 1));
    } else if (this.notifText.text) {
      this.notifText.setText('');
    }

    const state = r.get(RegKey.State) as string;
    if (state === 'dead') this.showCard('Washed Ashore', 'You were defeated. Press [E] to recover at home.', '#d4483b');
    else if (state === 'win') this.showCard('Victory!', 'The enemy isle is yours, Captain. Press [E] to keep sailing.', '#f0b429');
    else this.hideCard();
  }

  private showCard(title: string, msg: string, color: string): void {
    this.cardBg.setVisible(true).clear();
    this.cardBg.fillStyle(0x06121f, 0.7);
    this.cardBg.fillRect(0, 0, GAME_W, GAME_H);
    this.cardTitle.setText(title).setColor(color).setVisible(true);
    this.cardMsg.setText(msg).setVisible(true);
  }

  private hideCard(): void {
    if (!this.cardBg.visible) return;
    this.cardBg.setVisible(false);
    this.cardTitle.setVisible(false);
    this.cardMsg.setVisible(false);
  }
}
