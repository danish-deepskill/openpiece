import type { ItemRef } from '../defs/items';
import type { ItemIntent } from '../systems/Items';
import type { HoldView, IconView, InventoryView, StackView } from './inventoryView';

/**
 * The INVENTORY PANEL — a DOM layer (like the start overlay + debug panel), not Phaser Graphics: crisp text at
 * any DPI for free, native hover/drag/tooltips/scroll, CSS transitions. It renders the VIEW-MODEL WorldScene
 * publishes on change (ui/inventoryView) and sends INTENTS through the one callback (→ InputSystem's queue →
 * the Items service inside the sim tick). It never touches an entity or a component — the same panel would
 * work over a wire. The world does NOT pause while it's open (the world doesn't wait; multiplayer forbids it),
 * so the fast paths matter: shift-click sends a stack across, double-click equips, drag is the fallback.
 *
 * Interactions: Tab toggles · Esc closes · click selects · shift-click moves the stack to the other hold ·
 * double-click equips (or unequips from the paper-doll) · drag a stack onto the other hold / a doll slot ·
 * right-click opens a context menu (Equip / Move / Split half / Drop) · drop is hidden aboard.
 */
export class InventoryPanel {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly menu: HTMLElement;
  private view: InventoryView | null = null;
  private open = false;
  private selected?: { hold: number; index: number };
  private drag?: { hold: number; index: number; ghost: HTMLElement; src: HTMLElement };

