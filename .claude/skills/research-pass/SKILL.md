---
name: research-pass
description: Run a standalone industry-survey research pass for a backlog item or design topic — lenses, fan-out/deep-research, verification, the evidence file. Use when the developer asks to research a topic/backlog # WITHOUT (yet) designing it; /design-pass calls this flow as its step 3.
argument-hint: "[backlog # or topic, e.g. '8' or 'naval combat']"
---

The method doc IS the instructions — read `docs/references/DESIGN_PASS_RESEARCH.md` in full before anything
(especially §0's SKIP rules and the budget notes). This skill only sequences it.

## Sequence

1. **Check §0 first — and say the verdict out loud.** Feel/taste call, settled decision, or no prior art →
   report WHY research doesn't pay here and stop. Match rigor to leverage.
2. **Ground.** Read the backlog item (hard questions + leans) or the topic's design doc, plus the canon it
   touches. Research that can silently contradict canon is a bug. Define DONE before launching (§1.8).
3. **Claim.** Handoff claim line, footprint = the NEW `docs/research/<TOPIC>_RESEARCH.md` only.
4. **Pick lenses** from the §3 per-item map (bold = start; *(cautionary)* = study the failure). If the
   topic has no row, propose lenses in its spirit — canonical ref + cautionary tale + adjacent field.
5. **Choose the budget tier, out loud:** premium (A fan-out per lens + B verification — for
   make-once-pay-forever passes) or the single rich `/deep-research` brief (~⅓ cost; context + hard
   questions + deliverable shape ALL in the args — the sailing pass is the worked example). Verification
   is PRIORITY-ORDERED AND CAPPED (§1.4): only decision-changing claims, ~10–15 max.
6. **If the run dies** (session limits, crashes): the §2 salvage protocol — journal.jsonl → solo synthesis
   → honest label downgrades ([VERIFIED] / [SOURCED] / [LORE]) → state the caveat. Never silently re-run.
7. **File the evidence**: `docs/research/<TOPIC>_RESEARCH.md` — verdict table (adopt/adapt/reject or
   S/A/B/C/D per adoption-tiers), confidence-labeled claims with sources, rejected ideas WITH reasons,
   the 3–5 deep-read sources, and any restructure-now calls against existing code/designs.
8. **Record.** Canon corrections → FLAGGED to the developer (never silently applied). If the topic has a
   design doc, update its stage line to `researched` (or leave `designed`+flag if research contradicts a
   finished design). Release the claim. Report the developer the verdicts, the kills, and the surprises —
   not the source list.

## Hard rules
- Research exists to KILL weak designs, not to confirm them (§1.5) — report what died.
- Folklore is excluded, not laundered (§1.6); a number that traces only to forums is named as such.
- Runaway swarms returning trivia get stopped, not indulged (§0).
