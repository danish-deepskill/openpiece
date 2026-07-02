#!/usr/bin/env node
/**
 * PreCompact safety net (fire-and-forget — steering the summary is undocumented, so we don't try).
 * Snapshots the REPO facts a compaction summary tends to blur — branch, dirty files, recent commits —
 * into .claude/handoff.md so the post-compact session can re-ground itself in ground truth instead of
 * trusting the summary. Never blocks: always exits 0.
 */
const { execSync } = require('node:child_process');
const { writeFileSync, existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '(unavailable)';
  }
}

try {
  let trigger = 'auto';
  try {
    const input = JSON.parse(readFileSync(0, 'utf8'));
    trigger = input.trigger ?? input.matcher ?? 'auto';
  } catch {
    /* no stdin — keep default */
  }

  const root = process.cwd();
  const branch = git('rev-parse --abbrev-ref HEAD');
  const dirty = git('status --short');
  const dirtyLines = dirty === '' ? [] : dirty.split('\n');
  const commits = git('log --oneline -5');

  // Preserve the intent section a /handoff wrote earlier, if any (the human-authored half of this file).
  const path = join(root, '.claude', 'handoff.md');
  let intent = '';
  if (existsSync(path)) {
    const prev = readFileSync(path, 'utf8');
    const m = prev.match(/## Task state[\s\S]*$/);
    if (m) intent = '\n' + m[0].trim() + '\n';
  }

  const body = `# Session handoff (safety net)

> Auto-written by the PreCompact hook (trigger: ${trigger}) at ${new Date().toISOString()}.
> After a compaction, the summary is LOSSY — trust this file + git over your memory of file contents.
> Re-read any file before editing it. Durable context: CLAUDE.md, docs/DESIGN_PATTERNS.md, auto-memory.

## Repo ground truth at compaction
- branch: ${branch}
- dirty files (${dirtyLines.length}):
${dirtyLines.slice(0, 30).map((l) => '  ' + l).join('\n') || '  (clean)'}
${dirtyLines.length > 30 ? `  …and ${dirtyLines.length - 30} more\n` : ''}
- recent commits:
${commits.split('\n').map((l) => '  ' + l).join('\n')}
${intent}`;

  writeFileSync(path, body, 'utf8');
} catch {
  /* never block compaction */
}
process.exit(0);
