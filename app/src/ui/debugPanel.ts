import { Debug } from '../core/Debug';

/** The manual-wind sub-panel (indented under the world.wind flag): take-the-wind checkbox + two live
 *  sliders. Values persist like flags; the sim only sees them via DebugOverlay's per-frame sync. */
function buildWindControls(): HTMLElement {
  const box = document.createElement('div');
  box.style.cssText = 'margin:2px 0 4px 22px;padding:4px 6px;border-left:2px solid #2a6;';

  const overrideRow = document.createElement('label');
  overrideRow.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;';
  const overrideBox = document.createElement('input');
  overrideBox.type = 'checkbox';
  overrideBox.checked = Debug.on('wind.override');
  overrideBox.addEventListener('change', () => Debug.set('wind.override', overrideBox.checked));
  const overrideLabel = document.createElement('span');
  overrideLabel.textContent = 'manual wind (override the field)';
  overrideRow.appendChild(overrideBox);
  overrideRow.appendChild(overrideLabel);
  box.appendChild(overrideRow);

  const mkSlider = (key: string, label: string, min: number, max: number, step: number, dflt: number, unit: string) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:2px 0;';
    const name = document.createElement('span');
    name.style.cssText = 'width:52px;color:#9cf;';
    name.textContent = label;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(Debug.value(key) ?? dflt);
    slider.style.cssText = 'flex:1;';
    const val = document.createElement('span');
    val.style.cssText = 'width:44px;text-align:right;';
    const show = () => (val.textContent = `${slider.value}${unit}`);
    show();
    slider.addEventListener('input', () => {
      Debug.setValue(key, Number(slider.value));
      show();
    });
    row.appendChild(name);
    row.appendChild(slider);
    row.appendChild(val);
    return row;
  };
  box.appendChild(mkSlider('wind.dir', 'dir', 0, 355, 5, 0, '°'));
  // the FULL envelope on purpose: 0% = a Calm Belt (sail rigs stranded, oars country), ~60–100% = everyday
  // weather (the natural field's band), >100% = storm territory (the event director's spikes, someday)
  box.appendChild(mkSlider('wind.strength', 'strength', 0, 200, 5, 85, '%'));
  return box;
}

/**
 * Builds a hidden DOM panel of grouped checkboxes for the debug flags. Backtick (`) toggles it. Each
 * checkbox flips a Debug flag (persisted); the canvas DebugOverlay reads those flags. Adding a debug view
 * = adding a flag def in core/Debug — it shows up here automatically.
 */
export function bindDebugPanel(): void {
  const panel = document.createElement('div');
  panel.id = 'debugPanel';
  panel.style.cssText =
    'position:fixed;top:8px;right:8px;z-index:50;display:none;min-width:190px;' +
    'background:rgba(10,16,22,0.92);color:#cfe;font:12px monospace;padding:8px 10px;' +
    'border:1px solid #2a6;border-radius:6px;user-select:none;';

  const header = document.createElement('div');
  header.textContent = 'DEBUG  ( ` to close )';
  header.style.cssText = 'font-weight:bold;color:#00e0ff;margin-bottom:6px;';
  panel.appendChild(header);

  const inputs: HTMLInputElement[] = [];

  // all / none
  const tools = document.createElement('div');
  tools.style.cssText = 'margin-bottom:6px;';
  const mkBtn = (text: string, val: boolean) => {
    const b = document.createElement('a');
    b.textContent = text;
    b.style.cssText = 'color:#9cf;cursor:pointer;margin-right:10px;text-decoration:underline;';
    b.addEventListener('click', () => {
      Debug.setAll(val);
      for (const i of inputs) i.checked = val;
    });
    return b;
  };
  tools.appendChild(mkBtn('all', true));
  tools.appendChild(mkBtn('none', false));
  panel.appendChild(tools);

  // grouped checkboxes (groups in first-seen order)
  const groups: string[] = [];
  for (const d of Debug.defs) if (!groups.includes(d.group)) groups.push(d.group);

  for (const group of groups) {
    const gh = document.createElement('div');
    gh.textContent = group;
    gh.style.cssText = 'color:#7fd17f;margin:6px 0 2px;font-weight:bold;';
    panel.appendChild(gh);

    for (const d of Debug.defs.filter((f) => f.group === group)) {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:1px 0;cursor:pointer;';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = Debug.on(d.key);
      input.addEventListener('change', () => Debug.set(d.key, input.checked));
      inputs.push(input);
      const span = document.createElement('span');
      span.textContent = d.label;
      row.appendChild(input);
      row.appendChild(span);
      panel.appendChild(row);
      // MANUAL WIND sub-controls, folded under the sailing flag (the developer's call): an override
      // checkbox + direction/strength sliders. DebugOverlay syncs these into WindSystem each frame.
      if (d.key === 'world.wind') panel.appendChild(buildWindControls());
    }
  }

  document.body.appendChild(panel);

  window.addEventListener('keydown', (e) => {
    if (e.key !== '`' && e.key !== '~') return;
    e.preventDefault();
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });
}