  constructor(private readonly onIntent: (i: ItemIntent) => void) {
    injectStyles();
    this.root = el('div', 'inv-root');
    this.root.hidden = true;
    this.body = el('div', 'inv-body');
    this.tip = el('div', 'inv-tip');
    this.tip.hidden = true;
    this.menu = el('div', 'inv-menu');
    this.menu.hidden = true;
    this.root.append(this.body, this.tip, this.menu);
    document.body.appendChild(this.root);

    window.addEventListener('keydown', this.onKey);
    window.addEventListener('pointerdown', this.onWindowDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    this.root.addEventListener('contextmenu', (ev) => ev.preventDefault()); // dies with the root
  }

  /** Tab toggles (preventDefault: the browser's focus-walk would steal it; `repeat` ignored so a HELD Tab doesn't
   *  flicker), Esc closes. Fields, not inline closures, so destroy() can remove exactly these. */
  private readonly onKey = (ev: KeyboardEvent): void => {
    if (ev.key === 'Tab') {
      ev.preventDefault();
      if (!ev.repeat) this.toggle();
    } else if (ev.key === 'Escape' && this.open) {
      if (!this.menu.hidden) this.menu.hidden = true; // first Esc: the menu; second: the panel
      else this.hide();
    }
  };
  /** The context menu closes on any pointer-down outside it. */
  private readonly onWindowDown = (ev: PointerEvent): void => {
    if (!this.menu.hidden && !this.menu.contains(ev.target as Node)) this.menu.hidden = true;
  };
  private readonly onMove = (ev: PointerEvent): void => this.onDragMove(ev);
  private readonly onUp = (ev: PointerEvent): void => this.onDragEnd(ev);

  /** Unbind the window listeners and remove the DOM root — WorldScene calls this on scene shutdown, so a scene
   *  restart constructs a fresh panel instead of stacking a second set of handlers on the first. */
  destroy(): void {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('pointerdown', this.onWindowDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    this.drag?.ghost.remove();
    this.root.remove();
  }

  /** Called by WorldScene ONLY when the view changed (null = nobody controlled: hide). */
  render(view: InventoryView | null): void {
    this.view = view;
    if (!view) {
      this.hide();
      return;
    }
    if (this.open) this.paint();
  }

  toggle(): void {
    if (this.open) this.hide();
    else this.show();
  }

  private show(): void {
    if (!this.view) return;
    this.open = true;
    this.root.hidden = false;
    this.paint();
    requestAnimationFrame(() => this.root.classList.add('inv-open')); // next frame, so the transition runs
  }

  private hide(): void {
    this.open = false;
    this.root.classList.remove('inv-open');
    this.root.hidden = true;
    this.menu.hidden = true;
    this.tip.hidden = true;
    this.selected = undefined;
  }

  // ---- painting ----------------------------------------------------------------------------------------

  private paint(): void {
    const v = this.view;
    if (!v) return;
    this.tip.hidden = true; // the slot under the pointer may have changed — never leave a stale tip
    this.menu.hidden = true; // its actions captured the stack as it WAS — a changed view invalidates them
    this.body.replaceChildren();
    const left = el('div', 'inv-col');
    left.append(this.paintDoll(v), this.paintHold(v.bag, v));
    this.body.append(left);
    if (v.other) {
      const right = el('div', 'inv-col');
      right.append(this.paintHold(v.other, v));
      this.body.append(right);
    }
    const hint = el('div', 'inv-hint');
    hint.textContent = v.other ? 'Shift-click or drag to move · double-click to equip · right-click for more · Tab closes' : 'Double-click to equip · drag onto the doll · right-click for more · Tab closes';
    this.body.append(hint);
  }

  private paintDoll(v: InventoryView): HTMLElement {
    const doll = el('div', 'inv-doll');
    for (const eq of v.equipment) {
      const slot = el('div', 'inv-slot inv-doll-slot');
      slot.dataset.slot = eq.slot;
      if (eq.ref && eq.icon) {
        slot.append(iconEl(eq.icon));
        slot.classList.add('inv-filled');
        const ref = eq.ref;
        slot.addEventListener('dblclick', () => this.onIntent({ kind: 'unequip', ref }));
        slot.addEventListener('pointerenter', (ev) => this.showTip(ev, `${eq.name}`, `worn · ${eq.label}`));
        slot.addEventListener('pointerleave', () => (this.tip.hidden = true));
        slot.addEventListener('contextmenu', (ev) => this.openMenu(ev, [{ label: 'Take off', run: () => this.onIntent({ kind: 'unequip', ref }) }]));
      }
      const label = el('span', 'inv-slot-label');
      label.textContent = eq.label;
      slot.append(label);
      doll.append(slot);
    }
    return doll;
  }

  private paintHold(h: HoldView, v: InventoryView): HTMLElement {
    const box = el('section', 'inv-hold');
    box.dataset.hold = String(h.id);
    const head = el('header', 'inv-hold-head');
    const title = el('span', 'inv-hold-title');
    title.textContent = h.title;
    const cap = el('span', 'inv-hold-cap');
    cap.textContent = `${h.stacks.length} / ${h.slots}`;
    head.append(title, cap);
    const grid = el('div', 'inv-grid');
    for (let i = 0; i < h.slots; i++) {
      const s = h.stacks[i];
      grid.append(s ? this.paintStack(h, i, s, v) : this.paintEmpty(h, i));
    }
    box.append(head, grid);
    return box;
  }

  private paintEmpty(h: HoldView, i: number): HTMLElement {
    const slot = el('div', 'inv-slot inv-empty');
    slot.dataset.hold = String(h.id);
    slot.dataset.index = String(i);
    return slot;
  }

  private paintStack(h: HoldView, i: number, s: StackView, v: InventoryView): HTMLElement {
    const slot = el('div', 'inv-slot inv-filled');
    slot.dataset.hold = String(h.id);
    slot.dataset.index = String(i);
    if (this.selected?.hold === h.id && this.selected.index === i) slot.classList.add('inv-selected');
    slot.append(iconEl(s.icon));
    if (s.n > 1) {
      const badge = el('span', 'inv-badge');
      badge.textContent = String(s.n);
      slot.append(badge);
    }
    const other = h.id === v.bag.id ? v.other : v.bag;
    const isBag = h.id === v.bag.id;
    slot.addEventListener('pointerenter', (ev) => this.showTip(ev, s.name, `${s.n} / ${s.limit} per stack · ${s.ref.cat}`));
    slot.addEventListener('pointerleave', () => (this.tip.hidden = true));
    slot.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      if (ev.shiftKey) {
        if (other) this.onIntent({ kind: 'move', from: h.id, to: other.id, ref: s.ref, n: s.n });
        return;
      }
      this.selected = { hold: h.id, index: i };
      this.beginDrag(ev, h.id, i, s, slot);
    });
    slot.addEventListener('dblclick', () => {
      if (s.equippable && isBag) this.onIntent({ kind: 'equip', ref: s.ref });
      else if (other) this.onIntent({ kind: 'move', from: h.id, to: other.id, ref: s.ref, n: s.n });
    });
    slot.addEventListener('contextmenu', (ev) => {
      const acts: MenuAction[] = [];
      if (s.equippable && isBag) acts.push({ label: 'Equip', run: () => this.onIntent({ kind: 'equip', ref: s.ref }) });
      if (other) acts.push({ label: `Move to ${other.title}`, run: () => this.onIntent({ kind: 'move', from: h.id, to: other.id, ref: s.ref, n: s.n }) });
      if (other && s.n > 1) acts.push({ label: 'Move one', run: () => this.onIntent({ kind: 'move', from: h.id, to: other.id, ref: s.ref, n: 1 }) });
      if (s.n > 1) acts.push({ label: 'Split half', run: () => this.onIntent({ kind: 'split', hold: h.id, index: i, n: Math.floor(s.n / 2) }) });
      if (isBag && !v.aboard) {
        acts.push({ label: 'Drop one', run: () => this.onIntent({ kind: 'drop', ref: s.ref, n: 1 }) });
        if (s.n > 1) acts.push({ label: `Drop all (${s.n})`, run: () => this.onIntent({ kind: 'drop', ref: s.ref, n: s.n }) });
      }
      this.openMenu(ev, acts);
    });
    return slot;
  }

