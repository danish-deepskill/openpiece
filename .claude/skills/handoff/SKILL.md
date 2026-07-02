---
name: handoff
description: End-of-session / low-context handoff — capture in-flight task state so the next session (or post-compact self) resumes without re-teaching. Use when the developer says he's stopping, when context is getting low mid-task, or before a risky /compact.
argument-hint: "[optional: what to emphasize]"
---

Context windows are disposable; files are not. This skill writes the HUMAN half of `.claude/handoff.md`
(the PreCompact hook auto-writes the git-facts half). Rules of the house apply: short, concrete, why-first.

## Steps
1. **Update `.claude/handoff.md`** — keep/refresh the auto-written "Repo ground truth" section if present,
   then write (or replace) a `## Task state` section containing ONLY what git can't tell a fresh session:
   - **Current task + exact state**: what's done, what's half-done, the very next action (file:line level).
   - **Decisions made this session** and their WHY (one line each) — especially anything that overrode canon.
   - **Gotchas discovered** (things that will bite a fresh session: quirks, false leads already ruled out).
   - **Gates status**: typecheck / tests / build — green or what's red and why.
   - Do NOT restate the codebase, canon, or anything already in CLAUDE.md/docs/memory.
2. **Route durable knowledge OUT of the handoff**: a new preference/correction → auto-memory; a project
   decision → the relevant doc (DESIGN_PATTERNS/design docs) — the handoff is for IN-FLIGHT state only,
   and it gets overwritten next time.
3. **Suggest a commit** if gates are green and the work is a coherent checkpoint (commit only if the
   developer says yes — house rule).
4. Reply with a 3-line confirmation: where the handoff lives, what the next session should do first, and
   whether a commit is recommended.

## Retrieval side (for the next session)
The SessionStart hook injects a pointer when a fresh/compacted session begins. If you (the next session) are
reading this: `.claude/handoff.md` → "Task state" is your resume point; re-read the files it names before
editing; trust git facts over any summary.
