# 09 — Needs, Moods, Thoughts, Social

> rimworld-simple atlas · [summary] · code paths relative to `..\rimworld-decomp\`

## The idea in 3 sentences

A pawn's inner state is a stack of **needs** (float bars decaying over time) plus a mood need that is nothing
but the live aggregation of **thoughts** — transient reactions to the world. Thoughts arrive two ways fused
into one number: *memories* pushed by events (with expiry clocks) and *situational* thoughts polled from world
state by 238 `ThoughtWorker` classes. Aggregated mood vs per-pawn **mental-break thresholds** decides when the
AI abandons jobs for a mental state; the same thought machinery doubles as social opinion between pawns.

## Key classes

| Class | Role |
|---|---|
| `Need` / `NeedDef` / `Pawn_NeedsTracker` | bar + fall-rate data + the list, ticked every 150 ticks |
| `Need_Mood` | mood bar = `thoughts.TotalMoodOffset()` chased smoothly |
| `ThoughtHandler` + `MemoryThoughtHandler` + `SituationalThoughtHandler` | aggregation + the push and poll stores |
| `ThoughtDef` (stages!) / `ThoughtWorker` | data + the polled-condition strategy |
| `MentalBreaker` / `MentalStateDef` | threshold clocks → weighted break selection → tree hijack |
| `Pawn_InteractionsTracker` / `InteractionWorker` | social rolls (chitchat/insult) depositing opinion thoughts |

## Data flow

Events push memories (`TryGainMemory` — merges into a stack, renews age, respects `stackLimit`); workers poll
situations on a 100-tick cache clock. `TotalMoodOffset` groups same-def thoughts, averages, and applies a
**diminishing stack multiplier** (the 5th "ate raw food" counts far less than the 1st). Mood below a threshold
for >2000 ticks → MTB roll → weighted `MentalBreakDef` pick, blamed on a "final straw" thought → the mental
state hijacks the think tree. Needs wire into behavior *through the tree*, not direct calls:
`ThinkNode_ConditionalNeedPercentageAbove` gates a subtree; when hunger drops the gate fails and control falls
through to `JobGiver_GetFood`. The need bar is the utility input; the ThinkNode is the wire.

## Patterns used

- **Push vs poll split** — same `Thought` base, opposite lifecycles; situationals are *never serialized*
  (re-derived on load — they must be pure functions of world state).
- **Stages reused** — `ThoughtDef.stages` mirrors `HediffDef.stages` exactly (chapter 05's staging idiom).
- **Worker classes** — `ThoughtWorker`/`InteractionWorker`/`MentalBreakWorker`: def+worker yet again.
- **Break thresholds are stats** — traits/genes shift `MentalBreakThreshold`, so identical mood breaks one
  pawn and not another; personality via the stat pipeline, not special cases.

## Gotchas & clever bits

- Grouping happens *before* the diminishing multiplier — identical thoughts pool first.
- `IsFrozen` halts decay for suspended/off-map pawns.
- A situational thought ending can spawn a memory (`producesMemoryThought`) — situation → lingering grudge.
- Non-player pawns only break at Extreme intensity — enemy camps stay functional without special-case AI.

## Go deeper

- `RimWorld\ThoughtHandler.cs` — `TotalMoodOffset` / `MoodOffsetOfGroup`: the aggregation math.
- `RimWorld\MentalBreaker.cs` — threshold clocks and weighted selection.
- `RimWorld\ThoughtWorker_NeedFood.cs` (tiny) — a representative polled worker.
- `RimWorld\Pawn_InteractionsTracker.cs` :190–345 — social MTB rolls and opinion deposits.
- `RimWorld\Need_Seeker.cs` vs `Need.cs` — chase-the-instant-level vs linear-fall bars.
