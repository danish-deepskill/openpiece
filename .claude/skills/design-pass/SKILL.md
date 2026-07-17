---
name: design-pass
description: Run a design pass on a DESIGN_BACKLOG item — ground → (optional) research → design synthesis → gates → ledger. Use when the developer says to design/judge a backlog #, or to take a vision capture to "designed".
argument-hint: "[backlog # or doc name, e.g. '1' or 'crew']"
---

The two method docs ARE the instructions — this skill only sequences them. Read BOTH before doing anything:
`docs/references/DESIGN_PASS_METHOD.md` (the pipeline, doc anatomy, gates) and
`docs/references/DESIGN_PASS_RESEARCH.md` (the research half + when to SKIP it).

## Sequence

1. **Ground.** Read the backlog item (its *hard questions* + *leans* + *pass-when*), the target doc's
   current state (check its `> **Stage:**` line), `DESIGN_BACKLOG.md`'s moat test, and every doc the item
   cross-references. If the pass-when trigger hasn't fired, SAY SO and stop — don't design early because
   you were asked politely.
2. **Claim.** Add a claim line to `.claude/handoff.md` with the file footprint (the target design doc +
   a new `docs/research/<TOPIC>_RESEARCH.md` if researching). Check no other session claims them.
3. **Research — or skip it, out loud.** Run the `/research-pass` skill (it sequences the RESEARCH doc:
   §0 skip rules, lens map, budget tier, salvage protocol, the `<TOPIC>_RESEARCH.md` evidence file). If
   §0 says skip, STATE which skip rule applied and move on.
4. **Synthesize** the design per METHOD §2 (the SAILING.md skeleton): verdict-on-a-spectrum first, N named
   pieces with every knob on a def, emergent-behaviors-no-code, sub-mechanics with build-after triggers,
   skill bands, architecture mapping, the AI-can-play-it check, build order. Stamp the doc
   `> **Stage:** designed — …` only after §3's gates ALL pass.
5. **Review.** Run the `design-reviewer` agent on the doc; address or explicitly waive its findings (the
   developer owns waivers). Present the developer every LEAN you confirmed/overrode and every canon
   conflict you flagged — his verdicts are the pass's verdicts.
6. **Record.** Update the backlog's Already-designed ledger + the item's entry, sync `ROADMAP.md` if build
   order changed, release the handoff claim. A decision not recorded in a file did not happen.

## Hard rules
- Never silently contradict canon (flag conflicts; the developer rules).
- Rejected alternatives go IN the doc with reasons — they are canon (`DESIGN_PATTERNS.md` §10).
- Prototype-first passes are legal (METHOD §4): when the risk is feel, the "design" step may be a slice
  spec + kill criteria instead of a full doc — say which risk class the pass is.
- Verify nothing by vibes: research claims carry [VERIFIED]/[SOURCED]/[LORE] labels; knobs carry starting
  numbers; gates are a checklist, not a mood.