  // ---- drag & drop ---------------------------------------------------------------------------------------

  private beginDrag(ev: PointerEvent, hold: number, index: number, s: StackView, src: HTMLElement): void {
    const ghost = iconEl(s.icon);
    ghost.classList.add('inv-ghost');
    ghost.style.left = `${ev.clientX}px`;
    ghost.style.top = `${ev.clientY}px`;
    this.root.append(ghost);
    this.drag = { hold, index, ghost, src };
  }

  /** The drag goes LIVE on the first move (not on the press, so a plain click never flickers): the ghost shows
   *  under the pointer and the ORIGIN slot fades — the item is "in your hand", not still in the slot. */
  private onDragMove(ev: PointerEvent): void {
    if (!this.drag) return;
    this.drag.ghost.style.left = `${ev.clientX}px`;
    this.drag.ghost.style.top = `${ev.clientY}px`;
    this.drag.ghost.classList.add('inv-ghost-live');
    this.drag.src.classList.add('inv-drag-src');
  }

  private onDragEnd(ev: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    this.drag = undefined;
    const moved = d.ghost.classList.contains('inv-ghost-live');
    d.ghost.remove();
    d.src.classList.remove('inv-drag-src'); // the slot comes back whether the drop landed or not (a landed move repaints anyway)
    if (!moved || !this.view) return;
    const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('.inv-slot, .inv-hold');
    if (!target) return;
    const src = this.stackAt(d.hold, d.index);
    if (!src) return;
    if (target.classList.contains('inv-doll-slot')) {
      if (src.equippable && d.hold === this.view.bag.id && target.dataset.slot === src.slot) this.onIntent({ kind: 'equip', ref: src.ref });
      return;
    }
    const toHold = Number(target.dataset.hold);
    if (Number.isFinite(toHold) && toHold !== d.hold) this.onIntent({ kind: 'move', from: d.hold, to: toHold, ref: src.ref, n: src.n });
  }

  private stackAt(hold: number, index: number): StackView | undefined {
    const v = this.view;
    if (!v) return undefined;
    const h = hold === v.bag.id ? v.bag : v.other?.id === hold ? v.other : undefined;
    return h?.stacks[index];
  }

  // ---- tooltip + context menu ------------------------------------------------------------------------------

  private showTip(ev: PointerEvent, name: string, sub: string): void {
    this.tip.replaceChildren();
    const n = el('div', 'inv-tip-name');
    n.textContent = name;
    const s = el('div', 'inv-tip-sub');
    s.textContent = sub;
    this.tip.append(n, s);
    this.tip.style.left = `${ev.clientX + 14}px`;
    this.tip.style.top = `${ev.clientY + 14}px`;
    this.tip.hidden = false;
  }

  private openMenu(ev: MouseEvent, acts: MenuAction[]): void {
    ev.preventDefault();
    if (acts.length === 0) return;
    this.menu.replaceChildren();
    for (const a of acts) {
      const b = document.createElement('button'); // typed as a button (el() returns a bare HTMLElement)
      b.className = 'inv-menu-item';
      b.type = 'button';
      b.textContent = a.label;
      b.addEventListener('click', () => {
        this.menu.hidden = true;
        a.run();
      });
      this.menu.append(b);
    }
    this.menu.style.left = `${ev.clientX}px`;
    this.menu.style.top = `${ev.clientY}px`;
    this.menu.hidden = false;
  }
}

interface MenuAction {
  label: string;
  run: () => void;
}

