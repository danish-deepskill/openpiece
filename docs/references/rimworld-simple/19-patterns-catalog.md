# 19 — Patterns Catalog: every recurring trick, named once

> rimworld-simple atlas · [deep] · the cross-cutting index. Each pattern: what it is, three places it appears,
> and the one-line openpiece translation. This is the chapter to read if you read only one.

## A. The structural core

### 1. Def / Instance split (Flyweight)
Shared immutable data in a def; per-object mutable state in a thin instance holding a def pointer.
**Seen in:** `ThingDef`/`Thing` · `HediffDef`/`Hediff` · `AbilityDef`/`Ability` · `PreceptDef`/`Precept`.
**Payoffs:** memory (ch.01), saves that serialize by name and survive updates (ch.16), moddability.
**Openpiece:** `Registry` Defs vs ECS components — already canon.

### 2. Def + Worker (Strategy chosen by data)
A def carries a `workerClass` Type; a stateless worker singleton is lazily instantiated to provide the
behavior. Data picks the strategy; XML authors never touch code.
**Seen in:** `StatDef→StatWorker` · `DamageDef→DamageWorker` · `IncidentDef→IncidentWorker` ·
`ThoughtWorker` · `WorkGiver` · `RecipeWorker` · biome/quest/mental-break workers — the single most
repeated pattern (hundreds of classes).
**Rule:** workers are **stateless and shared** — per-entity memory lives on the instance/tracker, never the worker.
**Openpiece:** function-bearing strategy rows (`MOTIONS`, `draws`, brain states) — same idea, functions instead
of classes.

### 3. Props + Comp (composition declared in data)
A def holds a list of `*Properties` objects; each names a comp class; the instance instantiates them and fans
every lifecycle event out to the list.
**Seen in:** `ThingComp` (ch.02) · `HediffComp` (ch.05) · `CompAbilityEffect` (ch.07) · `PreceptComp` ·
`StorytellerComp` (ch.13).
**Openpiece translation:** discriminated-union data + handler map per `kind` — same composability, typed, no
reflection.

### 4. Aggregate root with capability-gated trackers
One entity class, ~50 nullable sub-objects created by capability rules; tick = fan-out in fixed order.
**Seen in:** `Pawn` (ch.03) · `Map`'s ~100 managers · `Game`'s ~30 managers.
**Openpiece:** ECS components fill this role; the lesson is the *gating matrix* (which units get which
components) as one explicit function, not scattered spawn code.

### 5. Stages (piecewise behavior by threshold, as data)
An ordered list of severity/level bands, each a complete block of modifiers; crossing a threshold swaps the
block wholesale.
**Seen in:** `HediffStage` (ch.05) · `ThoughtStage` (ch.09) · life stages (ch.03).
**Openpiece:** the planned EffectDef stages — poison-that-worsens as def rows.

## B. The numeric spine

### 6. Offsets-then-factors stat pipeline + explanation mirror
All additive contributions, then all multiplicative, then parts/curves/clamp — same order always; every
mutation path has a labeled-explanation twin. (ch.04)
**Openpiece:** `flat → addPct → mulPct → override` + the `explain()` recommendation.

### 7. Shared data-list hooks
Small vocabularies (`statOffsets`, `statFactors`, `abilities`, `capMods`) consumed by core pipelines; any new
system that *emits* them integrates with everything downstream for free — how DLC plugs in (ch.17).
**Openpiece:** Modifier + Tag + Ability grants are exactly this vocabulary; guard it.

### 8. Points/budget matchmaking
One formula (wealth + population + time + adaptation) → a budget number → workers spend it to size content
(ch.13). **Openpiece:** PowerTier → event sizing.

## C. Behavior

### 9. Decide/execute split (Command)
A brain emits a `Job` (pure data); a driver executes it as resumable steps with only a cursor serialized
(ch.08). Save-safe, interruptible, inspectable. **Openpiece:** the intent layer recommended before the BT
migration.

### 10. Composite behavior tree in data
Tree shape in XML, node semantics in small worker classes; subtree splicing for reuse; insertion tags for
mods (ch.08).

### 11. Two-level AI via data mailbox
Squad logic writes a `duty` field; a high-priority personal-tree node dispatches on it; no duty → fall
through (ch.08). Never two brains fighting.

