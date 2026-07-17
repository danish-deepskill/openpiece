// Stop hook — batch-typechecks the turn's edited .ts files: runs the project's own tsc in app/ once, only if
// the PostToolUse accumulator recorded edits under app/src. Exit 2 feeds stderr back to Claude (turn continues,
// errors get fixed); exit 0 is silent. Design notes (learned from ECC's stop-format-typecheck.js, rewritten):
//  - stop_hook_active guard prevents an infinite block loop; the marker survives that path on purpose so the
//    NEXT real Stop re-verifies anything a blocked turn touched.
//  - filter is app/src (not all of app/) because tsconfig `include: ["src"]` — a test-file edit must not get a
//    false "verified" from a tsc run that never compiled it.
//  - invoke the PROJECT's compiler directly (node node_modules/typescript/bin/tsc) and bail if it isn't
//    installed — `npx tsc` on a bare clone silently falls back to a global (version-skewed) TypeScript, or
//    worse, fetches the deprecated `tsc` npm stub from the network.
//  - tsc emits app/-relative forward-slash paths — we normalize ours the same way for the hint line
//    (ECC compared backslash paths and silently dropped every error on Windows).
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let evt = {};
  try { evt = JSON.parse(raw || '{}'); } catch (_) { /* treat malformed payload as a plain Stop */ }

  // Already continuing because a Stop hook blocked — don't block again (loop guard).
  if (evt.stop_hook_active) process.exit(0);

  const sid = String(evt.session_id || 'default').replace(/[^A-Za-z0-9-]/g, '');
  const marker = path.join(os.tmpdir(), `openpiece-edited-ts-${sid}.txt`);

  // Opportunistic litter control: sessions killed without a Stop orphan their markers forever (%TEMP% is
  // never purged on Windows). Sweeping must never affect this hook's outcome.
  try {
    for (const f of fs.readdirSync(os.tmpdir())) {
      if (!/^openpiece-edited-ts-.*\.txt$/.test(f)) continue;
      const full = path.join(os.tmpdir(), f);
      if (full === marker) continue;
      if (Date.now() - fs.statSync(full).mtimeMs > 7 * 24 * 3600 * 1000) fs.unlinkSync(full);
    }
  } catch (_) { /* sweep is best-effort */ }

  if (!fs.existsSync(marker)) process.exit(0);

  let edited = '';
  try {
    edited = fs.readFileSync(marker, 'utf8');
    fs.unlinkSync(marker);
  } catch (_) { process.exit(0); }

  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd(); // hooks run with cwd = project root
  const appDir = path.join(root, 'app');
  const tscBin = path.join(appDir, 'node_modules', 'typescript', 'bin', 'tsc');
  // No tsconfig or no installed compiler (fresh clone) — stay silent rather than block on the environment.
  if (!fs.existsSync(path.join(appDir, 'tsconfig.json')) || !fs.existsSync(tscBin)) process.exit(0);

  // Only app/src TypeScript is compiled (tsconfig include: ["src"]); edits elsewhere must not trigger a run
  // whose result can't speak for them.
  const srcDir = path.join(appDir, 'src') + path.sep;
  const files = [...new Set(edited.split(/\r?\n/).filter(Boolean))]
    .map((f) => path.resolve(root, f))
    .filter((f) => f.toLowerCase().startsWith(srcDir.toLowerCase()));
  if (files.length === 0) process.exit(0);

  const res = spawnSync(`node "${tscBin}" --noEmit --pretty false`, {
    cwd: appDir,
    shell: true,
    encoding: 'utf8',
    timeout: 240000,
  });
  if (res.error || res.status === null) process.exit(0); // spawn failed / timed out — don't block on it
  if (res.status === 0) process.exit(0);

  const out = `${res.stdout || ''}\n${res.stderr || ''}`.trim();
  const rel = files.map((f) => path.relative(appDir, f).replace(/\\/g, '/'));
  console.error(
    `Typecheck failed (project tsc --noEmit in app/). TypeScript files edited since the last verified stop ` +
    `(usually this turn): ${rel.join(', ')}.\n` +
    'This working tree may be shared with concurrent work — prioritize errors your edits caused ' +
    '(in or downstream of the files above), but report any pre-existing errors you did not cause.\n\n' +
    out.slice(0, 8000)
  );
  process.exit(2);
});
