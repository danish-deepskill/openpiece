// Stop hook — validates the STAGE HEADER on design docs edited this turn (the design-pass pipeline's
// enforcement half: stage lives IN the doc, machine-checked, so lifecycle tracking is checked-not-remembered).
// Same shape as stop-typecheck.js: reads the PostToolUse accumulator's marker, batches once per turn, exit 2
// feeds the violation back to Claude, exit 0 is silent. Never blocks on environment problems.
// Rules (docs/references/DESIGN_PASS_METHOD.md §1): every .md under docs/design/{,features/,ai/} must carry,
// in its first 6 lines, `> **Stage:** <stage> — <note>` with a legal stage. docs/design/raw/ is exempt (raw
// captures bin). Unknown stages fail loud — a typo'd stage is a silent lifecycle hole.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const STAGES = ['capture', 'researched', 'designed', 'building', 'shipped', 're-opened', 'meta'];
const STAGE_RE = new RegExp('^> \\*\\*Stage:\\*\\* (' + STAGES.join('|') + ')\\b');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let evt = {};
  try { evt = JSON.parse(raw || '{}'); } catch (_) { /* treat malformed payload as a plain Stop */ }
  if (evt.stop_hook_active) process.exit(0); // loop guard, same as stop-typecheck

  const sid = String(evt.session_id || 'default').replace(/[^A-Za-z0-9-]/g, '');
  const marker = path.join(os.tmpdir(), `openpiece-edited-design-${sid}.txt`);

  // litter sweep for orphaned markers (sessions killed without a Stop) — best-effort, never affects outcome
  try {
    for (const f of fs.readdirSync(os.tmpdir())) {
      if (!/^openpiece-edited-design-.*\.txt$/.test(f)) continue;
      const full = path.join(os.tmpdir(), f);
      if (full === marker) continue;
      if (Date.now() - fs.statSync(full).mtimeMs > 7 * 24 * 3600 * 1000) fs.unlinkSync(full);
    }
  } catch (_) { /* best-effort */ }

  if (!fs.existsSync(marker)) process.exit(0);
  let edited = '';
  try {
    edited = fs.readFileSync(marker, 'utf8');
    fs.unlinkSync(marker);
  } catch (_) { process.exit(0); }

  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const offenders = [];
  for (const f of [...new Set(edited.split(/\r?\n/).filter(Boolean))]) {
    const full = path.resolve(root, f);
    const rel = path.relative(root, full).replace(/\\/g, '/');
    if (!/^docs\/design\/(features\/|ai\/)?[^/]+\.md$/i.test(rel)) continue; // scope: the three lifecycle dirs; raw/ + deeper are exempt
    let head;
    try { head = fs.readFileSync(full, 'utf8').split(/\r?\n/, 6); } catch (_) { continue; } // deleted/moved — not this hook's business
    if (!head.some((l) => STAGE_RE.test(l))) offenders.push(rel);
  }
  if (offenders.length === 0) process.exit(0);

  console.error(
    'Design docs edited this turn are missing a valid Stage header (docs/references/DESIGN_PASS_METHOD.md §1):\n' +
    offenders.map((f) => `  - ${f}`).join('\n') +
    `\nAdd, directly under the title: > **Stage:** <${STAGES.join('|')}> — <one-line note>`
  );
  process.exit(2);
});
