# 18 — Everything Else: the remaining subsystems, surveyed

> rimworld-simple atlas · [mention] · code paths relative to `..\rimworld-decomp\`
> Breadth over depth — 8 areas, each: the idea, the pattern, where to read.

## 1. UI & player tools

A stack of `Window` objects (`Find.WindowStack`) drawn back-to-front. Selected things emit **Gizmo** objects —
the button row is the command pattern (`Command_Action` = icon + delegate), so buttons are data from the
selected thing, not hard-coded UI. `Alert` (132 subclasses) is a polled-condition pattern, recalculated
round-robin across frames (`i += 24`) so 132 checks never spike one frame. The gem is **`Designator`**: player
paint-tools don't *do* anything — they write `Designation` markers onto the map, and WorkGivers (chapter 10)
later scan those markers and dispatch pawns. Player intent becomes map data the AI independently consumes —
the exact decoupling openpiece's strategic-command layer will need.
→ `Verse\WindowStack.cs`, `Verse\Gizmo.cs`, `RimWorld\AlertsReadout.cs`, `Verse\Designator.cs`

## 2. Trading & economy

A `TradeDeal` holds `Tradeable` line items; trader inventories are rolled by `StockGenerator` lists on
`TraderKindDef` (procedural stock, not authored inventories). Prices derive from the `MarketValue` *stat* —
so the economy rides the chapter-04 pipeline — adjusted by relations, negotiator skill, and buy/sell spread.
→ `RimWorld\TradeDeal.cs`, `Tradeable.cs`, `TraderKindDef.cs`, `TradeUtility.cs`

## 3. Research

A prerequisite DAG of `ResearchProjectDef`s. Completion doesn't special-case anything: attached `ResearchMod`
objects run generic def-reference surgery (unlock recipes/buildings), and `ReapplyAllMods` re-runs all finished
projects idempotently — unlocking as data mutation, not code.
→ `Verse\ResearchProjectDef.cs`, `RimWorld\ResearchManager.cs`

## 4. Text generation

Names, battle-log sentences, and art descriptions come from a context-free grammar: `GrammarResolver` expands
a root symbol by weighted `Rule` selection until no non-terminals remain. Grammars compose from shared
fragments via `RulePackDef.include`; selection weight decays with reuse to avoid repetition; callers inject
typed data (this pawn, that weapon) as constants. Cheap procedural flavor with full data control.
→ `Verse\Grammar\GrammarResolver.cs`, `Verse\RulePackDef.cs`

## 5. Modding & patches

Mods mutate the merged def XML before parsing via `PatchOperation` subclasses (XPath add/replace/remove — 18
ops), and attach typed data to any def via `DefModExtension` without subclassing. Notably: the base game uses
**no Harmony** — runtime C# patching is purely a community technique layered on top of these official seams.
→ `Verse\PatchOperation.cs`, `Verse\DefModExtension.cs`, `Verse\ModContentPack.cs`

## 6. Presentation FX

One-shot particles are **Flecks**: `struct`-based (`IFleck` in plain `List<T>` arrays, real-time vs game-time
split, parallelized drawing) — a deliberate GC-free rewrite of the old class-based Motes; the perf argument
for openpiece's pooled FX, made in C#. Composite effects are `Effecter`s: a bag of `SubEffecter` children
(sparks + sound + glow = one def). Audio mirrors it: `SoundDef` + `Sustainer` for looping parameterized sound.
→ `Verse\FleckSystemBase.cs`, `Verse\Effecter.cs`, `Verse\Sound\Sustainer.cs`

## 7. Debug tooling

Debug menus are attribute-scanned: any method tagged `[DebugAction]` (category, allowed game states, DLC
flags) is reflectively discovered into the dev palette — zero registration. `DebugViewSettings` is a flat bag
of static overlay bools that render code reads directly. Openpiece's `core/Debug.ts` + debug panel follow the
same registration-free spirit.
→ `LudeonTK\DebugActionAttribute.cs`, `LudeonTK\DebugTabMenu_Actions.cs`, `Verse\DebugViewSettings.cs`

## 8. Pathfinding

The map partitions into **regions** (connected passable chunks) grouped into districts/rooms. Reachability is
a region-level flood fill (not cell-level), memoized in `ReachabilityCache`; pathfinding is cell-level A* but
with a **region-lookahead heuristic** (`RegionCostCalculator` precomputes region-to-region costs), which
shrinks the searched cell set dramatically. Hierarchy first, cells second — the standard answer when
openpiece's islands outgrow plain grid A*.
→ `Verse\Reachability.cs`, `Verse\PathFinder.cs`, `Verse\AI\RegionCostCalculator.cs`

---

**Not covered anywhere deeper on purpose** (game-content mechanics, not architecture): royalty titles/psycasts
as content, specific animal training rules, temperature/weather math, growing/food chains, drugs/addiction
specifics, prisoner recruitment tuning, transport pods/gravship logistics, and the Anomaly monster roster.
Each is *content on the systems this atlas already covers* — defs + comps + hediffs + incidents. If you need
one, grep the decomp for its def name and follow the worker classes.
