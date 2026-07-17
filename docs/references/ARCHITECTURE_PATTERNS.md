# Openpiece — Architecture & Design-Pattern References (educational)

> A **curated, annotated bibliography** of the engineering concepts + external resources that shape openpiece's
> **architecture, design patterns, logic, and complex systems** — organized into **9 themes**. The *how-to-build-it*
> companion to the game-idea tier list (`../design/REFERENCES.md`) and the vision (`../design/DEEP_SIMULATION.md`).
>
> **Living doc — add a line whenever you learn something architecture-shaping.**
> Format: **concept → key resources → how it maps to openpiece.** ✅ = verified link · ⌕ = find via the given
> search terms (URL not pinned, to avoid staleness / fabrication).

**Themes:** 1 Code Architecture · 2 Content as Data · 3 World (space/streaming/persistence) · 4 Simulation &
Complex Systems · 5 Combat, Input & Game Feel · 6 Multiplayer & Netcode · 7 Performance & Scale · 8 Presentation ·
9 Practice & Process.

---

## Theme 1 — Code Architecture & Patterns (the spine)
*How the codebase is structured so it stays changeable.*
- **Game-specific patterns** — ✅ **[Game Programming Patterns — Bob Nystrom](https://gameprogrammingpatterns.com/)**
  (free book): Component, Game Loop, Update Method, State, Observer, Command, Object Pool, Service Locator, Dirty Flag.
- **Classic GoF patterns** — ✅ **[refactoring.guru/design-patterns](https://refactoring.guru/design-patterns)** —
  Factory, Strategy, Decorator, Composite, etc., with clear diagrams.
- **Principles** — **SOLID**, **Clean Architecture** (dependency rule: point dependencies inward), separation of
  concerns, decoupling. ⌕ *search:* `SOLID principles`, `Robert Martin Clean Architecture dependency rule`.
- **ECS** — ✅ **[ecs-faq (Sander Mertens)](https://github.com/SanderMertens/ecs-faq)** — archetypes vs sparse-set,
  why data storage matters.

→ **openpiece:** ECS-lite (`World.with`), the fixed loop (`WorldScene.update`), `EventBus` (Observer), `FsmBrain`
(State), input→ability (Command). Systems depend on *data*, not each other (decoupling = the Moat).

## Theme 2 — Content as Data (extensibility)
*Define content as data rows; generic systems operate on them. No hardcoded lists, no `if (name===…)`.*
- **Registry + lifecycle** — ✅ **[Necesse Modding Wiki](https://necessewiki.com/Modding)** — a shipped seamless
  sandbox using a registry + dependency-ordered init lifecycle. Validates your exact approach.
- **Def inheritance** — RimWorld Defs (`ParentName`/`Abstract`) + a boot DefDatabase. ⌕ *search:*
  `RimWorld modding Def DefDatabase ParentName`.
- **Ability composition** — Unreal **GAS** (Abilities + Effects + Tags). ⌕ *search:* `tranek GASDocumentation`.
- **External / moddable data + serialization formats** — JSON (moddable), **msgpack / FlatBuffers / Protobuf**
  (compact/binary for saves & netcode). ⌕ *search:* `flatbuffers vs protobuf vs msgpack`.

→ **openpiece:** `core/Registry.ts` (+ inheritance), `combat/` GAS-lite. `ARCHITECTURE_SCALE §11 #1` (external data).

## Theme 3 — World: Space, Streaming & Persistence
*One seamless world, chunked, streamed, and remembered. (See `DEEP_SIMULATION.md §5–6.)`*
- **Chunk streaming** — ✅ **[Chunk Streaming System (Charlie Evans, PDF)](https://www.charlieevans.dev/documents/OpenWorldStreamingReport.pdf)**
  · ✅ **[Level Streaming overview (Medium)](https://medium.com/@business.sebastian1524/level-streaming-in-open-world-games-revolutionizing-immersive-experiences-0afdd8ffed88)**
  · ✅ **[Open-world 2D map loading (GameDev.net)](https://www.gamedev.net/forums/topic/676487-open-world-2d-map-loading/)** (2D-specific).
- **Spatial partitioning** — ✅ **[Red Blob Games](https://www.redblobgames.com/)** (grids, quadtrees, spatial hash).
  Canonical real example: ⌕ *search:* `Minecraft region file / chunk format (Anvil)`.
- **Persistence & serialization** — ✅ **[Demystifying game persistence (Michael Bitzos)](https://michaelbitzos.com/devblog/demystifying-game-persistence)**
  · ✅ **[World & Chunk Management (DeepWiki, craft-engine)](https://deepwiki.com/Xiao-MoMi/craft-engine/7-world-and-chunk-management)**.
  Store entities **by ID**, **resolve references** on load ("Shanks holds item#1234"), **version + migrate** saves.
  ⌕ *search:* `RimWorld Scribe references`, `save file versioning migration`.
- **Pathfinding** — ✅ **[A* — Red Blob Games](https://www.redblobgames.com/pathfinding/a-star/introduction.html)**;
  **HPA\*** (hierarchical) + **flow fields** for the big scale. ⌕ *search:* `HPA* Botea`, `flow field pathfinding`.
- **Procedural generation** — ✅ Red Blob (noise, island shaping, biomes); **generated history** as content
  multiplier. ⌕ *search:* `Caves of Qud sultan history GDC`, `Dwarf Fortress worldgen`.

→ **openpiece:** `TileGrid` = the grid → chunks (e.g. 32×32); sparse sea / dense islands; `Pathfinder` + sea flow-fields;
`WorldGen`; serialize-by-ID solves the "does it remember?" problem. `ARCHITECTURE_SCALE §11 #2`.

## Theme 4 — Simulation & Complex Systems (emergence)
*The deep-sim brain: many simple rules → un-scripted stories.*
- **Agent AI progression** — **FSM → Behavior Trees → Utility AI → GOAP**. ⌕ *search:* `Chris Simpson behavior trees`,
  `Dave Mark utility AI GDC`, `Jeff Orkin GOAP F.E.A.R.`.
- **Director / storyteller** — events paced by world state. ⌕ *search:* `RimWorld storyteller design`.
- **Systemic / immersive-sim design** — rules that interact, not scripted cases. ⌕ *search:*
  `Game Maker's Toolkit systemic games`, `immersive sim GDC systemic design`.
- **Emergence** — simple local rules → complex global behavior (boids, ecosystems). ⌕ *search:* `emergent gameplay design`.
- **Cellular automata** — fire spread, fluids, ecology on a grid. ⌕ *search:* `cellular automata fire/fluid game simulation`.
- **Agent-based economy** — supply/demand, trade routes, prices from agents. ⌕ *search:* `virtual economy design`, `EVE economy`.
- **Deterministic sim + fixed timestep** — reproducible ticks (replay/netcode). ✅
  **[Fix Your Timestep! (Gaffer On Games)](https://gafferongames.com/post/fix_your_timestep/)**.

→ **openpiece:** `ai/brains.ts`+`FsmBrain` (the `AIProfileDef` data-knobs are the FSM→BT seam), `GameDirector`
(storyteller seed), faction matrix (systemic), wildlife (emergence seed). `ARCHITECTURE_SCALE §11 #4,#6`.

## Theme 5 — Combat, Input & Game Feel (the moat)
*Where skill expression lives (see `../design/COMBAT.md`).*
- **Combat/ability patterns** — **hitbox/hurtbox** separation, **frame data** (startup/active/recovery), attack **state
  machines**, cancel windows. ⌕ *search:* `hitbox hurtbox frame data`, `fighting game state machine`.
- **Input handling** — **Command pattern** (rebindable, replayable), **input buffering** (queue an input during
  recovery), leniency windows. ⌕ *search:* `input buffering fighting games`, `command pattern input`.
- **Game feel / juice** — screen shake, hitstop, squash/stretch, particles, camera kick. ✅ concept: **Steve Swink,
  *Game Feel*** + the **"Juice it or lose it"** talk. ⌕ *search:* `juice it or lose it Jonasson Purho`, `game feel Swink`.

→ **openpiece:** the `swing` motion registry (frame phases), `MeleeSystem` (moving hitbox = hurtbox test),
data-driven `shake`/`stun`, GAS-lite abilities. Posture/parry/telegraphs are the depth (`COMBAT.md`).

## Theme 6 — Multiplayer & Netcode (openpiece.io)
*Server-authoritative sim; hide latency on the action layer. (See `DEEP_SIMULATION.md §7.)`*
- **Core netcode** — ✅ **[Gaffer On Games](https://gafferongames.com/)** (networked physics, snapshot interpolation,
  state sync, lockstep) · ✅ **[Source Multiplayer Networking (Valve)](https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking)**
  (client prediction + lag compensation).
- **Scaling** — **interest management / area-of-interest**, **delta compression**, **zoning/sharding**. ⌕ *search:*
  `MMO interest management area of interest`, `snapshot delta compression`.
- **Rollback** (if combat needs frame-perfect) — ⌕ *search:* `GGPO rollback netcode`.
- **Framework** — ✅ **[Colyseus](https://colyseus.io/)** (Node/TS authoritative rooms = zones).

→ **openpiece:** engine-agnostic TS sim on the server; client predicts with the *same code*; zones = rooms; only the
fast action layer needs prediction (deep sim is latency-immune).

## Theme 7 — Performance & Scale
*Cost should scale with the active area, not the world.*
- **Data-oriented ECS** — ✅ **[bitECS](https://github.com/NateTheGreatt/bitECS)** (typed-array SoA) — the object-ECS →
  DOD migration reference. ⌕ *search:* `data-oriented design Fabian dodbook`.
- **Off-thread & native** — **Web Workers** (+ SharedArrayBuffer), **WASM** hot loops (Rust/AssemblyScript). ⌕ *search:*
  `MDN Web Workers SharedArrayBuffer`, `AssemblyScript game`.
- **Culling & pooling** — viewport/frustum culling; object pools; avoid per-frame allocation (GC hitches). (GPP:
  Object Pool, Dirty Flag.)

→ **openpiece:** the ladder in `DEEP_SIMULATION.md §7` (object-ECS → typed-array → Workers → WASM); culling already
in `RenderSystem`/`SeaRenderer`; FX pool.

## Theme 8 — Presentation (rendering / UI / camera / audio)
*A thin consumer of sim state — kept separate so it's swappable.*
- **Rendering** — **batching** (WebGL batches same-texture draws; Canvas can't), **retained vs immediate mode**,
  depth sorting, texture atlases. ⌕ *search:* `sprite batching WebGL`, `Phaser AUTO canvas vs webgl`.
- **UI/HUD architecture** — **reactive state** (publish sim state → HUD reads it), MVC/MVVM, immediate-mode GUI.
  ⌕ *search:* `immediate mode GUI (IMGUI)`, `reactive UI state game HUD`.
- **Camera** — follow, smoothing/lerp, look-ahead, screen shake, deadzones. ⌕ *search:* `game camera follow lerp deadzone`.
- **Audio** — event-driven SFX, pooling, spatial/positional. ⌕ *search:* `game audio middleware event-driven`.

→ **openpiece:** procedural `draw` fns + `RenderSystem` (depth-sort), `RegKey` registry publishes HUD state
(reactive), camera follow + shake, `FxSystem`. Renderer is a thin sim-consumer (keeps the perf/multiplayer path open).

## Theme 9 — Practice & Process (meta)
*What keeps a huge, long project shippable.*
- **Testing** — unit-test the pure sim (deterministic logic is easy to test); regression tests. ⌕ *search:*
  `testing game logic unit tests`, `Vitest`. See ✅ **[EDGE_CASES.md](EDGE_CASES.md)** — the per-system
  edge-case/robustness checklist (what to test + guard for each feature).
- **Tooling / hot-reload** — fast content iteration (reload defs without restart). ⌕ *search:* `hot reload game content`.
- **Balancing / tuning** — data-driven knobs, spreadsheets, telemetry. ⌕ *search:* `game balance tuning data-driven`.
- **Project discipline** — vertical slices, "engines not content," ship one arc before widening (see
  `DEEP_SIMULATION.md §9`).

→ **openpiece:** Vitest suite over pure systems (combat/equip/factions/…), `typecheck` gate; keep sim engine-agnostic
+ seeded RNG so it stays testable and server-runnable.

---

## Cross-cutting principles (the through-lines)
1. **Engine is generic; content is data.** Every theme resolves to *registered data + a generic system* (Necesse,
   RimWorld, GAS prove it). This is what makes the scope tractable — guard it.
2. **Cost scales with the active area, not the world.** Culling, chunk streaming, sim-LOD, interest management, tiered
   ticks are the *same idea* applied to render / memory / CPU / bandwidth.
3. **Separate simulation ↔ persistence ↔ rendering.** Sim = engine-agnostic TS (runs headless on a server);
   persistence = serialize-by-ID + versioning; rendering = a thin Phaser consumer. This separation is what keeps
   openpiece.io *and* the performance ladder open.
4. **Simple rules, composed, beat scripted cases.** Systemic + data-driven design is how depth *and* emergence scale
   without hand-authoring everything.

## Coverage note
This spans the load-bearing best-practice areas: **architecture & patterns, content/data, world/streaming/persistence,
simulation/AI/emergence, combat/input/feel, netcode, performance, presentation, process.** It's intentionally a *map
with search terms*, not an essay — deepen any node on demand. Gaps get filled as they come up.
