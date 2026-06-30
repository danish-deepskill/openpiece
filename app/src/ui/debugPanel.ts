import { Debug } from '../core/Debug';

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
    }
  }

  document.body.appendChild(panel);

  window.addEventListener('keydown', (e) => {
    if (e.key !== '`' && e.key !== '~') return;
    e.preventDefault();
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });
}
