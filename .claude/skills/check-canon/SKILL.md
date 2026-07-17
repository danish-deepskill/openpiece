---
name: check-canon
description: Review the working diff against openpiece's canon — the DESIGN_PATTERNS §12 checklist and EDGE_CASES cross-cutting bug classes. Use before committing nontrivial app/src changes, or when asked whether a change follows the canon.
---

The rubric is the project's own docs, not generic standards: `docs/DESIGN_PATTERNS.md` (§12 is the per-diff
checklist; §0 the prime directives) and `docs/references/EDGE_CASES.md` (the ★ cross-cutting section).

1. For a large or risky diff, delegate to the **canon-reviewer** subagent (it reads the rubric and greps the
   mechanical violations) and relay its findings verbatim. For a small diff, review inline:
2. `git diff` (plus `git diff --staged` if things are staged) from the repo root.
3. Walk DESIGN_PATTERNS §12 item by item. Then the EDGE_CASES ★ list: clamp after every mutation; edge-trigger
   (not level-trigger) transitions; dt on all time-based math; one contact = one action; compare actual ids,
   never hardcode types; guard null/destroyed entity refs held across frames.
4. What is NOT a violation here: in-place component mutation (that IS the ECS style — never suggest
   spread-copies in per-frame code); the absence of browser/E2E tests (verification is typecheck + Vitest
   headless-sim only, by explicit convention).
5. Finish with `npm run typecheck` and `npm test` from `app/`, and report each §12 item as pass / fail / n-a
   with `file:line` evidence for every fail.
