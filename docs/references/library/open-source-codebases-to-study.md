# Volume: Open-Source Codebases & First-Party Dev Archives

> Library volume · full research detail · trust levels: ✅✅ adversarially verified / ✅ fetched live (2026-07-02)

## 1. Veloren — the living-world multiplayer codebase ✅✅ (3-0, 3-0, 2-1)

- **What:** multiplayer voxel RPG in **Rust**, explicitly inspired by *"Cube World, Legend of Zelda: Breath
  of the Wild, Dwarf Fortress and Minecraft"* (README verbatim). GPL-3.0+, volunteer-driven, 18k+ commits,
  active through 2026. Architecture: server-authoritative client/server split (`veloren-voxygen` client,
  `veloren-server-cli` headless server, separate auth server) — i.e., **a working headless-sim + thin-client
  stack in the open**, the openpiece.io shape.
- **Design philosophy (verbatim):** systems should be *"simple, self-correcting, rugged"* with *"complex and
  interesting behaviour [emerging] through the interaction between systems"* — openpiece's emergence bet,
  stated as project policy.
- **The book:** <https://book.veloren.net/> — *"the primary source of documentation… describe[s] the inner
  workings of both the game and the engine."* Substantive ECS chapter (3.2.3: cache coherency, SoA, specs);
  Internals section (ch. 4: Worldgen, Wiring).
- **The 2-1 vote caveat:** documentation depth is **uneven** — the Worldgen internals chapter is a WIP stub.
  Treat the book as strong for ECS/architecture, thin for worldgen (use their dev blogs 111/133/136/245 for
  rtsim/worldgen instead). Cite the GitLab README, not the book landing page, for the canonical description.
- **The killer subsystem:** **rtsim** — persistent NPC brains/memories in *unloaded* chunks +
  profession-based economy simulation. Working code for openpiece's sim-LOD pillar (REFERENCES #11).
- **Where:** <https://gitlab.com/veloren/veloren> · book.veloren.net · docs.veloren.net

## 2. ECS-author blogs — the "read the library author's mind" pair ✅ (fetched, quoted)

- **skypjack on software** (Michele Caini, creator of **EnTT** — the ECS used by Minecraft Bedrock):
  <https://skypjack.github.io/> — the "ECS back and forth" series, **13+ parts**: sparse sets & pointer
  stability (pt 12), the Big Matrix revisited (pt 11), hybrid storage (pt 10), "no policy is the best
  policy" (pt 13, Oct 2021). Plus the "Hello, EnTT" series explaining EnTT's design rationale. Free (GitHub
  Pages), **dormant since Oct 2021** — treat as a completed reference.
- **"Building an ECS"** (Sander Mertens, creator of **flecs**; also maintains the widely-cited ECS FAQ at
  flecs.dev): <https://ajmmertens.medium.com/building-an-ecs-1-types-hierarchies-and-prefabs-9f07666a1e9d> —
  *"at the end of each post you will have enough information to implement it yourself."* Teaches
  entity-ids-as-component-ids → hierarchies (CHILDOF) and **prefabs/templates with per-instance overrides
  (INSTANCEOF)** — a proven mechanism directly relevant to openpiece's Def-vs-Instance registries.
  **Staleness warning on the 2020 post itself:** *"This article is outdated, and the data structures it
  describes have been replaced"* — route to the updated version + later entries ("Archetypes and
  Vectorization", "Why Vanilla ECS Is Not Enough").
- **Openpiece mapping:** ECS/perf — sparse-set (EnTT ≈ openpiece's current shape) vs archetype (flecs)
  trade-offs, from the people who built both.

## 3. Factorio Friday Facts — the shipped-deterministic-sim dev archive ✅ (fetched, quoted)

- **What:** weekly dev blog since 2013 — *"200 fridays in a row with no misses"* by FFF #200 — the largest
  consistent archive of shipped-sim engine writeups. All free at factorio.com/blog.
- **Named entry points** (via the "Seven Years of FFF" curated index, spieswl.github.io):
  - **FFF #176** "Belts optimization for 0.15" + **#204** "Another day, another optimisation" (prefetching) —
    data-oriented perf on real systems
  - **FFF #317** "New pathfinding algorithm" — A* with chunk-based hierarchical reduction at insane scale
  - **FFF #143** "Matching server and UDP NAT punching" — multiplayer infrastructure (STUN/ICE, 2016)
  - Plus: prototypes/IDs (content-as-data), deterministic lockstep MP, map serialization, mod architecture
- **Openpiece mapping:** determinism · perf · content-as-data · pathfinding-at-scale. Subscribe.

## 4. Dwarf Fortress — closed-source, but the design record is open ✅ (fetched, quoted)

- DF itself is closed-source; the **wiki's developer-interview index** is the substitute:
  <https://dwarffortresswiki.org/index.php/List_of_Dwarf_Fortress_developer_interviews> — ~80 interviews/
  talks, 2008–2025, continuously maintained (last edit 2026-05). See the talks volume for the named picks.

## 5. Cataclysm: Dark Days Ahead — study the data, not the code ✅ (fetched, quoted)

- **The good:** a real, source-available "content-is-data" example — *"most of the data (mods, items, NPCs,
  etc.) is present in the form of JSON files"* (~96 JSON files: general/item/requirement/vehicle). License
  CC-BY-SA 3.0 — legally free to read (unlike a RimWorld decompile).
- **The caution (from TU Delft's DESOSA architecture analysis, 2019):** ~251k lines of C++ in a **flat src/
  with no subdirectories**, high cyclomatic complexity, SRP violations, ~1/3 test coverage. *Study its
  data-driven content layer via docs.cataclysmdda.org; do not imitate its code organization.*
- **Also structurally different:** turn-based single while-loop, not a fixed-timestep ECS.
- **Where:** <https://se.ewi.tudelft.nl/desosa2019/chapters/cataclysm/> + github.com/CleverRaven/Cataclysm-DDA

## 6. Classic roguelike codebases (via the marukrap/RoguelikeDevResources index) ✅ (fetched, quoted)

- Named with languages: **Angband** (C), **NetHack** (C), **Cataclysm-DDA** (C++), **Dungeon Crawl Stone
  Soup** (C++); plus Roguelike Celebration talk playlists (2016–2018) on YouTube.
- The index repo itself: ~1,284 stars but **frozen since 2021-07** — a solid snapshot; spot-check links.
- **Openpiece mapping:** world-sim/AI archaeology — decades-old but battle-tested system designs.
