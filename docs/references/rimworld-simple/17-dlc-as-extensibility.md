# 17 — DLC as Extensibility Proof: five expansions, no rewrites

> rimworld-simple atlas · [summary] · code paths relative to `..\rimworld-decomp\` · XML in `..\rimworld-data\`
> Ballpiece relevance: this is the empirical test of "engines, not content" — what hooks a codebase needs to
> absorb a whole expansion. The Devil Fruit / Haki / style layers should plug in the way genes/precepts do.

## The idea in 3 sentences

The core defines a small set of **extension seams** — def families, def/instance pairs with virtual methods,
comps, per-pawn trackers, and an event bus — and each expansion plugs an entire system into those seams instead
of editing gameplay code. Biotech's genes, Ideology's precepts, and Anomaly's monsters are all *content plus
comps*, reusing the existing stat, ability, hediff, thought, and incident pipelines. The core pays with a
handful of honest, explicit `if (ModsConfig.XActive)` seams it baked in deliberately.

## Case studies — what each added vs what it reused

| | New defs + state | Existing hooks it grabbed |
|---|---|---|
| **Biotech genes** | `GeneDef`/`XenotypeDef`; `Pawn_GeneTracker` | stats (offsets/factors), abilities, traits, hediffs, needs, capacities, skills, thoughts, death events, damage factors |
| **Ideology precepts** | `PreceptDef`/`MemeDef`/rituals; `Ideo` + `Pawn_IdeoTracker` | thoughts (memory + situational), stats, abilities (rituals), HistoryEvent reactions **plus an action veto** (`MemberWillingToDo`) |
| **Anomaly entities** | codex/ritual defs; containment comps | a monster is a *plain pawn*: PawnKindDef + race + body + hediffs + verbs + think tree + incidents + lords. Containment = bolt-on comps (`CompStudiable`, `CompHoldingPlatformTarget`) |

The pattern: a "new combat/belief/monster system" is mostly **new def families feeding the same five engines**
(stats, hediffs, abilities, thoughts, incidents).

## The general recipe — hook types that absorb expansions

1. Def + auto-discovering registry (new def family = zero registration code)
2. Def/instance pairs with virtual methods (`GeneDef`/`Gene`) — data by default, subclass as escape hatch
3. Comps on existing things/hediffs/abilities via XML lists
4. Per-pawn trackers, conditionally instantiated (chapter 03's dynamic components)
5. Auto-instantiated Game/World/MapComponents for global expansion state
6. **Shared data-list hooks consumed by core**: `statOffsets`, `statFactors`, `abilities`, `capMods` — the
   quiet workhorse; any new system that *emits* these plugs into everything downstream for free
7. Event bus with veto channel: `HistoryEventDef` pub/sub + `MemberWillingToDo` (beliefs can *prevent* actions)
8. Worker strategy classes via `workerClass` fields
9. `DefModExtension` — typed data attached to *any* existing def without subclassing (the mod-side hook)
10. `[MayRequire]` XML gating — unowned-DLC cross-refs drop instead of erroring

## Where they DID touch core (the honest exceptions)

`StatWorker` contains literal gene and precept loops; `ThoughtDef` grew `requiredGenes`/`nullifyingGenes`
fields; `Pawn` carries `genes`/`ideo` tracker fields in core Verse; `Gene.cs` itself lives in Verse. Lesson:
even the best seam design ends with the *aggregation points* (the stat pipeline, the pawn tick) knowing about
each major layer — the goal is confining that knowledge to single functions, not eliminating it. Ballpiece
equivalent: `StatBlock` will enumerate the four combat layers as modifier sources; that's fine, as long as
it's the only place that does.

## Gotchas & clever bits

- **Installed ≠ Active**: DLC present vs enabled-this-save are different checks; hot loops use the silent
  bool, player-triggered paths use the logging variant.
- Every tracker access is null-guarded and returns identity values (1f/true) when absent — a DLC-less save
  behaves exactly as vanilla, byte for byte.
- `Notify_GenesChanged` fans cache invalidation out to needs/render/skills/health — adding a modifier *source*
  means adding its invalidation events too.
- Hooks are opt-in at call sites: if core forgets to `RecordEvent`, the precept never fires. An event bus is
  only as complete as its emit coverage (ballpiece's `silent-failure-hunter` agent exists for exactly this).

## Go deeper

- `Verse\Gene.cs` + `RimWorld\Pawn_GeneTracker.cs` (`Notify_GenesChanged`) — the full new-layer shape.
- `RimWorld\StatWorker.cs` ~:150–300 — the honest core seam, inline.
- `RimWorld\PreceptComp_SelfTookMemoryThought.cs` + `Ideo.MemberWillingToDo` (~:881) — reaction + veto.
- `Verse\ModLister.cs` `CheckDLC` (~:347) — the three gating idioms side by side.
- XML: `..\rimworld-data\Biotech\Defs\GeneDefs\` — read a few genes; each is a bundle of existing hooks.
