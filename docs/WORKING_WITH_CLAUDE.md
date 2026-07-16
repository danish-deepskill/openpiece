# Working with Claude — the developer's half of the contract

> The mirror of `CLAUDE.md`'s "Working agreements": that file teaches every Claude session how YOU work;
> this one teaches you how to drive Claude so a session is maximally effective. Skim once, revisit never —
> the habits stick fast.

## 1. How to ask for anything (no technical words needed)

Every great request has up to three ingredients — plain words are enough for all of them:

1. **What you observed** — describe the behavior like you'd tell a friend: *"I can rotate the ship when
   idle"*, *"the enemy gets stuck walking into a wall"*, *"the hat doesn't fade with the body"*.
2. **What you expected / how it feels** — *"that seems wrong"*, *"it should feel heavier"*, *"too fast"*.
3. **When/where it happens** (if you know) — *"only after respawn"*, *"only on the second island"*.

**Magic phrases that always work:**
- *"I expected X but got Y"* — the universal bug report.
- *"Is that good design?" / "does that make sense?"* — asks for an honest verdict, not blind obedience.
- *"Make it feel more like <game>"* — references (Necesse, Sea of Thieves, Deepwoken…) are great specs.
- *"Remember this"* — stores a preference/correction permanently (survives every future session).
- *"Just assess, don't change anything yet"* — when you want analysis before edits.

**You never need to provide:** the cause, the file, the fix, or the vocabulary. Translating "rotates when
idle" into "turn rate isn't speed-scaled in ShipSystem" is Claude's job, done by reading the code — and if
your instinct is wrong, you'll be told why instead of getting a bad change you asked for.

## 2. What Claude will do with any request (so you can tell when it goes off-rails)

1. **Restate** what it understood — correct it there, that's the cheap moment.
2. **Read the actual code/docs** before answering — verdicts come from reality, not memory.
3. **Give an honest design verdict** when you asked a question (including "your instinct is wrong").
4. **Make the smallest change that fits the canon** — behavior lands as a data knob (Def field/constant),
   not a hardcoded hack. If your request exposes a structural gap, it proposes the foundation version.
5. **Hand you the knobs + a 30-second playtest list** — feel-tuning is yours; it names the file + field.
6. **Verify with gates** (typecheck + tests, build when relevant) and report honestly — red is reported
   as red, never papered over.

If a session skips these (edits before restating, answers without reading, hardcodes a value), call it out —
the conventions are in `CLAUDE.md`, so "follow the working agreements" is a complete correction.

## 3. Division of labor — who verifies what

| Claude proves (machine gates) | You prove (the only human gates) |
|---|---|
| typecheck, 70+ unit tests, prod build | **feel** — speed, weight, timing, fun |
| architecture boundaries (`architecture.test.ts`) | **looks** — visuals, readability, glitches |
| canon compliance (`/check-canon`) | **direction** — is this the game you want? |

"Done" from Claude = gates green + a playtest list. It's not truly done until your 5-minute playtest agrees.
Playtest with the debug panel open (**backtick**) when checking AI/combat — it shows vision cones, paths,
reach, squad tokens.

## 4. Shared vocabulary (use these words and any session instantly understands)

- **The Moat** — every actor runs the identical systems; control is a component; nobody is special.
- **Canon** — the rules in `docs/DESIGN_PATTERNS.md`; "is this canon?" = "does it follow our standards?"
- **Def / knob** — content and tuning live as data rows (`app/src/defs/…`); "make it a knob" = tunable data.
- **Sim vs presentation** — game logic (must run without Phaser) vs drawing/input/HUD. The split is law.
- **Gates** — typecheck + tests (+ build). "Gates green?" = "is it verified?"
- **Slice** — a small end-to-end playable piece of a bigger feature (how everything gets built here).
- **Handoff** — the saved state that lets the next session resume without re-teaching (`/handoff`).
- **Frame** — the space a body's position lives in: **world** or **deck** (aboard a ship, `D-`/`W-` in the
  debug readout). Handoffs between them follow the floor edge.
- **Straddle** — center on a floor edge, body half over each side. **Outer straddle** = the gangplank's
  outer end (plank ↔ water/land) — THE world↔deck handoff line, both directions. **Inner straddle** = the
  plank's deck-side end (NOT a transition; the deck frame holds across the whole plank). **Rail straddle** =
  gunwale ↔ sea, where the walk-off fires. Also: the **lane** (plank cell + one tile outward — the open
  corridor through the door) and the **lane mouth** (that outward approach tile).

## 5. Session rituals (the daily rhythm)

- **Start:** just open Claude Code here — CLAUDE.md + memory + rules auto-load; a hook injects git state.
  Prefer a **fresh session per task**; carry one session only through a single big task.
- **During:** correct early, correct often. Say "remember this" when a correction should be permanent.
  For design ideas, ask for the verdict *before* the build ("worth it? trade-offs?").
- **Milestones:** when a chunk lands green, say **"commit"** (Claude never commits unasked). For nontrivial
  work it runs `/check-canon` first.
- **End / context getting low:** run **`/handoff`** — writes in-flight state so tomorrow's session resumes
  at file:line. If mid-task and context is filling, prefer `/compact <what to focus on>` over letting
  auto-compact fire at a random moment.

## 6. Overriding the canon (you're the owner)

Claude pushes back when a request conflicts with the standards — that's by design, not disobedience. If you
still want it after hearing the trade-off, say **"do it anyway"** and it happens (ideally with "remember
this" if it's a new permanent preference). The canon serves the game, not the other way around.
