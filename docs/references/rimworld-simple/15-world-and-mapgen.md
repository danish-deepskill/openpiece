# 15 — World & Map Generation: def-driven procedural pipelines

> rimworld-simple atlas · [deep] · code paths relative to `..\rimworld-decomp\`
> Ballpiece parallel: `world/WorldGen.ts` — the GenStep pipeline is the scaling path for island generation.

## The idea in 3 sentences

Worlds and maps are built by running an **ordered list of independent, def-declared steps**, each reading and
writing shared scratch state under a deterministic seed. Two engines share the philosophy at different scales:
coarse pipelines (`WorldGenStep`, `GenStep`) fill grids cell-by-cell with layered noise, while a recursive
**grammar engine** (`BaseGen`) expands abstract symbols ("settlement") into smaller symbols and finally
concrete walls/beds/things. Everything regenerates identically from one seed string because each stage derives
its RNG by hash-combining the parent seed with a stable per-step constant.

## Key classes

| Class | Path | Role |
|---|---|---|
| `WorldGenerator` + `WorldGenStep(Def)` | `RimWorld.Planet\` | planet pipeline: tiles, terrain/biomes, rivers, factions |
| `MapGenerator` (static) + `GenStep(Def)` | `Verse\MapGenerator.cs`, `GenStep.cs` | map pipeline + the shared blackboard (`data`) |
| `GenStep_ElevationFertility` / `_Terrain` / `_Scatterer` | `RimWorld\`, `Verse\` | grid producer → grid consumer → thing placement |
| `TileMutatorWorker(Def)` | `RimWorld\` | per-tile variety (lakes, cliffs) hooking between steps |
| `BaseGen` + `SymbolStack` + `SymbolResolver` (118) | `RimWorld.BaseGen\` | the structure grammar engine |
| `SketchGen` / `Sketch` | `RimWorld.SketchGen\` | blueprint-in-memory: resolve a structure off-map, then stamp |
| `BiomeDef` | `RimWorld\BiomeDef.cs` | terrain-by-fertility, wildlife commonality, gen-step injection |

## Data flow

**World:** seed string → `StableStringHash` → per-layer ordered `WorldGenStep`s. Terrain builds a stack of
noise modules (Perlin, ridged multifractal, latitude curves), samples elevation/temperature/rainfall per tile,
and picks the best-scoring `BiomeDef` via its worker.

**Map:** seed = `HashCombine(world seed, tile hash)` — so the same tile always regenerates identically,
independent of visit order. The effective step list = generator def's steps ∪ biome `extraGenSteps` ∪ tile
mutators' steps, minus `preventGenSteps` — **map variety is data-composed**, not coded. Steps communicate
through a blackboard (`MapGenerator.data`): `ElevationFertility` writes float grids, `Terrain` reads them to
paint, scatterers read `UsedRects` to avoid collisions. Each step runs under
`Rand.PushState(HashCombine(seed, step.SeedPart))`.

**Structures:** a GenStep pushes a root symbol and calls `BaseGen.Generate()`: pop a symbol → find `RuleDef`
resolvers that `CanResolve` (min rect size) → pick one by weight → it pushes child symbols with their own
rects/params (settlement → pawnGroup + edgeDefense + rooms → furniture) → recurse until leaf resolvers place
real things. Capped at 100k iterations against runaway grammars.

## The two patterns — when each fits

**Ordered def pipeline:** whole-grid fields where later stages depend on earlier ones (noise → grids →
terrain → scatter). Adding content = adding a def. **Grammar expansion:** hierarchical, spatially recursive
structures — a base decomposes into rooms into furniture, rectangles subdividing with weighted variety. Rule
of thumb: fields and scatters → GenStep; nested layouts → BaseGen (or SketchGen when you want the blueprint
materialized first, then damaged/rotated/stamped). Ballpiece's island towns will eventually want the second.

## Determinism

One seed flows down by hash-combining at every level (world → tile → step → per-object sub-streams via a
monotonic generated-id counter). The per-step `SeedPart` constant (plus a collision counter) means inserting a
new step doesn't shift every later step's randomness — steps are seeded *independently*, not sequentially.
That's the subtle decision worth copying.

## Gotchas & clever bits

- The blackboard is static mutable state — cleared between runs, and steps must not assume ordering beyond
  their declared `order`. Works, but demands discipline; ballpiece can pass a context object instead.
- Both grammar engines refuse re-entrancy (`working` flag) — generation inside generation is a named hazard.
- Two-phase finalize: steps needing regions/rooms defer to `PostMapInitialized` after `FinalizeInit`.
- Biomes *injecting and removing* gen steps declaratively is the "content is data" principle applied to
  procedural generation itself.

## Go deeper

- `Verse\MapGenerator.cs` — step assembly, blackboard, seed-part logic: the heart, read first.
- `RimWorld.Planet\WorldGenStep_Terrain.cs` — the noise-module cookbook.
- `RimWorld.BaseGen\BaseGen.cs` + `SymbolResolver_Settlement.cs` — the grammar engine + a rich resolver.
- `RimWorld\GenStep_ElevationFertility.cs` → `GenStep_Terrain.cs` — a producer/consumer step pair.
- `RimWorld\TileMutatorWorker_Lake.cs` — a surgical between-steps mutation.
- `RimWorld\BiomeDef.cs` — what a biome declares.
