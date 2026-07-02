# 05 — Health & Effects: the Hediff engine

> rimworld-simple atlas · [deep] · code paths relative to `..\rimworld-decomp\`
> Ballpiece mapping: `docs/references/rimworld_patterns.md` §3 → `combat/Effect.ts` + `EffectSystem`

## The idea in 3 sentences

Everything that can be "on" a pawn — wound, disease, drug high, bionic arm, buff — is one abstraction: a
**Hediff** (health-diff) instance attached to the pawn's `HediffSet`, usually on a specific body part. The
def+instance split is strict: the instance holds only `def`, `severity`, `ageTicks`, `part`; all behavior comes
from **severity-threshold stages** (data blocks of stat/capacity modifiers that swap wholesale) and **comps**
(pluggable behaviors like timed expiry or severity ramp, declared as data). One number — severity — drives the
whole lifecycle, including removal (`severity <= 0`) and death (`lethalSeverity`).

## Key classes

| Class | Path | Role |
|---|---|---|
| `Hediff` / `HediffDef` | `Verse\Hediff.cs`, `HediffDef.cs` | instance (severity, age, part) / shared data (stages, comps, class) |
| `HediffSet` | `Verse\HediffSet.cs` | the pawn's effect list + cached aggregates (pain, bleed, capacities) |
| `Pawn_HealthTracker` | `Verse\Pawn_HealthTracker.cs` | add/remove/tick orchestration, downed/dead checks |
| `HediffStage` | `Verse\HediffStage.cs` | one severity band: statOffsets/statFactors/capMods/pain/deathMtb… |
| `HediffWithComps` + `HediffComp` | `Verse\HediffWithComps.cs`, `HediffComp.cs` | the comp-bearing subclass + hook surface |
| `HediffComp_Disappears` / `_SeverityPerDay` / `_Immunizable` | `Verse\` | timed expiry / severity ramp / immunity-driven ramp |

## Data flow

1. **Attach:** `AddHediff` → `HediffMaker.MakeHediff` → `HediffSet.AddDirect`, which first tries
   `TryMergeWith` (same def+part → sum severity — stacking as a *def-declared* rule, not call-site logic),
   else appends and fires `PostAdd`.
2. **Tick:** the tracker copies the list and ticks each hediff; comps sum severity changes through one `ref
   severityAdjustment` accumulator per tick (the "severity bus").
3. **Stage resolution:** `CurStageIndex = def.StageAtSeverity(severity)` — crossing a threshold silently swaps
   the entire modifier block and dirties the set's caches. An effect that worsens is data, not code.
4. **Consume:** stat queries read the current stage's `statOffsets`/`statFactors` (chapter 04); capacities
   aggregate `capMods`; pain/bleed aggregate scalar fields.
5. **Remove:** `ShouldRemove => Severity <= 0` (comps can OR-in their own vote) → one sweep point, no
   scattered lifetime checks. Death: `lethalSeverity`, or a required capacity hitting zero (chapter 06).

**Abilities piggyback the same shape** (see chapter 07): hediffs can grant abilities and verbs, and ability
effects commonly *apply hediffs* — the two systems close the loop through data.

## Patterns used

- **Def + instance + comps** — the codebase's most-repeated triple (things ch.02, thoughts ch.09, genes ch.17).
- **Severity stages** — piecewise-by-threshold behavior as data; identical staging reused by `ThoughtDef`.
- **Accumulator bus** — comps contribute deltas, the engine applies once; avoids comp-order fights.
- **Merge rules as data** — reapply behavior (sum/refresh/stack) decided per-def in `TryMergeWith`.

## Gotchas & clever bits

- Comp props subclasses set `compClass` in their constructor — XML names only the Props type, one node binds
  data-type to behavior-type.
- `HediffSet` caches aggregates (pain, bleed, capacities) and dirties on any add/remove/stage-change — the
  aggregate-cache-with-dirty-flag idiom in miniature.
- Severity's setter is where stage-change detection lives — one choke point for "did anything change".
- `HediffDef.ConfigErrors` enforces structural sanity (comps require `HediffWithComps`, stages ordered by
  `minSeverity`) — validation at boot, not crashes mid-game.

## Go deeper

- `Verse\Hediff.cs` :239 severity setter (stage-change choke point), :654 `TryMergeWith`.
- `Verse\HediffWithComps.cs` :209–223 the severity bus, :394 `InitializeComps`.
- `Verse\Pawn_HealthTracker.cs` :1022 `HealthTick` — tick + remove sweep.
- `Verse\HediffComp_Disappears.cs` (simplest comp), `HediffComp_Immunizable.cs` (a ramp with an input).
- `Verse\HediffStage.cs` — read the field list; it's the whole vocabulary of what an effect can touch.
