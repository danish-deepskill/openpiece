# RimWorld architecture patterns — distilled for openpiece

> **Companion atlas:** `C:\Files\Phaser\References\rimworld\rimworld-simple\` — a ~20-chapter big-picture map
> of the *entire* RimWorld codebase (all subsystems, patterns catalog, coverage manifest, glossary). This doc
> decides what openpiece adopts; the atlas describes how RimWorld works. Read the atlas's `README.md` +
> `19-patterns-catalog.md` first when studying something new.

> Source: RimWorld 1.6 (build 9676) decompiled locally to `C:\Files\Phaser\References\rimworld\rimworld-decomp`
> (namespaces: `Verse\` engine layer, `Verse\AI\`, `RimWorld\` game layer), plus the shipped XML defs copied
> to `C:\Files\Phaser\References\rimworld\rimworld-data\<expansion>\Defs` and Ludeon's commented partial
> source at `C:\Files\Phaser\References\rimworld\rimworld-source`. That code is Ludeon Studios'
> copyright — this doc records **patterns and file pointers only**, never copied code.
>
> Why RimWorld: it is the existence proof for openpiece's two biggest bets — *content is data, code is
> generic* at ~10k-def scale, and *no special-cased player* (every pawn runs the same stack). Each section:
> how RimWorld does it → what openpiece already has → what's worth adopting → what to skip.

---

## 1. Def system (`Verse\Def.cs`, `Verse\DefDatabase.cs`) → `core/Registry.ts`

**How RimWorld does it.** Every content row is a `Def` with a unique `defName`, stored per-type in a static
`DefDatabase<T>` (list + by-name dict). Loading is a strict multi-pass pipeline
(`Verse\PlayDataLoader.cs`):

1. XML → nodes; **inheritance** resolved as pure preprocessing (`Verse\XmlInheritance.cs`):
   `ParentName` merges parent node into child, child elements overwrite, `<li>` lists **append**,
   `Abstract="True"` templates never instantiate. Cycles detected and logged.
2. Nodes → def objects. Any field typed as another Def is *not* parsed inline — the string is queued as a
   **wanted cross-reference** (`Verse\DirectXmlCrossRefLoader.cs`) and injected after *all* defs exist.
   This is what lets `<projectile>Bullet_Rifle</projectile>` become a live object with no load-order rules.
3. `ResolveReferences()` on every def — the hook for derived data that needs other defs resolved.
4. `ConfigErrors()` on every def — each def type yields human-readable complaints; bad data is **logged
   loudly**, never silently defaulted.

Two supporting patterns: **DefOf** (`RimWorld\DefOfHelper.cs`) — classes of static typed fields, bound by
field name after load, so code references well-known content without string literals scattered around; and
**short hashes** — a stable `hash(defName) % 65535` per def so saves serialize compact ids.

**Openpiece already has:** the same shape, deliberately smaller — `Registry<T>` with lazy `parent`
flattening (child wins, **arrays replace** — note: opposite of RimWorld's list-append), per-family
`Validator` throwing at boot, and registry-sweep tests standing in for cross-ref resolution.

**Worth adopting:**
- **A second resolve pass.** Registry validates each def in isolation; there is no hook that runs after
  *all* registries are populated (RimWorld's `ResolveReferences`). A single boot-time `resolveAll()` that
  cross-validates families (every `AbilityDef.grants` id exists, every `UnitDef.brain` profile exists) turns
  the registry-sweep *tests* into a *runtime* guarantee — mandatory before external JSON content loading.
- **A `DefOf`-style ids module.** One `defs/wellKnown.ts` of exported const ids (`export const HERO =
  'unit.hero' as const`), asserted to exist at boot. Kills stringly-typed references to load-bearing content
  from systems, without giving up id-as-string saves.
- Keep the list-replace inheritance rule (it is simpler and already documented) — but steal RimWorld's habit
  of **base defs as tuning sheets**: one abstract parent per family holding every default, so concrete rows
  are deltas (see `rimworld-data\Core\Defs\FactionDefs\Factions_Base.xml`).

**Skip:** short hashes (JSON saves with string ids are fine at openpiece's scale), reflection-driven
deserialization (TS modules are already typed), mod-overlay merge machinery.

---

## 2. Stats & modifiers (`RimWorld\StatWorker.cs`, `StatDef.cs`, `StatPart.cs`) → `combat/StatBlock.ts` + `Modifier.ts`

**How RimWorld does it.** `StatWorker.GetValueUnfinalized` applies **all offsets first, then all factors**
— gear, traits, hediffs, skills, capacities each contribute to one of the two buckets. `FinalizeValue` then
runs pluggable `StatPart`s (priority-ordered), a `postProcessCurve`, rounding, and a min/max clamp. Same
order every time; difficulty and scenario multipliers are just more factors.

The two ideas that matter most:

- **The explanation mirror.** Every code path that mutates a value has a twin that emits a labeled line
  (`GetExplanationString`), so the info card can print *base 100 · +12 gear · ×1.3 trait · curve → 145*.
  Modifiers aren't just source-*tagged* for removal — they're source-*narrated* for debugging.
- **Stats are themselves defs** (`StatDef`): default base, min/max clamp, rounding, post-process curve,
  which parts apply. Adding a stat is a data row; no system learns about it.
- **Caching with explicit staleness** (`StatCacheEntry`): values cached per-thing with the tick they were
  computed; callers pass how stale they tolerate; targeted invalidation on known mutations.

**Openpiece already has:** the canonical stacking pipeline (`flat → addPct → mulPct → override`) and
source-tracked modifiers with `removeBySource` — the same core, cleaner op vocabulary.

**Worth adopting:**
- **`explain(stat)` on StatBlock** returning the ordered contribution list (source, op, value, running
  total) for the debug overlay. Cheap now, priceless when four combat layers stack modifiers.
- **A `Stats` registry** (`StatDef`: id, base default, min/max clamp, round?) so clamps/defaults stop being
  implicit. Validator: every `Modifier.stat` in every def resolves.
- Post-process **curves** as def data (diminishing returns on defense/speed) — evaluate after `override`.
- Stat caching **only when profiling says so**, and then RimWorld's shape: value + computed-tick, caller
  declares tolerated staleness. Not before.

**Skip:** the ~90 `StatPart` subclasses (that granularity serves colony-sim inspection; openpiece's parts
are its four layers), per-frame global cache clearing.

---

## 3. Effects & abilities (`Verse\Hediff*.cs`, `RimWorld\Ability*.cs`) → `combat/Effect.ts` + `Ability.ts` (GAS-lite)

**How RimWorld does it.** The uniform shape everywhere: **Def (shared data) + instance (per-pawn state) +
comps (pluggable behavior declared in data)**.

- A **Hediff** instance holds only `def`, `severity`, `ageTicks`. Behavior comes from **HediffComps**
  declared as a list in the def — timed expiry (`HediffComp_Disappears`), severity ramp per day, immunity.
  Comps vote on shared questions: `ShouldRemove` OR-s across comps; severity adjustments sum through one
  `ref` accumulator per tick.
- **HediffStage** (`Verse\HediffStage.cs`): a def carries severity-ordered stages, each a complete block of
  stat offsets/factors/capacity mods. Crossing a threshold swaps the whole block — an effect that worsens
  is *data*, not code. Stat integration is just "current stage's modifiers show up in stat queries".
- An **Ability** = def (cooldown range, charges, targeting) + instance (cooldown state) + a **list of
  effect comps** (`CompAbilityEffect_GiveHediff`, `_Stun`, `_Teleport`…) applied in order on cast. New
  ability = recombine existing comps in data; new C# only for a genuinely new behavior.
- **Verbs** (`Verse\VerbProperties.cs`): melee swing, rifle shot, and psycast are one abstraction — range,
  warmup, cooldown, burst, targeting rules — differing only in data. Weapons, hediffs, and abilities all
  *grant verbs* into the same resolution path.

**Openpiece already has:** `AbilityDef`/`EffectSystem` foundations, swing-as-data motions, and the
tag/modifier vocabulary — the GAS-lite target is exactly this architecture.

**Worth adopting:**
- **Effect comps as a discriminated union.** In TS, RimWorld's `compClass` reflection becomes
  `type EffectBehavior = { kind: 'expires'; ticks: number } | { kind: 'severityPerDay'; rate: number } | …`
  plus one handler per `kind` in the effect engine. Same composability, fully typed, no reflection.
- **Severity + stages** on EffectDef: one number driving which modifier block is live. This gives
  poison-that-worsens, Haki-drain tiers, burn stacking — all as def rows.
- **Merge rules as data**: same-def effect reapplied → sum severity / refresh duration / stack count
  (RimWorld's `TryMergeWith`). Decide per-def, not per-call-site.
- **The verb insight for the four layers:** fruit powers, sword swings, kicks, and gun shots should
  converge on one "attack action" shape (windup/active/recovery + targeting + cost) the way everything in
  RimWorld is a verb — `combat/swing.ts` is already this for melee; extend it rather than adding a parallel
  ranged path.
- **Remove-when: severity ≤ 0** as the single expiry convention (comps *drive* severity down; the engine
  owns removal). One sweep point, no scattered lifetime checks.

**Skip:** body-part anatomy coupling, `Activator.CreateInstance` reflection, the immunity subsystem.

---

## 4. AI (`Verse\AI\ThinkNode.cs`, `Job.cs`, `JobDriver.cs`, `Verse\AI\Group\Lord.cs`) → `ai/Brain.ts`

**How RimWorld does it.**
- **ThinkTree = behavior tree in data.** The tree is XML (`ThinkTreeDefs\Humanlike.xml`); each node names a
  C# worker class (`ThinkNode_Priority` first-match, `_PrioritySorter` utility-ordered, `_Conditional*`
  gates, `_Subtree` splicing for reuse). Def declares structure; workers define evaluation. Colonists,
  raiders, animals, mechs: **same machinery, different tree defs** — "player-ness" is a condition node
  *inside* the tree, never a code fork. This is openpiece's Moat, shipped.
- **Job = data; JobDriver = resumable steps.** A Job is just `def + up to 3 targets + flags`. Its driver
  decomposes into **Toils** — atomic steps (go there, wait N ticks, do X on arrival) with end conditions.
  Only a cursor index is saved; the toil list regenerates from code on load — long actions are inherently
  interruptible and save-safe.
- **Two-level AI.** Squad logic (`Lord` + `LordToil` + `Trigger` state graph) doesn't *override* personal
  AI — it assigns each member a **Duty**, and a high-priority node in the *personal* tree dispatches on the
  current duty. No duty → node yields nothing → personal behavior continues.
- **Staggered re-evaluation.** The tree is NOT walked per tick — only when the current job ends or expires
  (combat jobs carry randomized `expiryInterval`s, ~450–550 ticks). Background checks run on
  `IsHashIntervalTick(30)` so pawns spread across frames. Damage-triggered rethink rate-limited (180 ticks).
  A runaway guard kills pawns starting 10 jobs in 10 ticks.

**Openpiece already has:** `Brain` strategy per-unit, data-driven `AIProfileDef` knobs, `SquadSystem`, and
the FSM→BT migration explicitly planned.

**Worth adopting:**
- **The Job layer before the BT layer.** The FSM's real successor isn't "a better tree" — it's separating
  *decide* (brain emits an intent: `{ kind: 'attack', target }`) from *execute* (a driver advances the
  intent in resumable steps). Brains get simpler, intents become inspectable/serializable, and the later
  BT swap only replaces the decide half.
- **Duty dispatch for squads:** `SquadSystem` writes a `duty` field on members; a top-priority brain check
  defers to it. Never a second brain fighting the first.
- **Re-evaluation staggering now:** think intervals + a per-entity hash offset (`id % interval` bucket), and
  intent expiry ticks instead of per-tick re-targeting. Cheapest scaling win in this list.

**Skip:** the Toils library breadth, mental states/joy, `ThinkTreeKeyAssigner` save-key machinery
(serialize intents by kind + ids instead).

---

## 5. Tick & performance (`Verse\TickManager.cs`, `TickList.cs`, `Rand.cs`) → `ecs/World.ts` + `core/Rng.ts`

**How RimWorld does it.**
- **Fixed 60 ticks/sec; speed = more ticks per rendered frame**, each tick byte-identical in semantics. A
  frame budget (~45ms) caps catch-up so the game slows rather than spirals.
- **TickList bucketing:** three ticker classes — Normal (every tick), Rare (250), Long (2000). A Rare thing
  lands in bucket `hash % 250`; each tick processes one bucket. Load is *evenly spread*, not spiky.
  Registration deferred through queues to avoid mutation-during-iteration.
- **Deterministic RNG with scoped state:** `Rand.PushState(seed)` / `PopState()` brackets any computation
  that must not perturb (or be perturbed by) global RNG consumption — world gen, event rolls. Convenience
  `ChanceSeeded(seed)` wrappers do push/roll/pop.
- **Spatial queries never scan:** per-map and per-region things pre-bucketed by def and by request-group
  (`Verse\ListerThings.cs`); "nearest X" is a region-BFS outward that stops at the first reachable hit
  (`Verse\GenClosest.cs`), falling back to global only when local search is exhausted.
- **Dirty-flag caches everywhere:** regions/rooms rebuild only dirty cells; reachability memoized per
  (district, district, params) tri-state; expensive scans guarded by "already computed this tick".

**Openpiece already has:** fixed timestep, seeded `Rng`, Phaser-free deterministic sim (enforced by test),
`SpatialQuery`.

**Worth adopting:**
- **Ticker classes when entity counts grow:** most future systems (wildlife idling, town economy, distant
  ships) are Rare/Long-tick work. The bucket-by-`id % interval` trick is ~20 lines in `World` and prevents
  the every-250th-tick stutter spike that naive `tick % 250 === 0` causes.
- **Scoped RNG (`rng.scoped(seed, fn)`)** so event rolls and worldgen are reproducible regardless of what
  else consumed randomness that tick — determinism insurance that keeps replays/tests stable as systems
  multiply.
- **Catch-up cap** in the fixed-timestep loop (max ticks per frame) — slow-motion degrades gracefully;
  death-spiral doesn't.

**Skip:** regions/rooms (indoor-volume machinery a tile-grid island game doesn't need yet), the
multi-clock (`TickManager` vs per-map) split.

---

## 6. Event director (`RimWorld\Storyteller.cs`, `IncidentDef.cs`, `IncidentWorker.cs`) → `systems/GameDirector.ts`

**How RimWorld does it.** Three strictly-separated layers:

1. **StorytellerDef** — a *personality* as data: which comps, category weights, pacing curves. Cassandra vs
   Randy differ only in XML.
2. **StorytellerComp** — *cadence*: each comp decides *when* to propose (mean-time-between rolls, on/off
   cycle windows) and picks a category by weight. The director thinks once per 1000 ticks, not per tick.
3. **IncidentDef + IncidentWorker** — *one event*: the def carries eligibility data (category, base chance,
   `minRefireDays`, biome/faction/population gates); the worker splits **`CanFireNow`** (pure eligibility)
   from **`TryExecute`** (spawn it). The pipeline passes one generic **`IncidentParms`** bag (points,
   faction, target…) — raids, traders, and weather flow through the identical path reading only the fields
   they care about.

**Threat points** (`StorytellerUtility.DefaultThreatPointsNow`) is the matchmaking formula: colony wealth
(curve) + per-pawn combat power (curves) × time factor × recent-performance adaptation × difficulty, clamped
— one budget number that then *sizes* whatever event fires.

Scaling property: **adding an event touches zero director code** — the comps discover new `IncidentDef`s by
category scan. The director speaks only categories, weights, points, and the CanFire/Execute contract.

**Openpiece already has:** `GameDirector` (spawn-wave era) and `PowerTier` — the declared destination is
exactly this (`ARCHITECTURE_SCALE.md` event director; sea/land events in `design/EVENTS.md`).

**Worth adopting (this is the blueprint — take it whole):**
- `EventDef` registry: category (`'raid' | 'weather' | 'encounter' | …`), baseWeight, minRefireTicks,
  eligibility data (zone, min/max player tier, faction) + a worker map `Record<category-or-id, EventWorker>`
  with `canFire(ctx, parms)` / `execute(ctx, parms)` split — the split is what makes eligibility testable.
- One `EventParms` bag (points, faction, zone, position) so every event family shares the pipeline.
- **Points formula from PowerTier**: player tier + crew + gear → a budget the worker spends when sizing the
  event. Openpiece's tier system slots in exactly where colony wealth sits in RimWorld's.
- Refire cooldowns tracked per def id (`lastFiredTick` map) — the difference between "living world" and
  "raid spam".
- Directors as def rows too (calm seas vs chaotic New World = different weights/pacing — same engine).

**Skip:** adaptation/grace-period tuning (needs playtest data openpiece doesn't have yet), the quest-graph
system above incidents.

---

## Reading list (decompiled paths)

| Topic | Start here |
|---|---|
| Def pipeline | `Verse\Def.cs`, `Verse\DefDatabase.cs`, `Verse\XmlInheritance.cs`, `Verse\DirectXmlCrossRefLoader.cs`, `Verse\PlayDataLoader.cs` |
| Stats | `RimWorld\StatDef.cs`, `RimWorld\StatWorker.cs` (GetValueUnfinalized / FinalizeValue / GetExplanationUnfinalized), `RimWorld\StatPart_Quality.cs` |
| Effects | `Verse\HediffDef.cs`, `Verse\HediffStage.cs`, `Verse\HediffWithComps.cs`, `Verse\HediffComp_Disappears.cs`, `Verse\Pawn_HealthTracker.cs` |
| Abilities/verbs | `RimWorld\AbilityDef.cs`, `RimWorld\Ability.cs`, `RimWorld\CompAbilityEffect_GiveHediff.cs`, `Verse\VerbProperties.cs` |
| AI | `Verse\AI\ThinkNode.cs`, `Verse\AI\ThinkNode_JobGiver.cs`, `Verse\AI\Job.cs`, `Verse\AI\JobDriver.cs`, `Verse\AI\Pawn_JobTracker.cs`, `Verse\AI\Group\Lord.cs`; XML: `rimworld-data\Core\Defs\ThinkTreeDefs\Humanlike.xml` |
| Tick/perf | `Verse\TickManager.cs`, `Verse\TickList.cs`, `Verse\Rand.cs`, `Verse\ListerThings.cs`, `Verse\GenClosest.cs` |
| Events | `RimWorld\Storyteller.cs`, `RimWorld\StorytellerComp_RandomMain.cs`, `RimWorld\IncidentDef.cs`, `RimWorld\IncidentWorker.cs`, `RimWorld\StorytellerUtility.cs` (DefaultThreatPointsNow) |
