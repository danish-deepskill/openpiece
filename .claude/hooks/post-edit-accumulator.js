// PostToolUse (Edit|Write) hook — records edited TypeScript files so the Stop hook can batch-typecheck
// ONCE per turn instead of per edit. Marker file is keyed by session id (two agents on this repo must not
// read each other's edits). Never blocks, never prints: bookkeeping must not fail an edit.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  try {
    const evt = JSON.parse(raw || '{}');
    const fp = evt.tool_input && evt.tool_input.file_path;
    if (typeof fp === 'string' && /\.tsx?$/i.test(fp)) {
      const sid = String(evt.session_id || 'default').replace(/[^A-Za-z0-9-]/g, '');
      fs.appendFileSync(path.join(os.tmpdir(), `ballpiece-edited-ts-${sid}.txt`), fp + '\n');
    }
  } catch (_) { /* malformed payload — skip; never fail an edit over bookkeeping */ }
  process.exit(0);
});
