# 12 — Tick & Performance: how thousands of things stay cheap

> rimworld-simple atlas · [deep] · code paths relative to `..\rimworld-decomp\`
> Ballpiece mapping: `docs/references/rimworld_patterns.md` §5 → `ecs/World.ts` + `core/Rng.ts`

## The idea in 3 sentences

The sim is a fixed 60-ticks/sec loop where game speed just runs more byte-identical ticks per rendered frame,
under a hard frame budget so overload degrades to slow-motion instead of a death spiral. The core scaling
trick is **tick staggering**: things declare a ticker class (Normal/Rare/Long = every 1/250/2000 ticks) and
land in a hash-assigned bucket, so each tick processes exactly one bucket per class — load is spread evenly,
never spiky. Determinism rests on a seeded RNG with an explicit **push/pop state** discipline for any
computation that must be reproducible regardless of what else consumed randomness.

## Key classes

| Class | Path | Role |
|---|---|---|
| `TickManager` | `Verse\TickManager.cs` | the clock: accumulate real time, run N ticks, fan out |
| `TickList` + `TickerType` | `Verse\TickList.cs` | the bucket machinery per ticker class |
| `Rand` | `Verse\Rand.cs` | seeded deterministic RNG + state stack |
| `ListerThings` | `Verse\ListerThings.cs` | pre-bucketed thing indexes by def and request-group |
| `GenClosest` | `Verse\GenClosest.cs` | region-BFS nearest-X queries |
| `RegionDirtyer` / `RegionAndRoomUpdater` / `ReachabilityCache` | `Verse\` | dirty-flag cache trio |

## Data flow

**The clock:** `TickManagerUpdate` accumulates real elapsed time → loops `DoSingleTick` while budget remains
(capped at ~45 ms/frame and speed×2 ticks). Speeds are 1×/3×/6×+ multipliers on ticks-per-frame — each tick
is semantically identical at any speed. One tick's order: `MapPreTick` (paths, roofs, weather-in) → Normal →
Rare → Long tick lists → world tick → storyteller/quests/tales → `MapPostTick` (ecology, lords, conditions)
→ game components. Every sub-call individually try/caught.

**Staggering:** a Rare thing goes in bucket `hash(thing) % 250`; tick N processes bucket `N % 250`. Each thing
still ticks exactly every 250 ticks, but only ~1/250 of them tick on any given tick. Registration is deferred
through queues to avoid mutation-during-iteration. A second layer: `IsHashIntervalTick(n)` staggers periodic
checks *inside* per-tick code (AI polls, need updates) by entity hash.

**Determinism:** `Rand` = MurmurHash over (seed, iteration counter). `PushState(seed)` / `PopState()` bracket
worldgen, event rolls, anything that must not perturb or be perturbed by global consumption; `ChanceSeeded`
wrappers do push/roll/pop inline. An imbalance detector warns on leaks.

**Spatial queries never scan:** things are pre-bucketed by def and by `ThingRequestGroup` per map *and per
region*; "nearest X" does a breadth-first region expansion that stops at the first reachable hit, falling back
to a global list only when local search exhausts. Cost ∝ nearby regions, not total things.

**Dirty caches everywhere:** regions/rooms rebuild only dirty cells (once per frame, not per tick);
reachability memoizes (district, district, params) tri-state; "nothing happening" checks cache per tick;
`Thing.DoTick` caches its own type-dispatch. The idiom: expensive derived value + explicit invalidation event
+ rebuild-on-demand.

## Patterns used

Fixed timestep with catch-up cap · hash-bucket load spreading · scoped/seeded RNG streams · pre-bucketed
indexes + hierarchical (region) search · dirty-flag memoization · per-subsystem exception isolation.

## Gotchas & clever bits

- Naive `tick % 250 === 0` gives a stutter spike every 250th tick; the bucket trick is the fix and costs ~20
  lines. (Directly applicable to ballpiece wildlife/town/distant-ship systems.)
- The frame budget means max speed is *effective*, not nominal — the game auto-slows under load and even
  auto-boosts speed when `NothingHappeningInGame()`.
- `Rand`'s static-ctor seeds from wall clock, but all *sim* paths re-seed explicitly — global randomness is
  for juice only. Same split as ballpiece's seeded `Rng` streams vs presentation randomness.
- Registration queues (`thingsToRegister`) are the standard answer to add-while-iterating; ballpiece's
  `World` defers entity destruction for the same reason.

## Go deeper

- `Verse\TickList.cs` — the whole bucket mechanism in one small file; read first.
- `Verse\TickManager.cs` — `TickManagerUpdate` (budget loop) + `DoSingleTick` (canonical order).
- `Verse\Rand.cs` — `PushState`/`PopState`/`ChanceSeeded` + the imbalance detector.
- `Verse\GenClosest.cs` — `ClosestThingReachable`: the region-BFS with global fallback.
- `Verse\ReachabilityCache.cs` — memoized reachability with tri-state entries.
