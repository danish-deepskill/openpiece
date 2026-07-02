# 02 — Things & Comps: composition without an ECS

> rimworld-simple atlas · [deep] · code paths relative to `..\rimworld-decomp\`

## The idea in 3 sentences

Every in-world object — rock, gun, corpse, colonist, bullet — is a `Thing` carrying a pointer to its immutable
`ThingDef`. Instead of a deep class tree, most behavior bolts on as a bag of `ThingComp` objects declared
per-def in XML; `ThingWithComps` owns the list and fans every lifecycle event out to each comp. It is
"composition without an ECS": each comp holds *both* its state *and* its behavior, and there is no query engine
— you ask a specific Thing for a specific comp type (contrast with ballpiece's ECS, where components are pure
data and systems iterate queries).

## Key classes

| Class | Path | Role |
|---|---|---|
| `Entity` → `Thing` | `Verse\Entity.cs`, `Verse\Thing.cs` | World object: def, Position, Map, HP, faction; spawn/despawn lifecycle |
| `ThingWithComps` | `Verse\ThingWithComps.cs` | Adds `List<ThingComp>`; `InitializeComps`; the fan-out layer |
| `ThingComp` | `Verse\ThingComp.cs` | Behavior module; ~80 virtual hooks (`CompTick`, `PostSpawnSetup`, `PostExposeData`, `CompGetGizmosExtra`…) |
| `CompProperties` | `Verse\CompProperties.cs` | Per-def comp config; carries `compClass` (the Type to instantiate) |
| `ThingMaker` | `Verse\ThingMaker.cs` | Factory: `MakeThing(def, stuff)` → instantiate `thingClass` → `PostMake` |
| `CompQuality` / `CompForbiddable` / `CompRottable` / `CompPowerTrader` | `RimWorld\*.cs` | Representative comps: quality tier, forbid toggle, spoilage, power draw |
| `Building` / `Pawn` / `Plant` / `Projectile` | `Verse\`, `RimWorld\` | The four main subclass branches |

## Data flow

1. **Def load:** XML `<comps><li Class="CompProperties_Rottable">…` — the `Class=` attribute picks the
   *properties* subclass; its constructor sets `compClass = typeof(CompRottable)`. One XML node ties
   config-data-type to behavior-type.
2. **Instantiation:** `ThingMaker.MakeThing` → `Activator.CreateInstance(def.thingClass)` → `PostMake` →
   `InitializeComps()` loops `def.comps`, creates each comp, sets `comp.parent = this`, `Initialize(props)`.
   Hot comps are cached as direct fields; the rest go in a by-type dictionary.
3. **Fan-out:** every Thing method re-broadcasts — `SpawnSetup`→`PostSpawnSetup`, `Tick`→`CompTick`,
   `ExposeData`→`PostExposeData`, `Destroy`→`PostDestroy`, plus gizmos, inspect strings, damage, trade, and
   ~40 `Notify_*` events. Comps talk to each other via `BroadcastCompSignal(string)`.
4. **Lifecycle:** `MakeThing` → `SpawnSetup(map)` (registers into region/thing grids + tick manager) → ticking
   gated by `def.tickerType` → `DeSpawn` (unregister) or `Destroy` (+ leavings).

## Patterns used

- **Composition over inheritance** — capabilities added by list membership. **Template Method** — Thing owns
  the skeleton, comps fill hook steps. **Factory** — ThingMaker + reflection.
- **Vs a true ECS:** data+behavior live together in the comp; no global component store; no queries ("iterate
  all Things with CompRottable" is impossible directly). Cross-cutting work an ECS system would own is handled
  by **side registries a comp registers into** (e.g. `CompBreakdownable` → the map's `BreakdownManager`) —
  worth recognizing as the OO equivalent of a system.

## The subclass-vs-comp rule of thumb

Subclass `Thing` when the object needs a fundamentally different **shape or core loop** — own fields, own
tick/draw structure, interfaces (Pawn, Plant, Projectile, Building_TurretGun with bespoke targeting). Use a
**comp** when the feature is an **optional orthogonal capability** shared by unrelated things (forbiddable,
quality, rot, power: a turret, a lamp, and a fridge share power draw verbatim). If it changes what the object
*is*, subclass; if it could apply to a rock, a gun, or a wall, comp.

## Gotchas & clever bits

- **Comp lookup cost is real.** `GetComp<T>` inlines the 0–2 comp cases, then dictionary, then linear scan.
- **Pawns deliberately avoid the comp bag for hot subsystems** — ~40 hard-typed tracker fields instead
  (chapter 03). Comps are for the optional long tail, not the mandatory core. Same reasoning as ballpiece
  keeping hot components as plain fields on entities.
- Save/load re-instantiates comp objects; only their *fields* serialize (`PostExposeData`).
- `InitializeComps` try/catches per comp — one broken mod comp doesn't kill the Thing.
- `ThingDef.ConfigErrors` cross-checks def sanity (comps without ThingWithComps class, equipment without
  `CompEquippable`).

## Go deeper

- `Verse\ThingWithComps.cs` :193–221 `InitializeComps`, :123–161 `GetComp<T>` fast paths — the heart.
- `Verse\ThingComp.cs` in full — the hook surface is the best single map of what a comp can join.
- `RimWorld\CompBreakdownable.cs` — comp registering into a map-level manager (the "system" substitute).
- `RimWorld\CompRottable.cs` + its properties class — the props/behavior split.
- `Verse\Thing.cs` :803–870 `SpawnSetup`, :945+ `DeSpawn`/`Destroy` — grid/manager registration.
- `RimWorld\Building_TurretGun.cs` — the canonical "subclass instead of comp" case.
