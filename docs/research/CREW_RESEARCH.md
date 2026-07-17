# Crew & shipboard life — external evidence review (2026-07)

> Research pass feeding backlog **#1** (crew & shipboard life — "the next SAILING-grade pass"). Method:
> `/deep-research` (single rich brief). The run was STOPPED at the developer's call at 85/~104 agents —
> claims salvaged per the salvage protocol. Confidence: **[SOURCED]** throughout (primary-sourced by fetch
> agents; the 3-vote gauntlet was cut mid-run — ~35 claims carried ≥1 surviving skeptic vote, NONE were
> refuted). FTL's GDC postmortem items trace to the abstract only (video paywalled) — treat those two as
> weak. Synthesis by Session A.

## Headline: the two shapes worth copying exist in shipped code

**Barotrauma is the architecture goldmine** (closest analogue: 2D grid vessel + crew + hazards +
multiplayer — and its SOURCE IS READABLE: official FakeFishGames GitHub, source-available EULA, live
product, 4.7k commits):
- **Jobs are pure data rows** ('Jobs' content type): crew-count constraints (Min/Max/InitialCount), the
  bot's IDLE BEHAVIOR and its autonomous/appropriate OBJECTIVES, skills, and the full starting loadout all
  live ON the job def. NPCs and player-selectable roles share ONE system (HiddenJob flag) — **the Moat,
  shipped**. Runtime Job = a thin instance (prefab id + skill dict + variant); tasking lives in separate
  Order/AIObjective systems; persistence saves the id + skill deltas and re-derives the rest — exactly our
  definition-vs-instance + id-at-rest shape. Job-gen RNG threads an explicit synced/unsynced channel
  parameter — our seeded-streams discipline, independently converged.
- **Orders are data rows too** (Requires tools · applicable Jobs · governing Skill · linked crew-report),
  with THREE load-bearing semantics: (1) **priorities are inverted from intuition** — continuous station
  work (steer, operate reactor) sits LOW; emergencies (fires, leaks, intruders) sit HIGH, so crises
  preempt stations automatically; (2) **orders are STANDING assignments** — issue "fight intruders" with
  no intruders and the crewman latches, acting when the condition comes true (the watch-rotation shape for
  free); (3) **orders MODULATE autonomy, never script it** — bots act on initiative, orders bias them.
- **Order targeting is physically anchored**: the order key on an installation filters to that
  installation's verbs, and bots must physically fetch required tools — our pillar-3 world-embodied verdict,
  at sea.
- **Fire is NOT per-cell**: a continuous rectangle per hull(room) that grows/shrinks horizontally; spreads
  room-to-room by a periodic probabilistic check (every 5s, base 0.15); oxygen-coupled and self-limiting
  (shrinks under 10% O2, drinks 50 O2/s — SEALING a room is legal counterplay); water level douses it
  natively; server-authoritative in multiplayer.

**FTL is the minimal-viable proof** (huge feel from tiny numbers):
- Six skills × three levels, XP from DISCRETE station events, manning bonuses = small flat % — the whole
  crew-competence model is one data table.
- Hazard topology: fire per-TILE spreading tile-to-tile; oxygen per-ROOM equalizing across the DOOR GRAPH
  (rooms = nodes, doors = edges); everything flat per-second scalar rates, NO fluid sim. Fire × O2
  cross-coupling makes VENTING a first-class firefighting verb. Crew AI flees at 10% O2, takes damage at
  5% — hysteresis baked into thresholds.
- **The autonomy principle** (community-analysis sourced): FTL's one-order model (player only picks a
  crewman's destination room; everything in-room is automatic) works because **the built-in priority
  hierarchy matches what a micromanaging player would have ordered anyway**. That sentence is the design
  test for our crew AI.

## The curse list (what shipped games got WRONG — traps we dodge for free)

- **Un-parameterized orders** (Barotrauma): medic bots overmedicate because orders carry no thresholds;
  no "craft X until N" existed for years (community modded it); combat orders had no rules-of-engagement.
  → Our order rows carry PARAMETERS as data from day one.
- **Un-delegable logistics** (Barotrauma): players report 25–50% of playtime on inventory sorting because
  bot item-logistics can't be directed. → Either hauling is a real crew job, or crew inventory doesn't ship.