/** Bundled art URLs by src/art-relative path (the same manifest BootScene loads textures from). */
const ART_URLS = import.meta.glob('../art/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

function iconEl(icon: IconView): HTMLElement {
  const url = icon.art ? ART_URLS[`../art/${icon.art}`] : undefined;
  if (url) {
    const img = document.createElement('img');
    img.className = 'inv-icon inv-icon-art';
    img.src = url;
    img.draggable = false;
    img.alt = '';
    return img;
  }
  const ph = el('div', `inv-icon inv-icon-${icon.shape}`);
  ph.style.setProperty('--c', `#${icon.color.toString(16).padStart(6, '0')}`);
  ph.textContent = icon.glyph;
  return ph;
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

let styled = false;
function injectStyles(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = `
.inv-root{position:fixed;inset:0;z-index:20;pointer-events:none;font-family:"Trebuchet MS",system-ui,sans-serif;color:#f3e7c9;user-select:none}
.inv-root [hidden]{display:none!important}
.inv-body{position:absolute;left:50%;top:50%;transform:translate(-50%,-46%);display:flex;gap:18px;align-items:flex-start;padding:16px 18px 12px;
  background:rgba(8,18,28,.92);border:1px solid rgba(240,180,41,.45);border-radius:10px;box-shadow:0 24px 60px rgba(0,0,0,.6);
  pointer-events:auto;opacity:0;transition:opacity .15s ease,transform .15s ease;flex-wrap:wrap;max-width:min(92vw,980px)}
.inv-open .inv-body{opacity:1;transform:translate(-50%,-50%)}
.inv-col{display:flex;flex-direction:column;gap:12px}
.inv-hold{display:flex;flex-direction:column;gap:8px}
.inv-hold-head{display:flex;justify-content:space-between;align-items:baseline;gap:16px;border-bottom:1px solid rgba(240,180,41,.3);padding-bottom:4px}
.inv-hold-title{font-family:Georgia,serif;font-weight:bold;letter-spacing:1px;color:#f0b429;font-size:14px}
.inv-hold-cap{font-family:monospace;font-size:12px;color:#9aa6b2}
.inv-grid{display:grid;grid-template-columns:repeat(6,52px);gap:6px;max-height:340px;overflow-y:auto;padding:2px}
.inv-slot{position:relative;width:52px;height:52px;border-radius:7px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);
  display:flex;align-items:center;justify-content:center;transition:transform .08s ease,border-color .08s ease,background .08s ease}
.inv-empty{background:repeating-linear-gradient(45deg,rgba(255,255,255,.025) 0 6px,transparent 6px 12px)}
.inv-filled{cursor:grab;border-color:rgba(240,180,41,.35)}
.inv-filled:hover{transform:translateY(-2px);border-color:#f0b429;background:rgba(240,180,41,.08)}
.inv-selected{box-shadow:0 0 0 2px #f0b429 inset}
.inv-drag-src{opacity:.35;transform:none!important;border-style:dashed}
.inv-badge{position:absolute;right:4px;bottom:3px;font-family:monospace;font-size:11px;font-weight:bold;color:#fff;
  background:rgba(0,0,0,.65);padding:0 4px;border-radius:4px;line-height:15px}
.inv-icon{width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-family:Georgia,serif;font-weight:bold;font-size:16px;color:#fff;text-shadow:0 1px 2px #000;pointer-events:none}
.inv-icon-art{object-fit:contain;image-rendering:auto}
.inv-icon-round{background:var(--c);border-radius:50%;box-shadow:inset 0 -4px 0 rgba(0,0,0,.25),0 0 0 2px #20242a}
.inv-icon-square{background:var(--c);border-radius:6px;box-shadow:inset 0 -4px 0 rgba(0,0,0,.25),0 0 0 2px #20242a}
.inv-icon-book{background:var(--c);border-radius:3px 7px 7px 3px;box-shadow:inset -8px 0 0 #e8dcc0,0 0 0 2px #20242a}
.inv-icon-sack{background:var(--c);border-radius:40% 40% 50% 50%/30% 30% 60% 60%;box-shadow:0 0 0 2px #20242a}
.inv-icon-bundle{background:repeating-linear-gradient(0deg,var(--c) 0 9px,rgba(0,0,0,.35) 9px 11px);border-radius:4px;box-shadow:0 0 0 2px #20242a}
.inv-doll{display:flex;gap:8px}
.inv-doll-slot{flex-direction:column;gap:2px;height:66px;width:60px}
.inv-slot-label{font-size:10px;color:#9aa6b2;letter-spacing:.5px;position:absolute;bottom:3px}
.inv-doll-slot .inv-icon{width:34px;height:34px}
.inv-hint{flex-basis:100%;font-size:11px;color:#8a96a2;text-align:center;padding-top:4px}
.inv-ghost{position:absolute;pointer-events:none;transform:translate(-50%,-50%) scale(1.1);opacity:.9;z-index:2;display:none}
.inv-ghost-live{display:flex}
.inv-tip{position:absolute;z-index:3;pointer-events:none;background:rgba(8,18,28,.96);border:1px solid rgba(240,180,41,.5);border-radius:6px;padding:6px 9px;max-width:240px}
.inv-tip-name{font-family:Georgia,serif;font-weight:bold;color:#f0b429;font-size:13px}
.inv-tip-sub{font-size:11px;color:#b8b0a0;margin-top:2px}
.inv-menu{position:absolute;z-index:4;pointer-events:auto;display:flex;flex-direction:column;background:rgba(8,18,28,.98);border:1px solid rgba(240,180,41,.5);border-radius:6px;padding:4px;min-width:150px;box-shadow:0 12px 30px rgba(0,0,0,.6)}
.inv-menu-item{background:none;border:none;color:#f3e7c9;text-align:left;padding:6px 10px;font:13px "Trebuchet MS",system-ui,sans-serif;cursor:pointer;border-radius:4px}
.inv-menu-item:hover{background:rgba(240,180,41,.15);color:#fff}
`;
  document.head.appendChild(style);
}
