# 00 — Big Picture: layers, state tree, and the two clocks

> rimworld-simple atlas · [deep] · code paths relative to `..\rimworld-decomp\`

## The idea in 3 sentences

RimWorld stacks three layers: **Unity** (rendering/input engine), **Verse** (Ludeon's engine-agnostic simulation
framework — ticking, saving, defs, the Thing object model), and **RimWorld** (game content and managers built on
Verse). All state nests in one containment tree — `Root` (Unity entry) → `Game` → `World` (planet) → `Map`s
(playable tiles) → `Thing`s — and two static classes (`Current` mutable holder, `Find` read-only facade) let any
code reach that tree without threading references. Simulation and presentation run on **two different clocks**:
drawing happens once per rendered frame, but the sim ticks 0..N times per frame depending on game speed — the
same split as ballpiece's fixed `SIM_DT` timestep vs Phaser's render loop.

## Key classes

| Class | Path | Role |
|---|---|---|
| `Root` / `Root_Entry` / `Root_Play` | `Verse\Root*.cs` | Unity MonoBehaviour entry; menu vs play scene variants |
| `Current` | `Verse\Current.cs` | Mutable globals: `Game`, `Root`, `ProgramState` |
| `Find` | `Verse\Find.cs` | ~90 read-only getters delegating into the state tree |
| `Game` | `Verse\Game.cs` | Top game state: ~30 managers, the `World`, `List<Map>` |
| `World` | `RimWorld\Planet\World.cs` | Planet layer: factions, world pawns/objects, grid |
| `Map` | `Verse\Map.cs` | One tile's play area: ~100 manager/grid fields |
| `GameComponent` / `WorldComponent` / `MapComponent` | `Verse\`, `RimWorld\Planet\` | Plugin slots at each scope (see below) |
| `PlayDataLoader` | `Verse\PlayDataLoader.cs` | Static boot: mods → DefDatabases (chapter 01) |
| `TickManager` | `Verse\TickManager.cs` | The sim clock (chapter 12) |
| `GameInitData` | `Verse\GameInitData.cs` | Transient new-game config, discarded after init |

## Data flow — three lifecycle walks

**App boot → main menu.** Unity loads the Entry scene → `Root_Entry.Start()` → one-time global init → if defs
aren't loaded, `PlayDataLoader.LoadAllPlayData` runs as an async "long event" (the loading screen): load mods →
fill every `DefDatabase<T>` → resolve cross-refs in passes → generate implied defs → bind `DefOf`s → short
hashes → static constructors. Then the menu UI builds. **All content is in memory before any game exists.**

**New game.** Menu pages fill a `GameInitData` + fresh `Game` on `Current.Game` (world gen, scenario, starting
pawns) → Play scene loads → `Root_Play.Start` queues `Game.InitNewGame()`: `ProgramState = MapInitializing` →
`MapGenerator.GenerateMap` for the start tile (chapter 15) → `FinalizeInit` → `Playing`. Loading a save runs
`Game.LoadGame` instead — deep-load World, then Maps, in a fixed order (chapter 16).

**Every frame.** `Root.Update` → real-time work (UI, sound, long-event pump) → `Game.UpdatePlay`:
- once per **frame**: `World.WorldUpdate` + each `map.MapUpdate` — rendering, meshes, flecks (presentation);
- 0..N times per frame: `TickManager.TickManagerUpdate` accumulates real time and calls `DoSingleTick()` while
  budget remains (capped ~45 ms/frame). One tick = `MapPreTick` → tick lists (Normal/Rare/Long) →
  `World.WorldTick` → storyteller/quests → `MapPostTick` → game components. Two-phase Pre/Post enforces
  ordering (paths/roofs before agents, ecology after). Nearly every sub-call is try/catch-wrapped so one
  exception can't kill the sim.

## Patterns used

- **Layered engine split** — Verse knows nothing about colonies; RimWorld builds on it. (Ballpiece's
  `sim vs presentation` boundary is the same cut, enforced by test instead of assembly.)
- **Service Locator** (`Find`/`Current`) — global access instead of dependency injection. Costs they pay:
  hidden dependencies, hard unit-testing, null-fragility outside the Playing state. Ballpiece deliberately
  chose constructor injection instead; read this facade as the cautionary alternative.
- **Plugin slots** (`GameComponent`/`WorldComponent`/`MapComponent`) — every non-abstract subclass is
  reflectively auto-instantiated, ticked, and saved with its owner. This is the main mod/DLC seam: add a class,
  touch nothing else (chapter 17).
- **Long events** — anything slow (boot, mapgen, saving) runs as a queued event behind a loading screen rather
  than blocking a frame.

## Gotchas & clever bits

- `currentMapIndex` is an `sbyte` → hard 127-map cap.
- `FillComponents` runs on both construct *and* load, so old saves gain components added by new mods/patches —
  forward compatibility for free.
- `Game.ExposeData` refuses to load the whole game in one pass (guard at top); world/maps load via explicit
  ordered nodes so cross-refs resolve correctly.
- The frame budget (`WorstAllowedFPS`) means at high speed the game *slows the sim* rather than dropping frames
  or spiraling.

## Where does X live? (routing table)

| Question | Chapter |
|---|---|
| How content/data loads | 01 |
| What a world object is | 02 · characters: 03 |
| Numbers on things | 04 · effects on pawns: 05 |
| Attacks and damage | 06 · activated powers: 07 |
| Why a pawn does something | 08 · what it wants: 09 · its work: 10 |
| Who hates whom | 11 |
| The clock and performance | 12 |
| What happens next (events/quests) | 13 · 14 |
| Where the terrain came from | 15 |
| How it all saves | 16 |
| How DLC bolted on | 17 · everything else: 18 |
| The recurring tricks, named | 19 |

## Go deeper

- `Verse\TickManager.cs` — `TickManagerUpdate`/`DoSingleTick` (~318–460): the exact sim/frame budget loop.
- `Verse\Map.cs` — `ConstructComponents` (~510), `MapUpdate` (~1148), `MapPreTick`/`MapPostTick` (~933).
- `Verse\PlayDataLoader.cs` — `DoPlayLoad`: the full boot pipeline.
- `Verse\Game.cs` — `InitNewGame` (~492) vs `LoadGame` (~560): the new-vs-load divergence.
- `Verse\Current.cs` — `Notify_LoadedSceneChanged`: how scene changes rebind globals.
- `GameComponentUtility.cs` — component lifecycle broadcasts.