- **Last-hit XP attribution** (FTL): only the finisher of a repair gets the XP; firefighting/breach-sealing
  award ZERO — perverse incentives on exactly the heroic work. → Reject: award contribution.
- **Manual skill-gating** (Space Haven): unskilled crew take medical jobs and kill patients unless the
  player polices assignments by hand. → Our job defs gate eligibility by skill (the INT-ladder as data),
  never by player vigilance.
- **No priority-NOW verb** (Space Haven): the community's urgent-repair workaround is toggling a task off
  and on. → Command scopes need an "immediately" channel.
- **Crew-wipe attribution confound** (Guns of Icarus, dev postmortem): when a coordination-gated crew
  fails, you can't tell poor coordination from over-tuned difficulty. → The AI gym must measure crew
  scenarios with this confound named.

## Other confirmed precedents

- **Puzzle Pirates** shipped our exact damage-control chain: guns → bilge water rises → ship slows →
  bilging removes water / carpentry stops inflow — breach→flood→bail→patch with two distinct stations. Its
  **command asymmetry** (many station-producers feed ONE token-spending commander) and **navigation as
  force-multiplier + route knowledge** are both knowledge-economy precedents.
- **Sea of Thieves**: cooperation via content incentives, not mechanics; a shared AI threat halved PvP
  (telemetry); and the TOP launch complaint was EMPTY AT-SEA DOWNTIME — Rare rebuilt the roadmap a week in.
  Voyage pacing lives or dies on events layered over the loop (→ the events pass).
- **RimWorld Vehicles mods**: a full map CAN ride a vehicle and the job system mostly carries over — but
  the retrofit "patches the game extensively" with real perf cost (we're native — our frames decision
  validated again), and **enemy AI onto moving grids is the hard unsolved part even there** (raiders are
  disabled from map-vehicles) — independently confirms our PATHFINDING Layer-0 deferral was honest.
- **Sunless Sea/Skies (voyage upkeep + morale)**: design goal is "ANECDOTE GENERATION"; hard fail states
  became survivable cascades (out of fuel → burn cargo); terror reworked from an exploitable budget to a
  hard 0–100 + a Nightmares-cap escalation; death softened via numeric Legacy inheritance; and **travel
  tedium was their top complaint** (fixed post-launch with speed gear + transit infrastructure). Backlog #2's
  morale-moves-on-events lean is exactly their landing spot.

## Verdicts for openpiece

| Pattern | Verdict |
|---|---|
| Job def = data row carrying AI objectives + skills + loadout + crew-count constraints | **ADOPT** (Barotrauma-shaped; extends our AIProfileDef pattern) |
| One job system for NPCs and possessed players | **ADOPT** (the Moat — shipped precedent) |
| Orders = data rows; standing semantics; emergencies outrank stations; modulate-don't-script | **ADOPT** |
| Physically-anchored order targeting (station = the menu) | **ADOPT** (pillar-3 consistency) |
| Hazards: fire per-CELL on the deck grid (FTL) + water as per-hull LEVEL (Barotrauma/our pipeline); flat scalar rates; cross-coupled counters (seal/vent/flood as verbs) | **ADOPT/ADAPT** — no fluid sim, ever |
| Skill XP from discrete station events | **ADAPT** (contribution-credited, never last-hit; emergency work must earn) |
| Watch shifts/schedules | **DEFER** to 5+ crew (evidence threshold); design the def hook now, #18 supplies the clock |
| Crew count for fun | **2–6** (every analogue converges; shifts only matter ≥5) |
| Fluid/atmosphere simulation | **REJECT** (nobody ships one; rates + graphs read better) |
| Soft-fallback on missing job defs | **REJECT** (we fail loud at boot — determinism > live-service resilience) |

## Deep-read list
1. **Barotrauma source** (github.com/FakeFishGames/Barotrauma) — Jobs/Orders content types, AIObjective
   system, FireSource.cs. The single highest-value read before the #1 design pass.
2. FTL wiki mechanics pages (fire/oxygen/skills — numbers transcribed above).
3. Failbetter's terror/Reach redesign posts — voyage-pressure tuning with reasons.
4. Puzzle Pirates duty-station docs — the damage-control chain + command asymmetry.
5. Vehicle Map Framework (RimWorld) — jobs-on-a-moving-map integration notes.
