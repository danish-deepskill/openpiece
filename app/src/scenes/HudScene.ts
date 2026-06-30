import Phaser from 'phaser';
import { Abilities } from '../combat/Ability';
import { GAME_H, GAME_W, MAPH, MAPW, RegKey, WORLD_H, WORLD_W } from '../config/constants';
import { events } from '../core/EventBus';
import { clamp } from '../core/math';

interface AbilityBarEntry { key: string; id: string; cd: number }

interface Dot { x: number; y: number; c: number; r: number }

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
  private barY = 0;

  constructor() {
    super('Hud');
  }

  create(): void {
    this.g = this.add.graphics().setDepth(1);
    const mk = (x: number, y: number, style: Phaser.Types.GameObjects.Text.TextStyle) =>
      this.add.text(x, y, '', style).setDepth(2);

    this.txt.hp = mk(24, 21, { fontFamily: 'Trebuchet MS', fontStyle: 'bold', fontSize: '11px', color: '#ffffff' });
    this.txt.gold = mk(GAME_W - 18, 16, { fontFamily: 'Trebuchet MS', fontStyle: 'bold', fontSize: '14px', color: '#f0b429' }).setOrigin(1, 0);
    this.txt.enemies = mk(GAME_W - 18, 50, { fontFamily: 'Trebuchet MS', fontSize: '12px', color: '#ffffff' }).setOrigin(1, 0);
    this.txt.objective = mk(GAME_W / 2, GAME_H - 24, { fontFamily: 'Georgia', fontStyle: 'italic', fontSize: '13px', color: '#ffffff' }).setOrigin(0.5, 0);
    this.txt.prompt = mk(GAME_W / 2, GAME_H - 50, { fontFamily: 'Trebuchet MS', fontStyle: 'bold', fontSize: '14px', color: '#f0b429' }).setOrigin(0.5, 0);
    this.txt.autoaim = mk(20, GAME_H - 112, { fontFamily: 'Trebuchet MS', fontStyle: 'bold', fontSize: '11px', color: '#7fd1ff' }).setOrigin(0, 0).setVisible(false);
    this.txt.combo = mk(GAME_W / 2, 40, { fontFamily: 'Georgia', fontStyle: 'bold', fontSize: '20px', color: '#f0b429' }).setOrigin(0.5, 0);
    this.notifText = mk(GAME_W / 2, 74, { fontFamily: 'Georgia', fontStyle: 'bold', fontSize: '16px', color: '#f0b429' }).setOrigin(0.5, 0);

    this.mm.h = Math.round(this.mm.w * (MAPH / MAPW));
    this.mm.x = GAME_W - 18 - this.mm.w;
    this.mm.y = GAME_H - 18 - this.mm.h;
    this.add
      .rectangle(this.mm.x + this.mm.w / 2, this.mm.y + this.mm.h / 2, this.mm.w + 8, this.mm.h + 8, 0x08121c, 0.75)
      .setStrokeStyle(1.5, 0xf0b429, 0.4)
      .setDepth(0);

    this.cardBg = this.add.graphics().setDepth(5).setVisible(false);
    this.cardTitle = this.add.text(GAME_W / 2, GAME_H / 2 - 10, '', { fontFamily: 'Georgia', fontStyle: 'bold', fontSize: '42px', color: '#ffffff' }).setOrigin(0.5).setDepth(6).setVisible(false);
    this.cardMsg = this.add.text(GAME_W / 2, GAME_H / 2 + 28, '', { fontFamily: 'Trebuchet MS', fontSize: '16px', color: '#f3e7c9' }).setOrigin(0.5).setDepth(6).setVisible(false);

    // ability bar (bottom-left): one box per equipped/granted ability
    this.barY = GAME_H - 92;
    for (let i = 0; i < 5; i++) {
      const bx = 18 + i * 64 + 30;
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
      const bx = 18 + i * 64;
      const w = 60;
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

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    const r = this.registry;
    const g = this.g;
    g.clear();

    const hp = (r.get(RegKey.Hp) as number) ?? 0;
    const maxhp = (r.get(RegKey.MaxHp) as number) ?? 1;
    const stam = (r.get(RegKey.Stam) as number) ?? 0;
    const maxstam = (r.get(RegKey.MaxStam) as number) ?? 1;
    this.bar(g, 18, 18, 210, 16, hp, maxhp, 0xd4483b);
    this.bar(g, 18, 40, 160, 9, stam, maxstam, 0x5ea0d8);
    this.txt.hp.setText('HP ' + Math.max(0, Math.ceil(hp)));
    this.txt.gold.setText('● ' + ((r.get(RegKey.Gold) as number) ?? 0) + ' gold');
    this.txt.enemies.setText('Enemies left: ' + ((r.get(RegKey.EnemiesLeft) as number) ?? 0));
    this.txt.objective.setText('◆ ' + ((r.get(RegKey.Objective) as string) ?? ''));
    this.txt.prompt.setText((r.get(RegKey.Prompt) as string) ?? '');
    const combo = (r.get(RegKey.Combo) as number) ?? 0;
    this.txt.combo.setText(combo > 1 ? combo + 'x combo' : '').setVisible(combo > 1);

    // minimap (texture is baked by WorldScene; create the image lazily once it exists)
    if (!this.minimap && this.textures.exists('minimap')) {
      this.minimap = this.add.image(this.mm.x, this.mm.y, 'minimap').setOrigin(0, 0).setDepth(0);
      this.minimap.setDisplaySize(this.mm.w, this.mm.h);
    }
    const dots = r.get(RegKey.Minimap) as Dot[] | undefined;
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

  private bar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, val: number, max: number, color: number): void {
    g.fillStyle(0x000000, 0.55);
    g.fillRoundedRect(x - 2, y - 2, w + 4, h + 4, 4);
    g.fillStyle(color, 1);
    g.fillRect(x, y, w * clamp(val / max, 0, 1), h);
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
