# 08 — AI: ThinkTrees, Jobs, and the squad layer

> rimworld-simple atlas · [deep] · code paths relative to `..\rimworld-decomp\`
> Ballpiece mapping: `docs/references/rimworld_patterns.md` §4 → `ai/Brain.ts` + `SquadSystem`

## The idea in 3 sentences

Pawn AI is split into **decide** and **execute**: a data-declared behavior tree (ThinkTree) *decides* by
emitting a `Job` (pure data: def + up to 3 targets + flags), and a `JobDriver` *executes* it as a list of
resumable steps (Toils). Squad AI is a second level that never overrides the first — a `Lord` assigns each
member a `Duty`, and a high-priority node in the *personal* tree dispatches on it. There is no player-faction
fork anywhere: colonists, raiders, and animals run identical machinery with different tree defs — "the player
is not special", shipped at scale.

## Key classes

| Class | Path | Role |
|---|---|---|
| `ThinkTreeDef` / `ThinkNode` | `Verse\ThinkTreeDef.cs`, `Verse\AI\ThinkNode.cs` | the tree def (XML graph) / abstract node with `TryIssueJobPackage` |
| `ThinkNode_Priority` / `_PrioritySorter` / `_Conditional*` / `_Subtree` | `Verse\AI\` | first-match / utility-sorted / gates / splice-in-reuse |
| `ThinkNode_JobGiver` → `JobGiver_*` (242) | `Verse\AI\` | the leaf: `TryGiveJob(pawn)` → a Job |
| `Job` / `JobDef` | `Verse\AI\Job.cs` | pure data: def + targets + flags (expiry, interruptible…) |
| `JobDriver` / `Toil` | `Verse\AI\JobDriver.cs`, `Toil.cs` | executes a job as toils; only a cursor index is saved |
| `Pawn_JobTracker` | `Verse\AI\Pawn_JobTracker.cs` | runs the current driver; decides when to re-think |
| `Lord` / `LordJob` / `LordToil` / `PawnDuty` | `Verse\AI\Group\` | squad state machine assigning duties |
| `ThinkNode_Duty` | `RimWorld\ThinkNode_Duty.cs` | the personal-tree node that dispatches on the current duty |

## Data flow

**Decide:** when the current job ends/expires, `Pawn_JobTracker.DetermineNextJob` walks the pawn's tree (from
`RaceProps.thinkTreeMain`): priority nodes try children in order, conditionals gate subtrees
(`ConditionalColonist`, `ConditionalStarving`…), `PrioritySorter` runs utility competition (work vs joy vs
rest), and the first `JobGiver` leaf to return a Job wins. Subtrees splice shared fragments; a
`SubtreesByTag` node is the mod insertion point.

**Execute:** `StartJob` builds the driver, makes reservations, generates toils. A Toil = one atomic step
(`initAction`, optional `tickAction`, a complete-mode: instant / on-path-arrival / after-delay) with end
conditions; static factories (`Toils_Goto`, `Toils_Combat`, `Toils_Haul`) build reusable ones. `DriverTick`
advances a cursor. **Save-safety for free:** only `curToilIndex` + `ticksLeftThisToil` serialize; the toil
list regenerates from code on load, so a pawn resumes mid-haul after a reload.

**Squads:** a `LordJob` builds a `StateGraph` of `LordToil`s with `Trigger`-driven transitions; each toil's
`UpdateAllDuties` writes a `PawnDuty` into every member's `mindState`. The personal tree's high-priority
`ThinkNode_Duty` node dispatches on the duty def; no duty → the node yields nothing → personal behavior
continues. One brain per pawn, always.

## Re-evaluation cadence (the perf contract)

The tree is **not** walked per tick. Re-think happens on: job end; job **expiry** (combat jobs carry
randomized `expiryInterval`s ~450–550 ticks; wander jobs 30 near enemies); a constant-tree poll every 30
ticks staggered by pawn hash; damage (rate-limited to every 180 ticks). Plus a runaway guard: 10 jobs in 10
ticks aborts the pawn. Intervals stretch with distance from threats.

## Patterns used

- **Composite + Strategy** — the tree is Composite; every node class is a Strategy; the tree *shape* is data.
- **Command** — `Job` as a serializable command object; `JobDriver` as its interpreter.
- **Regenerate-don't-serialize** — toils are code; only the cursor persists.
- **Two-level AI via a data mailbox** — the duty field decouples squad logic from personal logic.

## Gotchas & clever bits

- `JobGiver` leaves are stateless singletons shared across all pawns — per-pawn memory lives in
  `mindState`, never on the node.
- Job expiry is a *randomized range* so a squad doesn't re-think in lockstep on the same tick.
- `ThinkTreeKeyAssigner` stamps stable save keys per node so an in-progress ThinkResult survives load.
- Mental states hijack the tree wholesale (`stopsJobs`) — chapter 09's break system plugs in above everything.

## Go deeper

- XML first: `..\rimworld-data\Core\Defs\ThinkTreeDefs\Humanlike.xml` — read the actual tree; it's legible.
- `Verse\AI\Pawn_JobTracker.cs` — `DetermineNextJob`, `StartJob`, `EndCurrentJob`: the runtime spine.
- `Verse\AI\JobDriver.cs` — `DriverTick` / `TryActuallyStartNextToil` / `ExposeData`: the cursor machine.
- `Verse\AI\ThinkNode_Priority.cs` + `ThinkNode_PrioritySorter.cs` — 40 lines each; the whole evaluation model.
- `Verse\AI\Group\Lord.cs` + `LordToil.cs` — the squad state graph.
- `RimWorld\JobGiver_AIFightEnemy.cs` — a real combat leaf: target acquisition, verb choice, expiry.
