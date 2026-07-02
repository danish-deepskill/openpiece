# 13 — Storyteller & Events: the event director

> rimworld-simple atlas · [deep] · code paths relative to `..\rimworld-decomp\`
> Ballpiece mapping: `docs/references/rimworld_patterns.md` §6 → `systems/GameDirector.ts` (the blueprint to take whole)

## The idea in 3 sentences

There are no scripted event timelines — a tick loop periodically asks pluggable "comps" whether any event
should fire, and each candidate event is a self-contained def+worker pair discovered by category scan. The
design is three strictly-separated layers: **StorytellerDef** (a personality: which comps, category weights,
pacing curves — Cassandra vs Randy differ only in XML), **StorytellerComp** (cadence: when and how often to
propose), and **IncidentDef+IncidentWorker** (one event: eligibility gates + execution). A single **threat
points** formula converts colony wealth + population + time + recent performance into a budget that sizes
whatever fires.

## Key classes

| Class | Path | Role |
|---|---|---|
| `Storyteller` | `RimWorld\Storyteller.cs` | the tick loop; thinks once per 1000 ticks |
| `StorytellerDef` / `StorytellerComp(Properties)` | `RimWorld\` | personality data / cadence strategies (`_RandomMain`, `_OnOffCycle`…) |
| `IncidentDef` / `IncidentWorker` | `RimWorld\` | event data (category, baseChance, refire, gates) / `CanFireNow` + `TryExecute` |
| `IncidentParms` | `RimWorld\IncidentParms.cs` | the generic parameter bag every event family shares |
| `StorytellerUtility` | `RimWorld\StorytellerUtility.cs` | `DefaultThreatPointsNow`: the matchmaking formula |
| `FiringIncident` | `RimWorld\FiringIncident.cs` | one proposal: def + parms + source comp |

## Data flow

Every 1000 ticks: for each comp (skipped before its `minDaysPassed`), filter incident targets (maps, caravans,
world) by tag → `MakeIntervalIncidents` proposes. `RandomMain` rolls mean-time-between, picks a weighted
category (forcing `ThreatBig` if overdue), then a weighted incident among those whose `Worker.CanFireNow`
passes — weight = base chance × population factors × recent-selection decay. Each `FiringIncident` then runs
`TryFire = CanFireNow(parms) && TryExecute(parms)`, and the story-state records last-fired ticks for refire
cooldowns.

**CanFireNow** (pure eligibility, results cached per tick): target allowed, earliest day, min/max points,
biome/layer lists, scenario disables, population floor, `minRefireDays` (also across shared refire tags),
active-condition conflicts — plus per-worker `CanFireNowSub`. **TryExecute** actually spawns the raid /
trader / weather and sends the letter. The split makes eligibility independently testable and lets the
director probe without committing.

**Threat points** (`DefaultThreatPointsNow`): wealth → points via a capped curve, plus per-pawn contributions
(colonists by wealth-scaled curve; animals/mechs by `combatPower`), × random factor × adaptation (recent
losses ease off) × difficulty × days-passed factor, clamped [min, 10000]. One number sizes a raid, a mech
cluster, or a manhunter pack — the "matchmaking formula" in one function.

## Why it scales

Adding an event touches zero director code: one `IncidentDef` row (+ a worker subclass if genuinely new
behavior) is discovered by the category scan. Storyteller personalities just re-weight categories. The
director speaks only categories, weights, points, and the CanFire/Execute contract. For ballpiece: EventDef
registry + worker map + `PowerTier`-based points formula + per-def `lastFiredTick` refire map = this
architecture, with player tier standing where colony wealth stands.

## Patterns used

Three-layer separation (personality / cadence / event) · def+worker at two levels (storyteller comps AND
incidents) · weighted-random with decay (anti-repetition) · eligibility/execution split · generic parameter
bag (each worker reads only the fields it cares about).

## Gotchas & clever bits

- The director thinks every 1000 ticks, not every tick — event direction is inherently Rare-tick work.
- Refire cooldowns can be *shared across defs* via refire-check tags (all "raid-like" events share a
  cooldown) — the difference between a living world and raid spam.
- Adaptation (`watcherAdaptation`) eases difficulty after losses — pacing as feedback control, tunable per
  storyteller def.
- Quests enter the same pipeline (`IncidentWorker_GiveQuest` — chapter 14); the incident layer is the one
  gate through which *everything* dynamic arrives.

## Go deeper

- `RimWorld\Storyteller.cs` :213 `StorytellerTick`, :237/:271 `MakeIncidentsForInterval` — the loop.
- `RimWorld\StorytellerComp.cs` :96 `TrySelectRandomIncident`, :115 `IncidentChanceFinal` — selection math.
- `RimWorld\StorytellerComp_RandomMain.cs` vs `_OnOffCycle.cs` — two cadence strategies to compare.
- `RimWorld\IncidentWorker.cs` :35 `CanFireNow`, :156 `FiredTooRecently`, :183 `TryExecute`.
- `RimWorld\StorytellerUtility.cs` :131 `DefaultThreatPointsNow` — read the formula end to end.
- XML: `..\rimworld-data\Core\Defs\Storyteller\Storytellers.xml` — Cassandra vs Randy as data diffs.
