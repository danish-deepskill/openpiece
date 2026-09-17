# Openpiece — Design Patterns & Coding Standards (the canon)

> The house rules for **architecture, patterns, naming, and structure** — grounded in a full 6-dimension audit
> (types, coupling, naming, determinism, DRY, conventions) of the real codebase. Everything here is either
> already the de-facto style or was adopted in the standards overhaul. **PRs are reviewed against this doc.**
> Companions: `ARCHITECTURE.md` (what the systems are) · `ARCHITECTURE_SCALE.md` (how they scale) ·
> `references/EDGE_CASES.md` (per-system QA checklist) · `references/ARCHITECTURE_PATTERNS.md` (external reading).

---

## 0. Prime directives (everything else derives from these)

1. **Content is data; engines are generic.** Fruits/units/abilities/verbs are Def rows in Registries. A new
   thing = a new row, never a new branch. `if (name === 'gomu')` anywhere is a bug.
2. **The Moat: no actor is special.** Every unit runs the identical component/system stack; control is a
   component; friend/foe is faction data. Any rule split by "player vs NPC" is a bug (one input seam excepted).
3. **Sim ↔ presentation ↔ persistence stay separable.** The sim must run headless (Node server, Workers,
   tests) — **no runtime Phaser, no engine objects, no closures in sim data**. Presentation is a thin consumer.
   Persistence is serialize-by-ID plain data.
4. **Determinism is a feature.** Sim randomness comes from seeded streams; sim time advances on a fixed step;
   no wall-clock in sim. (Replay, server reconciliation, reproducible bugs.)
5. **Cost scales with the active area, not the world.** Culling, pooling, LOD, tiered ticks — the same idea at
   every layer. Don't pay per-map when you can pay per-screen.

## 1. Principles — SOLID / KISS / DRY / YAGNI, adapted to a data-driven ECS

