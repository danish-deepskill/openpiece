# 10 — Work & Bills: the WorkGiver scan pattern

> rimworld-simple atlas · [summary] · code paths relative to `..\rimworld-decomp\`
> Most relevant RimWorld system for OSRS-style activity skills (fishing/mining/cooking/crafting).

## The idea in 3 sentences

Every idle colonist asks "what's the most valuable thing I could do right now?" and the engine answers by
walking an ordered list of **WorkGivers**: each cheaply lists candidate targets from a spatial index, confirms
per-target with `HasJobOnThing`, and the first workable target (nearest-first) becomes a `Job`. The order is
pure data: `WorkTypeDef`s sorted by pawn priority (1–4) × `naturalPriority`, flattened into `WorkGiverDef`s.
Crafting is the same pattern specialized: a workbench holds a `BillStack` of `Bill`s (each wrapping a
`RecipeDef`), and `WorkGiver_DoBill` finds a doable bill, gathers ingredients, and emits a recipe job.

## Key classes

| Class | Role |
|---|---|
| `WorkTypeDef` / `WorkGiverDef` | category (Cooking) / one giver's config + `giverClass` + `priorityInType` |
| `WorkGiver_Scanner` | the scan contract: `PotentialWorkThingsGlobal`, `ShouldSkip`, `HasJobOnThing`, `JobOnThing` |
| `JobGiver_Work` | the ThinkTree leaf looping givers by priority |
| `Pawn_WorkSettings` | per-pawn priority table; caches the flattened ordered giver list |
| `RecipeDef` / `Bill(_Production)` / `BillStack` | ingredients filter + work + products / a queued order / the bench's queue |
| `WorkGiver_DoBill` + `Toils_Recipe` | find bill → gather ingredients → `DoRecipeWork` tick loop → products |

## Data flow

Priority table → flattened giver list (user priority dominates: `naturalPriority + (4−userPriority)×100000`)
→ per giver: cheap `ShouldSkip` rejects wholesale → candidates from a `ThingRequest` group lister →
`ClosestThingReachable` visits nearest-first (region BFS) with `!forbidden && HasJobOnThing` as validator →
first hit wins → `JobOnThing` builds the Job → driver toils run it. Bills add: `AnyShouldDoNow` gate → skill
requirement check → nearest-ingredient gather within a radius → `DoBill` job whose toils carry ingredients,
tick `workLeft` down by work-speed stat (granting XP), and place products per store mode.

## Why this matters beyond colony sims

"Find the nearest fishing spot / ore vein / cooking range this actor can use right now" is exactly:
resource-node lister + per-node eligibility (skill, reach, unreserved) + emit action. Each new gatherable is a
def, not new plumbing. The general shape — **cheap candidate index → early skip → per-candidate confirm,
nearest-first, stop at first hit** — is the scalable answer to any "find something productive to do" query.

## Patterns used

Chain of responsibility (ordered givers, first job wins) · def+worker strategy (stateless shared `Worker`
singletons — no per-pawn fields allowed) · two-phase fast-reject-then-confirm query · incrementally-maintained
spatial indexes (`ListerHaulables`, event-driven with a slow self-healing sweep).

## Gotchas & clever bits

- `HasJobOnThing` and `JobOnThing` must agree — the engine logs when the predicate says yes but the builder
  returns null (a named, detected bug class).
- Failed ingredient searches back off 500–600 ticks per bill — no per-tick re-scanning for missing materials.
- Scanning never reserves; reservation happens in the job — the validator checks `CanReserve` to avoid two
  pawns racing to one target.
- The flattened giver list is cached and rebuilt only on a dirty flag; stale-priority bugs happen when the
  flag is missed.

## Go deeper

- `RimWorld\JobGiver_Work.cs` :82–264 — the full loop with the `priorityInType` short-circuit.
- `RimWorld\WorkGiver_DoBill.cs` — `TryFindBestBillIngredients`: region-BFS gathering.
- `RimWorld\Pawn_WorkSettings.cs` — `CacheWorkGiversInOrder`: the weighting math.
- `Verse\AI\Toils_Recipe.cs` — `DoRecipeWork`: the work/XP tick loop.
- `RimWorld\ListerHaulables.cs` — the incrementally-maintained candidate index.
