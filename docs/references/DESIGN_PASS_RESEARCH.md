# Design-Pass Research — the method, the template, the per-item map

> How to run a **deep industry-survey research pass** for a `DESIGN_BACKLOG.md` item the way the
> `SEAMLESS_WORLD.md` pass (#14) was run: fan out to primary sources, tier findings against our pillars, and
> adversarially verify — so a design doc stands on *shipped precedent and named failure modes*, not vibes.
> This is a companion to `LEARNING_SOURCES.md` (where to LEARN each subsystem) and `adoption-tiers.md` (the
> S/A/B/C/D verdict pattern this borrows). Hand this file to any agent/session and point it at a backlog `#`.

## 0. When to run this — and when NOT to

**Run it** for a design pass that (a) has strong shipped precedent to steal from, and (b) makes a
make-once-pay-forever decision. A fresh, unwritten pass gains far more from research than a finished doc:
the first research dollar on an unwritten pass is worth ten on a polished one.

**Skip it** for: feel/taste calls (how long should a sea *feel* — that's a playtest, not a literature
search); decisions already settled from strong precedent (don't re-litigate to get confirmation); and
genuinely novel compositions with no prior art (a prototype resolves those, not reading). **Match rigor to
leverage.** When agents start returning trivia (corporate financials for a game-design doc), you are past
the useful edge — stop, and kill runaway sub-agent swarms rather than let them drain the budget.

## 1. The method — eight moves

1. **Ground first, research second.** Before fanning out, READ: the backlog item's *hard questions* + *leans*,
   the existing design doc if one exists, the pillars (`DESIGN_PATTERNS.md §0`, the moat test in
   `DESIGN_BACKLOG.md`), `adoption-tiers.md`, and `REFERENCES.md`'s verdict on the relevant games. Map the
   codebase's OWN vocabulary and settled decisions so research is aimed and **cannot contradict canon
   silently**. A research pass that re-opens a settled decision is a bug.
2. **Fan out — one reference lens per agent.** ~5–8 parallel agents, each on a *distinct* shipped game or
   academic field. Demand **mechanisms + numbers + failure stories**, never overviews. Require primary
   sources with URLs, and require each agent to **distinguish VERIFIED (read the source) from RUMOR/
   INFERENCE**. The failure stories matter as much as the wins — a shipped game's known bug class is a trap
   you get to dodge for free.
3. **Tier every finding S/A/B/C/D against our pillars**, in the `adoption-tiers.md` pattern: S = adopt now /
   already canon · A = adopt at a named milestone · B = adapt (right idea, needs reshaping) · C = defer until
   scale proves it · D = do not adopt (with the reason). Each row gets a **steal / avoid verdict** and a
   **build trigger**. Pillars to judge against: content-is-data · the Moat (no actor is special) ·
   headless-deterministic sim · cost-scales-with-active-area · the six moat-test rules.
4. **Adversarially verify the load-bearing claims — in PRIORITY ORDER, capped.** The `/deep-research`
   workflow (3 skeptics per claim, majority kills it). Verify ONLY claims that would **change a decision if
   false**; skip corroborative ones — a survived trivial claim is budget spent on nothing. Cap the verified
   set (~10–15) and order it load-bearing-first, because the run can DIE mid-verification (the sailing pass
   did, at a session limit: 100+ vote-agents queued breadth-first, synthesis never ran). A refuted claim is
   a save; a survived claim is a foundation you can cite.
5. **Let research KILL weak designs and CORRECT canon.** The point is not confirmation — it's finding where
   your invented design is *worse* than a shipped one, or where a canon assumption is *wrong*. (The #14 pass
   killed its own "ledger row type" and "separate autoresolve math," and corrected CLAUDE.md's "Kenshi-tier
   world sim.") Canon corrections get **flagged to the developer** (handoff inbox), never silently applied.
6. **Mark verified vs sourced-but-unconfirmed; exclude folklore.** A design doc is better short a datum than
   carrying a laundered one. If a number traces only to forum posts, exclude it and say so. If the source is
   solid but the verification vote didn't complete, mark it "sourced, unconfirmed."
7. **Multi-session hygiene.** Claim a **disjoint file footprint** (the target design doc only — new file if
   possible). Flag cross-cutting findings that touch other files to the handoff inbox, never as silent edits.
   Add a claim line to `.claude/handoff.md` before starting.
8. **Define DONE before you start.** A pass is complete when every *hard question* on the backlog item has
   either an evidence-backed answer or an explicit **"prototype/playtest decides, not more reading."**
   Without this contract, passes end when the budget ends instead of when the questions do — and nobody can
   tell the difference afterward.

## 2. The reusable prompt template

Two prompts. **(A)** one per fan-out agent (fill the slots, launch 5–8 in parallel). **(B)** one
`/deep-research` invocation for adversarial verification of the load-bearing claims.

### (A) Fan-out agent prompt

```
Research task for the openpiece design pass on {{BACKLOG_ITEM}} ({{ONE-LINE_WHAT_IT_IS}}).
Reference lens: {{GAME_OR_FIELD}} — treat it as {{THE_CANONICAL_REF | A_CAUTIONARY_TALE}} for this problem.

Context I'm designing against (do NOT contradict): {{THE_ITEM'S_LEANS + RELEVANT_CANON}}.
The hard questions this pass must answer: {{PASTE_THE_BACKLOG_HARD_QUESTIONS}}.

Dig for MECHANISMS, NUMBERS, and FAILURE STORIES — not an overview. Specifically:
1. How does {{GAME}} actually implement {{THE_MECHANIC}}? Exact model, data shapes, the numbers
   (rates, radii, thresholds, tick intervals, costs).
2. What BREAKS — the documented bugs, the exploits, the "we patched this for years" stories. A known
   failure mode is a trap we get to dodge.
3. The one or two ideas worth STEALING, and the one or two to AVOID, each with why.
Use WebSearch/WebFetch heavily; cite URLs. Mark every claim VERIFIED (you read the source) vs
RUMOR/INFERENCE. Exclude numbers that trace only to forum folklore — say so instead.
Report ~700–900 words, ending with a "steal / avoid" verdict for a data-driven, headless-deterministic
ECS-lite game whose endgame is a living, server-authoritative sea.
```

### (B) `/deep-research` verification prompt

```
/deep-research  Foundations for {{BACKLOG_ITEM}} in a deterministic, data-driven, headless-sim game
(2D top-down TypeScript/Phaser, fixed-timestep seeded sim, ECS-lite). Verify these load-bearing claims
and surface prior art across {{3–5 ANGLES}}: {{ANGLE_1}} · {{ANGLE_2}} · {{ANGLE_3}} …
For each angle I want the NAMED pattern (does this mechanism have a formal name / shipped precedent?),
the correctness conditions, the documented pitfalls, and the actual numbers. Distinguish verified from
sourced-but-unconfirmed.
```

**Budget note (learned on the sailing run, 2026-07):** A-then-B double-pays — the fan-out agents search,
then `/deep-research` searches AGAIN before verifying. That premium shape is right for make-once-pay-forever
passes (#14 earned it). When budget is tight, the alternative is ONE `/deep-research` invocation with a
rich, canon-grounded brief (context + hard questions + deliverable shape all in the args) — roughly a third
of the cost, and it produced the sailing verdicts fine.

**If the run DIES mid-pipeline (limits, crashes) — the salvage protocol:** a host/process restart can be
RESUMED instead (`Workflow({scriptPath, resumeFromRunId})` — completed agents replay from cache), but the
resume MUST re-pass the ORIGINAL `args` verbatim: the question rides in args, and agent cache keys derive
from it (omitting args fails instantly; changed args = cold cache). For unrecoverable runs, the recoverable
state is the workflow's `journal.jsonl` (one result line per completed agent). (1) Extract all claims from it. (2)
Synthesize SOLO against them. (3) Downgrade labels honestly — **[VERIFIED]** only for claims that completed
their 3-vote gauntlet, **[SOURCED]** for primary-sourced claims whose votes were cut, **[LORE]** for hedged
secondhand. (4) State the caveat in the output doc. (5) Do NOT re-run verification for claims no decision
rests on. `SAILING_RESEARCH.md` is the worked example of a salvaged run.

Then synthesize — **into a separate evidence file, not the design doc**: `docs/research/<TOPIC>_RESEARCH.md`
holds the confidence-labeled findings, citations, verdict table, and the ideas you REJECTED with reasons
(rejected alternatives are canon per `DESIGN_PATTERNS.md §10`); the design doc consumes and CITES it. The
audit trail then survives later design-doc rewrites. Add the tier table (§1.3) to whichever file the
verdicts live in. (#14 folded findings directly into the design doc — it predates this convention.)

## 3. Per-item reference map — which lenses to survey

For each backlog item, the shipped games / academic fields whose *mechanisms* are worth surveying. **Bold** =
the canonical reference to start with; *(cautionary)* = study for how it FAILED. Cross-check `REFERENCES.md`
for any verdict already recorded (don't re-derive it).

| # | Pass | Reference lenses (bold = start here) |
|---|------|--------------------------------------|
| 1 | Crew & shipboard life | **RimWorld** (work priorities, ThinkTree→Job→Toils, schedules) · **Barotrauma** (crew orders + hazards ON a grid vessel — the closest shipped analogue to our deck grid) · Dwarf Fortress (labor, mood) · Oxygen Not Included (station assignment) · The Sims (needs+autonomy) · FTL / Sea of Thieves (crew stations) · Mount&Blade (companions) |
| 2 | Needs-lite | **RimWorld** (needs/mood, only extremes act) · The Long Dark / Kenshi (provisions as logistics) · FTL (fuel gates range) · Oregon Trail (supplies gate travel) — *(cautionary)* generic hunger-bar survival |
| 3 | Death, injury & defeat | **Kenshi** (limb loss, downed→recover, squad handoff) · RimWorld (Hediff injuries, downed/capture) · XCOM *(cautionary: permadeath frustration)* · Darkest Dungeon (afflictions/stress) · Rogue Legacy (legacy inheritance) |
| 4 | Power systems (content) | **MTG color-pie** (counterplay-as-design) · Path of Exile (skill economy) · Noita (spell combinatorics) · OSRS (gated unlocks) · Elden Ring (build identity) · GAS (engine, already ours) |
| 5 | Progression | **OSRS** (use-based, 500-cap, no-max) · Path of Exile (passive tree) · Kenshi (stat-by-use) · EVE (time-gated training) · Fire Emblem *(cautionary: no-respec regret)* |
| 6 | Bounty/HEAT/Nemesis | **Shadow of Mordor** (Nemesis — the canonical ref) · Red Dead 2 (witness/bounty/law) · GTA (wanted tiers) · Skyrim (per-hold bounty) · Metal Gear (alert states) — *(cautionary)* one global fame scalar |
| 7 | Living economy | **X4** (station economy) *(cautionary: save bloat)* · Kenshi (simple ledgers — our lean) · EVE (player economy, too deep) · Anno / Patrician (production+trade routes) · Victoria 3 (market sim) |
| 8 | Event director | **RimWorld Storyteller** (the ref) · Left 4 Dead AI Director · XCOM 2 Dark Events · Crusader Kings (event chains) · Sunless Sea (voyage/event pacing at sea — repetition-fatigue lessons) · Dwarf Fortress |
| 9 | Knowledge as a resource | **Outer Wilds** (knowledge-as-progression) · Return of the Obra Dinn (deduction) · Sunless Sea (charts/lore) · Sea of Thieves / Wind Waker (map items) · Tunic (the manual) |
| 10 | Island & world gen | **Dwarf Fortress** (mythgen/legends — the ref) · Caves of Qud (history gen) · Ultima Ratio Regum (culture gen) · No Man's Sky (procedural POIs) · Spelunky / Minecraft (structure gen) |
| 11 | Custom ship building | **Kerbal Space Program** (part validation, physics-from-build) · From the Depths / Avorion (block ships) · Space Engineers · Besiege · Barotrauma (submarine systems) |
| 12 | Territory / Yonko layer | **Mount&Blade** (fief/kingdom, the multi-scale loop) · Crusader Kings (realm mgmt) · Shadow of War (nemesis fortresses) · Total War (campaign) · Sid Meier's Pirates |
| 13 | Multiplayer gameplay | **Sea of Thieves** (shared PvPvE world) · EVE (consequence/PvP) · Rust (raid consent) · Foxhole (persistent war) · Albion (full-loot) · Dark Souls (invasions) |
| 14 | Seamless world | **DONE — `SEAMLESS_WORLD.md`** (the worked example; see §4) |
| 15 | Marine hierarchy / orgs | **Crusader Kings** (vassal/title hierarchy) · Shadow of War (orc hierarchy) · EVE (corp roles) · Dwarf Fortress (nobles/positions) · Papers Please (bureaucracy) |
| 16 | Elements & reactions | **BOTW chemistry engine** (the GDC ref) · Noita (pixel/material sim) · Divinity: Original Sin (elemental surfaces) · Zelda TOTK (fuse/physics) · Dwarf Fortress (temperature) · Magicka (combos) |
| 17 | Dialogue & social | **Caves of Qud** (grammar-from-state — the ref) · Disco Elysium (skill checks) · Crusader Kings (schemes) · Kenshi (state-gated dialogue) · Oblivion persuasion *(cautionary: minigame)* |
| 18 | Time & calendar | **RimWorld** (time controls, tick classes) · Majora's Mask / Persona (calendar as pressure) · Stardew (day cycle+schedules) · EVE (absolute clock that never dilates — already found in #14) · Kenshi (real-time flow) |
| 19 | Ranged & projectile | **CS / tactical shooters** (spread/recoil bloom — the accuracy-cone ref) · Receiver (realistic gun mechanics) · Enter the Gungeon (patterns) · Sekiro (bullet deflect) · Sea of Thieves (cannons) — mostly designed already |

## 4. Worked example — the #14 pass (proof the method pays)

`SEAMLESS_WORLD.md` ran exactly this loop: ~6 fan-out agents (Minecraft chunk tickets · Valheim ZDOs ·
Factorio determinism · X4/EVE/Elite/DF/Kenshi background sim · RimWorld world-pawns · noise fields) plus a
`/deep-research` verification pass on the DES and float-determinism angles. Outcomes that only research
produced:

- **It killed two of the doc's own first-draft designs** — the "ledger row type" (RimWorld: dehydrate =
  `delete` map-coupled components, more canon-native) and "autoresolve as separate math" (HOMM3/RimWorld: run
  the real engine headless; chase monotonicity, not agreement).
- **It corrected canon** — "Kenshi-tier world sim" (Kenshi *freezes* the distant world; it has no ledger).
- **It named the invented mechanisms** — the scheduled-event queue is the DES "Event Scheduling world view";
  hydrate-on-approach is "alibi generation" (AIIDE 2010); evaluate-don't-tick is the DES efficiency theorem;
  tier hysteresis is QSS's Zeno guard — each with a published correctness condition to honor.
- **It changed a verdict** — cross-machine determinism went from "unproven" to "compile the sim to wasm (FP
  arithmetic is bit-exact there) or pin the trig," a concrete path.
- **It found the traps** — Factorio's FFF-415 (streaming broke replay, hidden 7 years) · Valheim's one-ZDO-
  per-part scaling wall · RimWorld's GC leak from logs-as-roots (which lands on our `grudge` component).

Every one of those is a thing you could not get from thinking harder — only from reading what shipped.