- **S — Single responsibility:** one system = one job, stated in its class JSDoc (`MeleeSystem` owns only
  moving-hitbox geometry; the hit itself is `StrikeResolver`'s). If a JSDoc needs "and", split it.
- **O — Open/closed:** extend by **data or strategy-map entry**, never by editing engine branches. The four
  seams: a Def row (content), a strategy entry (`MOTIONS`, `draws`, `Verbs`, FSM states), a Modifier/Tag, an event
  listener.
- **L — Substitutability:** any entity may take any component; any brain may drive any body; a def with `parent`
  must behave like its parent + overrides. Nothing may downcast an Entity to "the player".
- **I — Small interfaces:** components stay minimal and single-purpose (presence-as-state beats flags); systems
  depend on the narrowest thing (a query, a service, an event) — not on WorldScene.
- **D — Dependency direction:** `scenes → systems → (ecs, combat, world, defs, core)`. Nothing in
  `core/`/`defs/` imports from `systems/`/`scenes/`. Sim never imports presentation; it **emits events** that
  presentation consumes.
- **KISS:** the simplest thing that respects the seams. Don't add a manager for one call site.
- **DRY — rule of three:** extract on the third occurrence, or on the second if divergence would be a bug
  (hitbox-vs-visual constants, sprint rules player-vs-AI — the Moat makes some pairs load-bearing). Do NOT dry
  two-off cosmetic similarities into premature abstractions.
- **YAGNI, amended: build seams, not features.** Don't build the strategic layer today; DO keep the boundary
  (events, fixed tick, IDs) that lets it plug in later. A seam is cheap; a retrofit is not.
- **Fail loud at boot:** registries validate on load (negative cooldown = crash at startup, not a weird
  mid-game bug). Content errors must not survive to gameplay.
- **Composition over inheritance — always.** No `Slime extends Enemy extends Sprite`. Behavior differences are
  data (Defs/profiles) or strategies; the one inheritance in the codebase is Def `parent` (data, not classes).

## 2. TypeScript canon

- **Compiler:** `strict: true` **with `strictNullChecks` ON**. Also `noImplicitOverride`,
  `noFallthroughCasesInSwitch`. Roadmap (staged, measured): `noUnusedLocals/Parameters`, then
  `noUncheckedIndexedAccess` before the typed-array migration (~76 errors, budgeted).
- **Forbidden:** `any`, `as any`, `@ts-ignore`, string index signatures on domain types (`[k: string]: unknown`
  was the Blackboard bug — type the contract instead).
- **Casts (`as`) policy:** only at (a) generic-machinery limits (World/Registry/EventBus internals — comment the
  TS issue), (b) engine boundaries (Phaser's untyped APIs). A cast inside sim logic is a smell; fix the type.
- **Non-null policy:** components proven by a `with(...)` query are non-null **via the generic query type**
  (`world.with('transform', 'mover')` narrows). Alias at loop top (`const t = e.transform`). Everywhere else:
  `?.` + `??`. A bare `!` requires a comment naming who guarantees it.
- **IDs are template-literal typed** (staged): `type AbilityId = \`ability.${string}\`` etc. — cross-family id
  mixups become compile errors. `ContentId` = the union.
- **Imports:** `import type` for type-only (mandatory across the sim/presentation boundary). No file imports
  Phaser at runtime unless it is presentation (enforced by `test/architecture.test.ts`).

## 3. Naming & structure

**Files:** PascalCase when the file's primary export is a class/type of that name (`Registry.ts`, `Spawner.ts`,
`MeleeSystem.ts`, `TagSet.ts`, `StatBlock.ts`); lowercase for multi-export function/data modules (`math.ts`,
`components.ts`, `brains.ts`, `constants.ts`, `bodies.ts`). Tests: kebab-case (`body-collision.test.ts`).
**No case-only renames** (Windows).

**Symbols:** types/classes PascalCase; Defs end in `Def`; Registry singletons are plural (`Abilities`, `Units`);
component interfaces are bare nouns (no `Comp` suffix); fields camelCase (`maxHp`, never `maxhp`); no shadowing
imported names (`dist` the fn vs `dist` a local); locals prefer the file's idiom (`d` for distances); `fx/fy`
reserved for the FX system, never vector components. Suffix rule: `*System` = stepped in the tick;
no suffix = injected service (`Damage`, `StrikeResolver`).

**ContentId grammar:** `<family, full-word, singular>.<camelCaseSlug>` — `ability.gomuPistol`,
`accessory.strawHat`, `unit.hero`. `ship.` is the umbrella for hulls; future families get their own
(`shipPart.`, `cannon.`). Asset filenames stay snake_case; the mapping goes through the def, never the id.
Registries validate id grammar at boot.

**Folders (the map + boundary):**

| Folder | Responsibility | Boundary |
|---|---|---|
| `core/` | Registry, EventBus, Rng, math, GameState, Pool | **SIM** (imports nothing above) |
| `defs/` | content rows (units, factions, profiles, layers, accessories…) | **SIM** (plain data; no bundler ASSET imports — external data-JSON parsed via `core/rows` is the one blessed import (pillar 1); images/audio stay presentation-side) |
| `ecs/` | World, components, Spawner | **SIM** |
| `combat/` | GAS-lite primitives + engines (Stat, Modifier, TagSet, Ability, swing, equip) | **SIM** |
| `ai/` | Brain contract, FSM, brains, perception | **SIM** |
| `world/` | TileGrid, Collision, Pathfinder, WorldGen, SpatialQuery | **SIM** |
| `systems/` | per-tick logic; sim systems Phaser-free, presentation systems marked | mixed (allowlist) |
| `draw/` | procedural draw fns + world renderers (Terrain/Sea) | PRESENTATION |
| `scenes/` | Boot/World/Hud — composition root + HUD | PRESENTATION |
| `config/` | constants (sim) + GameConfig/palette (presentation) | mixed |

Function-bearing strategy rows (`MOTIONS`, `Verbs`, `draws`) live **beside their engine** — they are code, not
data. Data-only rows live in `defs/`. (Abilities/Effects rows move to `defs/` with the external-data pillar.)

## 4. ECS canon

- `Entity = { id } & Partial<Components>`; `Components` is the closed roster (reserved slots documented).
- **Components are plain, serializable data.** No engine objects (a `Graphics` on an entity was the audit's
  biggest violation), no functions, no class instances except the blessed primitives (StatBlock, TagSet — which
  must expose serialize/rehydrate when persistence lands). Cross-entity references use **ids** at rest;
  in-memory object refs are allowed inside a tick but must be re-resolvable (`bb.quarry`).
- **Presence is state:** `melee` = "swinging now"; attach with assignment, detach with `delete e.melee`. Direct
  mutation is THE way (there is no add/remove API); snapshot-iterate (`[...world.with(...)]`) when the loop body
  can delete the queried component.
- **Queries narrow:** `with<K>(...)` returns entities with those components non-optional. Singleton lookups via
  `first('control')`.
- Identity facts (name, tier) live on `identity`, not on `render` — the server needs them; pixels don't.
- **Movement frames — reads are free, writes are owned.** `transform.x/y` is every body's WORLD PROJECTION,
  kept fresh by deck parenting — always safe to READ across frames (perception, reach, rendering, overlap).
  But position WRITES go to the frame that OWNS the position: `onDeck.lx/ly` aboard (through the deck
  colliders), `transform` ashore (through world Collision) — a transform write on a parented body is a DEAD
  WRITE, silently overwritten next tick. Corollary: any STORED spatial point (aim memory, roam spot, post)
  must name its frame (`perceivedFrame`, `roamShipId`, `homeShipId`) — a world-anchored point on a moving
  deck is a treadmill pointing at the stern. Systems act on bodies only WITHIN one frame unless they
  explicitly handle the seam (frames.ts handoffs, frameLeg); "exclude the deck" is not a valid answer once
  an invariant like "riders don't walk" dies (BodyCollisionSystem's ghost-bodies bug).

## 5. Systems canon

- Class + constructor injection, one dep per line, `private readonly`, empty body. **Presentation systems take
  `scene: Phaser.Scene` as the FIRST param — the scene-first signature IS the boundary marker.** Sim systems
  must be constructible with zero Phaser.
- **Uniform `update(dt)`** (or `update()` for per-frame stateless passes). No `tick()` aliases.
- **The canonical tick** (WorldScene, fixed-timestep): accumulate render delta; step the sim at `SIM_DT` inside
  `while (acc >= SIM_DT)`; presentation updates once per render frame after. Sim order (each dependency stated
  as an inline comment in code): wind (environment first — sails/streaks read this tick's weather) → doors →
  input-intent → squads → ai → movement → swim → body-collision → ships → hull-collision → melee → projectiles →
  abilities → combatant → effects → director. Reordering requires updating the comment chain.
  **Render interpolation** (the fixed step's other half — Fiedler): `ViewPose.capture()` before every step,
  `setAlpha(acc / SIM_DT)` after the loop; every system that PLACES something draws `view.x(e)/y(e)`, never the
  raw transform (DebugOverlay excepted — it draws the sim truth). A 120 Hz display gets 120 Hz motion from the
  60 Hz sim; presentation smoothing (the camera follow) is time-based like all other easing.
- **Sim never calls presentation.** FX go through typed events (`events.emit('fx:burst', …)`); FxSystem
  subscribes. HUD state goes through the registry (`publish()`), one write per frame.
- Services (`Damage`, `StrikeResolver`) are injected, not stepped; singletons are allowed only for stateless
  content/contracts (`events`, `factions`, Registries) — **anything holding per-run mutable state must be
  injected** (a headless multi-world server shares module singletons; it must not share worlds).

## 6. Data-driven canon

- One content family per `defs/` file: `XDef` interface + `new Registry<XDef>('X')` + `registerAll` rows, each
  row with a rationale comment. Shared defaults via `BASE`-spread; variants via `parent` inheritance; numeric
  ranges get a boot validator.
- **Lookup at point of use** (`Abilities.get(m.ability)`), never cache def objects on entities — serialize-by-ID
  is the norm. (Exception: `bb.profile` is a documented hot-path cache; re-resolve on load.)
- **Knobs live on defs, not in code:** per-unit AI behavior on `AIProfileDef` (tether, wander speed, charge,
  dash window…), per-ability combat on `AbilityDef` (cost, stun, shake, impulse duration…). A tuning literal
  inline in a system is only OK for one-engine geometry (steering shape), and then as a named local const.
- Base-kit and other cross-file content lists exist **once** (`BASE_KIT`), imported everywhere they're needed.

## 7. Events, state channels & communication

Three channels, never confused:
1. **Typed EventBus** — discrete one-off signals (`enemyKilled`, `fx:burst`). Payload is always an object.
   Never emit per-frame state. Every declared event has ≥1 emitter and ≥1 listener — dead event keys are deleted.
2. **Registry (`RegKey`)** — continuous HUD state, written once per frame in `publish()`, read by HudScene.
   Both ends share the same view-model types.
3. **Direct calls** — sim-internal, ordered by the tick. (No events between sim systems in the same tick — order
   must stay explicit.)

## 8. Determinism & time

- **Seeded RNG (`core/Rng.ts`, mulberry32):** named streams off one master seed — `worldgen`, `ai`, `combat`.
  Sim randomness ONLY through injected streams. Cosmetic randomness (FX jitter, wake spray) stays on
  `Math.random` **by design** — commented so nobody "fixes" it onto a sim stream (that would couple FX call
  counts to sim determinism). The master seed is save data; `Date.now()` is legal exactly once: creating it.
- **Fixed timestep:** sim advances in `SIM_DT` steps via an accumulator (clamped to avoid spiral-of-death).
  Never step the sim by raw render delta.
- **dt discipline:** all decay/lerp uses time-based forms — multiplicative decay is `Math.exp(-k*dt)` (or
  `Math.pow(f, dt*60)` to preserve tuned feel), smoothing is `1 - Math.exp(-dt/tau)` — never bare per-frame
  `x *= 0.9` or `Math.min(1, k*dt)` on sim state. Per-frame Bernoulli `Math.random() < k*dt` is cosmetic-only.
- **No wall-clock in sim.** `Date.now`/`performance.now` are presentation-only.

## 9. Rendering & presentation canon

- **Render component is pure data** (draw key string, colors, flags). `Graphics` objects and draw-fn pointers
  live in RenderSystem's private side-table keyed by entity id; RenderSystem creates them lazily and destroys
  orphans (no sim system ever calls `gfx.destroy()`).
- Draw fns are local-space, logic-free projections of components. **The drawn weapon IS the hitbox** — shared
  geometry (hand radius, swing geom) is exported from `combat/swing.ts` and consumed by BOTH MeleeSystem and the
  draws, so they cannot drift.
- Presentation colors live in `config/palette.ts` (one literal per meaning); tile colors have one source.
- HUD reads only `RegKey` + events. Accessories load via a presentation-side asset manifest — defs hold plain
  path strings, never bundler imports.
- **Render scale:** the canvas buffer is the logical 1280×720 × `RENDER_SCALE` (`config/render.ts`, presentation-only —
  it reads the window); every camera zooms by it, and Phaser text is created ONLY through `ui/text.addText` (it
  stamps the resolution; `test/render-text.test.ts` enforces the door). Screen-pinned text under a zoomed world
  camera inverts the camera transform (`DebugOverlay.pin`), never raw coordinates.
- **DOM panels:** UI that needs hover/drag/tooltips/scroll (the inventory) lives in the DOM (`ui/InventoryPanel`),
  fed a PURE view-model (`ui/inventoryView`) on change — never per frame — and speaking back ONLY in typed
  intents through InputSystem (queued, applied inside the sim tick; the SERVICE re-validates and names each
  refusal — `Items.apply` — so the contracts are tested headless). A DOM handler never touches a component; the
  panel would work unchanged over a wire.

## 10. Comments, docs & voice

- **Why, not what — and name the rejected alternative** ("roundPixels=false: true rounds the lerped scroll →
  ~1px jitter"). CAPS for the load-bearing word ("arrays are REPLACED"). Em-dash prose. `— Section —` dividers
  group def knobs.
- Class JSDoc = responsibility + its seam in the architecture. Def fields = unit + behavioral consequence
  ("reaction: aim-lag (s): it commits to where you WERE").
- Renames/moves update `ARCHITECTURE.md`'s tree **in the same commit** — stale docs are bugs.

## 11. Testing canon

- Pure Vitest over the headless sim — no Phaser in tests, ever. One small entity factory per test file
  (`makeFighter`), naming exactly the components under test; unused deps stubbed `{} as T` with a why-safe
  comment.
- `describe` = "Subject — behavior contract"; `it` = lowercase behavioral sentence; expected values carry their
  derivation (`// (9+6+2+5) × 1.15`).
- Every content family gets a **registry-sweep test** (every def's referenced ids resolve). Architecture is
  enforced by **`test/architecture.test.ts`**: sim folders must not runtime-import Phaser; the systems allowlist
  is explicit. Consult `references/EDGE_CASES.md` per system for what to cover.

## 12. Review checklist (run on every diff)

- [ ] New content = data row / strategy entry — no engine branches on ids or names
- [ ] Works for ANY actor (the Moat) — no player-special or enemy-special logic
- [ ] Sim files: no runtime Phaser, no engine objects/closures in components, no wall-clock, no unseeded sim RNG
- [ ] All time-based math scaled by dt (exp forms for decay/smoothing)
- [ ] Mutate → clamp → edge-trigger transition → publish (and the rest of EDGE_CASES ★ cross-cutting)
- [ ] Values with min/max clamped; NaN-safe ratios; ids compared, never hardcoded
- [ ] Position writes + stored spatial points name their FRAME (§4) — no transform writes on parented bodies,
      no world-anchored goals that should ride a deck
- [ ] `!` only where a query/guard proves it; no shadowed imports; naming per §3
- [ ] Events: discrete + typed + consumed; per-frame state via registry
- [ ] Tests updated (behavior contracts, registry sweeps); ARCHITECTURE.md tree still true
- [ ] `npm run typecheck` + `npm test` green