### 12. Scan pattern (cheap index → early skip → confirm nearest-first)
`ListerThings` candidate buckets → `ShouldSkip` wholesale rejection → per-candidate `HasJobOnThing`,
nearest-first via region BFS, stop at first hit (ch.10). **Openpiece:** the shape for activity skills and any
"find something to do" query.

## D. Time & determinism

### 13. Fixed timestep, speed = more ticks, hard frame budget
Byte-identical ticks at any speed; overload → slow motion, never spiral (ch.12).

### 14. Hash-bucket staggering
`hash % interval` buckets for Rare/Long ticking and `IsHashIntervalTick` for in-code polls — even load, no
250th-tick spike (ch.12).

### 15. Scoped RNG (push/pop)
Seeded streams + explicit state bracketing for anything that must reproduce independently of global
consumption; per-step seeds hash-combined so pipeline edits don't shift sibling randomness (ch.12, ch.15).

### 16. Dirty-flag memoization
Expensive derived value + explicit invalidation events + rebuild-on-demand: regions, reachability, stat
cache, hediff aggregates, work-giver lists (ch.12 has the census).
**The recurring bug class:** adding a mutation source without adding its invalidation event (ch.17's
`Notify_GenesChanged` lesson).

## E. Events & orchestration

### 17. Eligibility/execution split
`CanFireNow` vs `TryExecute` (ch.13); `HasJobOnThing` vs `JobOnThing` (ch.10); `TestRunInt` vs `RunInt`
(ch.14). Probe cheaply, commit separately, keep both in sync — RimWorld *logs* desyncs as a named bug class.

### 18. Event bus with reasons (and a veto channel)
`HistoryEventDef` pub/sub carrying *why* something happened; subscribers react (precepts, goodwill); a
parallel query channel lets beliefs veto actions before they happen (ch.17).
**Openpiece:** typed EventBus — consider the veto/query variant for faction/honor rules.

### 19. String-signal choreography (and its cost)
Quest parts compose by matching out-signal to in-signal strings — maximal decoupling, zero type safety
(ch.14). The cautionary contrast to openpiece's typed bus.

### 20. Generation-time vs runtime split
QuestNode builds then disappears; QuestPart persists and listens (ch.14). Same split as GenStep (build) vs
Map (runtime) — ch.15. Never make one object do both.

## F. Infrastructure

### 21. Mode-directed symmetric serialization
One `ExposeData` runs in four modes; ownership rule (one deep-saver, everyone else references) is
machine-checked (ch.16).

### 22. Plugin slots by subclass scan
Game/World/MapComponents auto-instantiate every subclass — add a class, touch nothing (ch.00, ch.17).
**Openpiece:** systems are explicitly ordered in WorldScene instead — deliberate (tick order matters); the
scan trick fits dev tooling, not the sim.

### 23. Player intent as world data
Designators write markers; WorkGivers consume them later (ch.18 §1). Decouples "what the player wants" from
"who does it and when" — load-bearing for a possess-any-unit + strategic-command game.

### 24. Grammar expansion
Weighted recursive symbol → symbols: structures (BaseGen, ch.15) and text (RulePacks, ch.18 §4). The
go-to for hierarchical procedural content.

### 25. Exception isolation per subsystem
Every tick sub-call, comp init, and mod hook individually try/caught: one failure degrades, never halts
(ch.00, ch.02). Paired with fail-loud *at boot* (ConfigErrors) — loud early, resilient late.
**Openpiece:** same two-phase philosophy: validators throw at boot; the tick keeps running.

---

## The five OOP mechanisms under everything

1. **Reflection instantiation from Type fields** (`Activator.CreateInstance(def.workerClass)`) — TS
   translation: registry/map of constructors or plain functions.
2. **Virtual-hook fan-out** (comp/tracker lifecycle broadcasting) — TS: event maps or interface dispatch.
3. **Static facades** (`Find`, `Current`, `Scribe.mode`) — openpiece rejected this for injection; know why
   they chose it (single-instance game, thousand call sites) and why you didn't (testability, multiplayer).
4. **Stateless shared strategy singletons** — TS: plain functions in def rows.
5. **Extension methods as façade** (`GenHostility.HostileTo`, `GetStatValue`) — one entry point over a
   subsystem; TS: module-level functions, which openpiece already uses (`targeting.ts`).
