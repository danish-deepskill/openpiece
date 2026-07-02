# 14 — Quests: generation-time graph, runtime listeners

> rimworld-simple atlas · [summary] · code paths relative to `..\rimworld-decomp\`
> The single biggest subsystem (~545 classes) — this chapter captures its *shape*.

## The idea in 3 sentences

A quest is authored as a **QuestScriptDef**: an XML tree of **QuestNode** objects plus selection metadata
(weight, points, refire days). At generation time the node tree is interpreted *once* against a **Slate**
(a variable bag) to bake out a concrete **Quest** instance — picking sites, rolling rewards, spawning pawns —
and to instantiate the **QuestPart** objects that carry runtime behavior. Nodes and parts are two separate
hierarchies: nodes are *builders that run and disappear*; parts are *persistent listeners that react to
string Signals* for the life of the save.

## Key classes

| Class | Role |
|---|---|
| `QuestScriptDef` | root def: `QuestNode root` + selection weights/points/expiry |
| `QuestGen` (static) + `Slate` | the generation engine + the blackboard (prefix-scoped vars, deep-copy for dry runs) |
| `QuestNode` (~301 subclasses) | one generation step: `RunInt()` builds, `TestRunInt()` dry-runs for `CanRun` |
| `Quest` + `QuestPart` (~200) / `QuestPartActivable` | runtime instance + listeners; Activable adds enable/complete lifecycle |
| `Signal` / `SignalManager` / `ISignalReceiver` | string-keyed event bus wiring world events to parts |
| `QuestManager` / `NaturalRandomQuestChooser` | live registry + storyteller-side selection by weighted points |

## Data flow

Storyteller incident → choose a `QuestScriptDef` by weighted points/recency/refire → `QuestGen.Generate` seeds
the Slate (points, initiate-signal) and walks the node tree; each node reads late-bound `SlateRef` values,
mutates the shared quest, and typically `AddPart(...)`, chaining parts by matching one part's out-signal
string to the next's in-signal. The finished Quest registers as a signal receiver. On accept, the Initiate
signal fires; gameplay raises signals (shuttle landed, pawn died, timer done); parts react and emit their own
out-signals; terminal parts call `quest.End(outcome)` → per-part `Cleanup` → letter.

## The Signal pattern — power and cost

Signals are pub/sub with **string tags** namespaced per quest (`Quest42.Delay.Completed`). Power: total
decoupling — a shuttle, a raid, and a reward drop compose purely by tag matching; quest logic never references
world code. Cost: **stringly-typed** — no compile-time check that a producer's tag has a consumer, typos fail
silently, and tracing "what triggers this" means grepping strings. Ballpiece's typed `EventBus` is the same
architecture with the type-safety RimWorld gave up (their scale of dynamic content made static typing
impractical; at ballpiece's scale it isn't).

## Patterns used

Interpreter over a node AST · blackboard/memento (Slate, with scoped shadowing and dry-run copies) · observer
event bus · state machine per part (`QuestPartActivable`) · command (each part is a serializable reified
reaction).

## Gotchas & why 545 classes

The count is two parallel one-class-per-primitive hierarchies (~301 nodes for authoring, ~200 parts for
runtime) — a deliberate trade of class count for XML composability: every quest is data assembled from tiny
reusable pieces. Sharp edges: every node must implement *both* `RunInt` and an accurate `TestRunInt` (a wrong
dry-run silently disables the quest); signal wiring is easy to mis-thread; every part must survive
save/load round-trips and re-register as a receiver.

## Go deeper

- `RimWorld\QuestGen\QuestGen.cs` `Generate` — the build lifecycle (note the static mutable state + cleanup).
- `RimWorld\QuestGen\Slate.cs` + `SlateRef.cs` — the blackboard and late-bound authoring values.
- `RimWorld\QuestPartActivable.cs` — the enable/complete state machine most parts inherit.
- `RimWorld\Quest.cs` `Notify_SignalReceived` + `RimWorld\SignalManager.cs` — dispatch + listen-mode filtering.
- `RimWorld\NaturalRandomQuestChooser.cs` — selection weighting (mirrors incident selection, chapter 13).
