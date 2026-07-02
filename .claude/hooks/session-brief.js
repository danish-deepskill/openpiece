#!/usr/bin/env node
/**
 * SessionStart brief — stdout is INJECTED into Claude's context (documented contract). Keep it SHORT:
 * the whole point of the continuity strategy is not to waste the fresh window. Branches on `source`:
 *  - compact: warn that the summary is lossy + point at the handoff snapshot and ground truth.
 *  - startup/resume: a one-glance repo state so the session starts oriented.
 * Never blocks: always exits 0.
 */
const { execSync } = require('node:child_process');
const { existsSync, readFileSync, statSync } = require('node:fs');
const { join } = require('node:path');

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

try {
  let source = 'startup';
  try {
    const input = JSON.parse(readFileSync(0, 'utf8'));
    source = input.source ?? 'startup';
  } catch {
    /* no stdin */
  }

  const branch = git('rev-parse --abbrev-ref HEAD') || '?';
  const dirtyCount = (git('status --short') || '').split('\n').filter(Boolean).length;
  const lastCommit = git('log --oneline -1');
  const handoff = join(process.cwd(), '.claude', 'handoff.md');
  const hasHandoff = existsSync(handoff);
  const handoffAge = hasHandoff ? Math.round((Date.now() - statSync(handoff).mtimeMs) / 3600000) : null;

  const lines = [];
  if (source === 'compact') {
    lines.push('[session-brief] Context was just COMPACTED — the summary is lossy. Ground rules:');
    lines.push('- RE-READ any file before editing it; do not trust remembered contents.');
    if (hasHandoff) lines.push('- Read .claude/handoff.md (snapshotted at compaction) for repo state + task intent.');
    lines.push('- CLAUDE.md and auto-memory were re-loaded from disk and are current.');
    lines.push(`- git: ${branch}, ${dirtyCount} dirty file(s), last commit: ${lastCommit}`);
  } else {
    lines.push(`[session-brief] git: ${branch}, ${dirtyCount} dirty file(s), last commit: ${lastCommit}`);
    if (hasHandoff && handoffAge !== null && handoffAge < 72) {
      lines.push(`- A handoff note exists (.claude/handoff.md, ~${handoffAge}h old) — read it before resuming work.`);
    }
    if (dirtyCount > 0) lines.push('- Uncommitted work in the tree: check `git status` before broad edits.');
  }
  process.stdout.write(lines.join('\n') + '\n');
} catch {
  /* never block session start */
}
process.exit(0);
