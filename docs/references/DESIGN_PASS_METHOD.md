# The Design Pass — from a backlog `#` to designed canon (the method)

> The DESIGN-SYNTHESIS half of the pipeline. `DESIGN_PASS_RESEARCH.md` is the evidence-gathering half;
> this file is how a pass turns hard questions + evidence into **judged mechanics with trade-offs and
> knobs** (`DESIGN_BACKLOG.md`'s one-line definition of a design). Reverse-engineered from the two best
> worked examples — `SAILING.md` and `PATHFINDING.md` — so imitating them stops being tribal knowledge.
> Hand this file + a backlog `#` to any session. Enforcement: every design doc carries a machine-checked
> **Stage** header (the hook validates it); `/design-pass` walks this whole flow.

## 0. The pipeline (and where each stage lives)

```
backlog # (hard questions + leans)                        DESIGN_BACKLOG.md
   → GROUND (read canon, vocabulary, settled decisions)   method: RESEARCH doc §1.1
   → RESEARCH (optional — §0 skip rules apply)            method: DESIGN_PASS_RESEARCH.md
   → DESIGN SYNTHESIS (this doc)                          output: the designed doc
   → DEVELOPER REVIEW (leans confirmed or overridden)     the developer owns every verdict
   → LEDGER + SYNC (backlog ledger, ROADMAP, stage stamp) the pass is only done when recorded
   → build slices → PLAYTEST                              the real judge; may RE-OPEN the doc
```

Design is a LOOP, not a conveyor: playtest verdicts re-open docs (stage `re-opened`), and that is the
system working, not failing. The doc exists so a playtest surprise rewrites a page, not a subsystem.

## 1. Stage vocabulary (the machine-checked header)

Every doc under `docs/design/` (top level, `features/`, `ai/`) carries, directly under its title:

`> **Stage:** <stage> — <one-line note>`

| Stage | Means |
|---|---|
| `capture` | vision/feature list/idea map — NOT yet a design (no verdicts, no knobs) |
| `researched` | evidence file exists (`references/<X>_RESEARCH.md`), synthesis not run |
| `designed` | judged mechanics with trade-offs + knobs; gates below passed |
| `building` | slices landing against it; doc is the build's contract |
| `shipped` | built + playtested; doc records what IS |
| `re-opened` | a playtest/build finding invalidated part of it — name the part in the note |
| `meta` | queues, indexes, catalogs (BACKLOG, REFERENCES, SEA_CATALOG…) — outside the lifecycle |

Stage lives IN the doc (not in folder location) because our docs are densely cross-linked and cycle
through stages — moving files breaks links twice. The backlog's **Already-designed ledger** is the one
kanban view; the Stop hook (`stop-design-stage.js`) fails the turn if an edited design doc lacks a legal
stage line.

## 2. Anatomy of a DESIGNED doc (the SAILING.md skeleton — imitate it)

1. **Scope header** — which vision doc's half this judges, judgment date, what is deliberately out.
2. **THE VERDICT** — placement on the design spectrum (arcade ↔ sim, scripted ↔ systemic…), with the
   spectrum drawn, the rejected tiers named, and the WHY. The single most load-bearing section: every
   later fight about scope is settled by pointing here.
3. **Core model** — N named pieces (SAILING has five). Every behavior knob ON A DEF, named with unit +
   behavioral consequence. If a piece can't state its def field, it isn't designed yet.
4. **Emergent behaviors — deliberately NO dedicated code.** The list of things that FALL OUT of the model
   (tacking, in-irons, weather gauge). This section is the moat test #1 made concrete: if a desired
   behavior needs bespoke logic, the model is wrong, not the list.
5. **Sub-mechanics judged, with build-after gates** — each with its trigger ("after momentum lands"),
   never dates.
6. **Skill/progression mapping** (where applicable) — capability BANDS (each band unlocks something you
   couldn't do at all), never percentages ("+5% is mush" — the SAILING rule).
7. **Architecture mapping** — which systems/defs/components it touches; sim-purity + determinism +
   multiplayer-safety stated explicitly; what stays presentation.
8. **The AI-can-play-it check** — can the same model be driven by utility rules at every INT band, with
   LOW skill degradable (the knowledge economy)? A mechanic only the player can operate fails the Moat.
9. **Build order** — triggers, not dates; first slice identified (smallest end-to-end playable).

## 3. Completion gates (all must pass before stamping `designed`)

- [ ] Every **hard question** on the backlog item: evidence-backed answer OR explicit
      "prototype/playtest decides, not more thinking" (with what the playtest must measure).
- [ ] Every **lean** confirmed or overridden **with reasons** — silence is not confirmation.
- [ ] **Rejected alternatives recorded** with the why (rejected alternatives are canon, §10).
- [ ] The **moat test ×6** (`DESIGN_BACKLOG.md`) passed, item by item.
- [ ] No silent canon contradiction — conflicts with `DESIGN_PATTERNS`/`ARCHITECTURE*`/other designed
      docs are FLAGGED to the developer, never absorbed quietly.
- [ ] Knobs sanity: a reasonable starting number for every knob (the developer tunes; he needs a start).
- [ ] `design-reviewer` agent run on the doc; findings addressed or explicitly waived by the developer.
- [ ] Ledger + stage + ROADMAP updated in the same change.

## 4. Which risk goes first — design-first vs prototype-first

Both are house-legal; pick by WHAT IS AT RISK:
- Risk = **fun/feel** → prototype first (a slice with placeholder numbers), design doc after the feel
  survives. A doc cannot tell you whether carving a galleon feels heavy.
- Risk = **architecture/retrofit cost** → design first (make-once-pay-forever shape decisions), then the
  feel slice. You cannot playtest your way out of a substrate that can't scale.
- Most passes are BOTH: split them (sailing did — feel slice on the old controls, field restructure from
  the research). Say which half is which in the scope header.

## 5. Failure modes this method exists to prevent

- **The doc as destination** — a beautiful designed doc nobody builds a slice against. The stage header
  rots at `designed`; the build trigger is the cure (gate #9 in §2).
- **Confirmation research** — see `DESIGN_PASS_RESEARCH.md` §0/§1.5; research must be able to KILL.
- **Tuning forever instead of killing** — a slice that tests boring gets a verdict conversation
  ("re-opened / back to §2-verdict"), not endless knob passes. Kill criteria are respect for the vision.
- **Un-recorded verdicts** — a decision that lives in a chat transcript doesn't exist. Ledger or it
  didn't happen (context is disposable; files are the memory).
