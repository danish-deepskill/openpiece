# Ballpiece — Architecture (fresh build)

**This is a clean rebuild, not a port.** The old `grand_voyage.html` is kept **only as a behavioral
reference** (what the game does — mechanics, feel, content). None of its code structure carries over; we
write fresh code designed for the architecture below.

Reference for *tooling & conventions only*: `C:\Files\Phaser\hivyss` (Phaser/TS/Vite setup, typed
EventBus, registry-for-HUD, pooling). We do **not** copy hivyss's lane-battle structure — different genre.

---

## 1. Genre & target

**Top-down, real-time action-RPG with a directly-controlled hero, a recruitable & commandable crew, and
sea traversal between islands.** Closest analogue: **Necesse** (RimWorld is a partial cousin for the
recruit/command + data-driven-content DNA).

**Direction (confirmed): action now, sim-ready.** Build the action core, but structure Defs + AI + the
component model so RimWorld-style depth (jobs, needs, autonomy) can be layered later *without a rewrite*.

**Entity layer (confirmed): lightweight hand-rolled ECS / component composition** (miniplex-style) —
readable, KISS, easy to grow. No heavy ECS framework yet (we can swap component storage for bitECS-style
typed arrays later if profiling demands; spatial queries are already behind one API for that reason).

---

## 2. Why ECS-lite (not OOP inheritance, not a lane substrate)

This genre recombines behaviors: a **crew member** = mover + health + faction + follower-AI + melee;
an **enemy** = mover + health + faction + chase-AI + melee + loot; the **boat** = vehicle + rideable +
mover; an **NPC** = mover + wander-AI + dialogue (+ recruitable). Inheritance forces these into a brittle
tree; **composition** lets each entity be a bag of components and lets **systems** own behavior. This is
the documented direction for content-recombining games (Unity DOTS, Unreal Mass, DOOM Eternal; bitECS even
underpins Phaser 4). The forums' honest caveat — ECS shines when content is *data-driven and recombines*,
which is exactly us.

---

## 3. Tech stack (from hivyss conventions)

| Concern   | Choice                                                  |
|-----------|---------------------------------------------------------|
| Engine    | Phaser **3.90**, **Canvas** renderer                    |
| Language  | **TypeScript** (fully strict — `strictNullChecks` ON)   |
| Build     | **Vite 5**                                              |
| Tests     | **Vitest** — pure logic only (ECS, collision, AI, defs) |
| Art       | **Procedural Graphics** draw fns — no sprite assets     |
| Resolution| Fixed **1280×720**, `Scale.FIT` + `CENTER_BOTH`         |

> Phaser `Graphics` supports `fillCircle/fillEllipse/strokeEllipse/fillRect/arc/lineBetween/fillStyle/
> lineStyle`. **No** `ellipse()` or `quadraticCurveTo()`.

Everything under `app/` so repo root stays clean.

---

## 4. Folder structure

```
ballpiece/
  docs/ARCHITECTURE.md          # this file
  docs/DESIGN_PATTERNS.md       # the coding-standards canon (SOLID/naming/boundary rules) — PRs review against it
  docs/references/grand_voyage.html  # reference ONLY (behavior spec); not built upon
  app/
    index.html  package.json  tsconfig.json  vite.config.ts
    src/                        # SIM folders (ai/combat/core/defs/ecs/world) are Phaser-free —
      main.ts                   #   enforced by test/architecture.test.ts (headless-server ready)
      config/
        constants.ts            # TILE/MAP sizes, SIM_DT, combat-feel consts, RegKey, HUD view-model types
        GameConfig.ts           # Phaser.Game config + scene list
      core/
        EventBus.ts             # typed event bus (singleton `events`) incl. the fx: channel
        Rng.ts                  # seeded mulberry32 streams (worldgen/ai/combat) — sim determinism
        math.ts                 # clamp, dist, norm, segDist, angleDiff, smoothFactor, cosmetic rand
        Registry.ts             # typed content registries (+ parent inheritance, boot validators)
        Pool.ts                 # generic object pool (presentation churn)
      ecs/
        World.ts                # entity store + NARROWED queries (world.with<K>(...) proves components)
        components.ts           # Component data interfaces (plain, serializable) + Components union
        Spawner.ts              # sim-side factory: spawnHero/spawnUnit/spawnPickup/spawnShip from Defs
      defs/                     # content rows: units, bodies, factions, aiProfiles, layers, ships,
        ...                     #   accessories (BASE_KIT lives in units.ts) — data only, no bundler imports
      combat/                   # GAS-lite engine: Ability, Effect, StatBlock, Modifier, TagSet, PowerTier,
        ...                     #   swing (motion registry + shared geom), equip, stamina, targeting, apparel
      ai/
        Brain.ts                # Brain interface { think(e, ctx, dt) } + minimal AIContext
        FsmBrain.ts             # generic finite-state-machine brain
        brains.ts               # actorBrain — ONE profile-driven brain for every actor (the Moat)
        perception.ts           # vision cone / peripheral / blind-arc checks
      world/
        TileGrid.ts             # tile data + walkable(mode) + terrain speed
        WorldGen.ts             # seeded two-island gen -> TileGrid + placements (pure fn of the seed)
        Collision.ts            # circle-vs-tile move resolve (canOccupy/tryMove)
        Pathfinder.ts           # grid A* + line-of-sight
        SpatialQuery.ts         # nearest()/within() neighbor queries (swap-in grid later)
      systems/                  # sim systems are Phaser-free; presentation systems take `scene` FIRST
        InputSystem.ts          # (presentation boundary) input -> the controlled entity's intent/abilities
        AISystem.ts             # runs each ai.brain.think()
        MovementSystem.ts       # integrate movers via Collision (fixed SIM_DT steps)
        MeleeSystem.ts          # moving-hitbox contact resolution (shares swing geom with the render)
        AbilitySystem.ts        # the single attack path: costs, cooldowns, swings, launches
        StrikeResolver.ts       # (service) a confirmed hit -> damage/combo/stun; Damage.ts applies it
        BodyCollisionSystem.ts  # body-vs-body shove (mass-weighted)
        CombatantSystem.ts      # stamina delayed-regen, combo decay, hitstun
        EffectSystem.ts / SquadSystem.ts / ShipSystem.ts / DoorSystem.ts / DialogueSystem.ts
        InteractionSystem.ts    # generic verb engine (talk/take/board/disembark)
        GameDirector.ts         # game state, objectives, death cleanup, possession
        RenderSystem.ts         # (presentation) OWNS the Graphics side-table; render components are data
        FxSystem.ts / NameplateSystem.ts / AccessorySystem.ts / DebugOverlay.ts   # (presentation)
      draw/                     # (presentation) procedural draw fns + DrawFn type + world renderers
        actorDraws.ts / shipDraws.ts / TerrainRenderer.ts / SeaRenderer.ts / DoorRenderer.ts
      scenes/
        BootScene.ts            # asset manifest (import.meta.glob) -> launch World + Hud
        WorldScene.ts           # composition root; fixed-timestep sim loop (stepSim); publishes registry
        HudScene.ts             # canvas HUD + minimap; reads registry
```

---

## 5. The ECS-lite model

**Entity** = `{ id, <componentName>: data, ... }` (plain object, component-as-key). **World** stores
entities and answers `world.with('transform','mover')` → entities having all those components (miniplex
style). Structural changes (add/remove component/entity) are cheap; queries iterate a small live set.

**Components** (data only — `ecs/components.ts`). Action-core set, named so sim concepts slot in later:

| Component        | Fields (data only)                                            | Notes |
|------------------|---------------------------------------------------------------|-------|
| `transform`      | x, y, angle, r (collision radius)                             | |
| `mover`          | vx, vy, speed, mode:'foot'\|'boat', dodge{t,vx,vy,iframes}    | movement intent |
| `health`         | hp, maxhp, dead, hitFlash, iframes                            | |
| `faction`        | id:FactionId                                                  | hostility via relations matrix (§11), never team checks |
| `attacker`       | dmg, range, arc, cd, atkCd, knockback                        | melee/ranged |
| `ai`             | brain:Brain, bb:Blackboard (state, target, timers, home)     | behavior via Strategy |
| `render`         | gfx:Phaser.Graphics, draw:DrawFn, hpColor, visual state      | |
| `avatar`         | stam, abilities/cooldowns, combo, hasFruit                   | controllable-character resources — **any** char, not "the player" |
| `control`        | tag {}                                                        | the entity human input drives; move it to possess another (§11) |
| `crew`           | stance:'follow'\|'hold', slot, cmd{attack,t}                 | |
| `npc`            | dialogue:string[], recruit?:{name,hp,dmg}                    | |
| `loot`           | gold                                                          | drop on death |
| *(reserved)*     | `inventory`, `needs`, `job`, `rideable`, `vehicle`, `reputation`, `devilFruit`, `haki`, `rank` | sim / One Piece — not built yet (§12) |

**Boundary:** gameplay actors live in the ECS. **Transient FX (particles, damage text, swing arcs,
corpses) do NOT** — they churn every frame and are pure presentation, so `FxSystem` keeps them in
`Pool`s. Keeps the ECS clean and allocation-free in the hot path.

---

## 6. AI abstraction (FSM now → behavior-tree/jobs later)

The sim-ready hinge. AI is a **Strategy** behind one interface:

```ts
interface Brain { think(e: Entity, ctx: AIContext, dt: number): void } // mutates intent / queues actions
```

- Now: `FsmBrain` (a state table: per-state `update` + `transitions`). `brains.ts` defines
  ONE `actorBrain` drives every actor (wander→chase→flee), with all per-unit personality as `AIProfileDef`
  data (the Moat: villager, wildlife, and boss differ by profile row, not by brain). AISystem calls `brain.think()`.
- Later: a `BehaviorTreeBrain` / `UtilityBrain` / `JobBrain` implement the **same interface** and drop in
  per-entity with zero system changes — the RimWorld-depth path.

Neighbor queries (target-finding, separation) go through `SpatialQuery` (linear scan now; swap for a
spatial hash when entity counts climb — single chokepoint).

---

## 7. Engine conventions (from hivyss)

- **Typed `EventBus`** (`core/EventBus.ts`, `GameEvents` in components/types) for discrete events
  (`enemyKilled`, `crewRecruited`, `notify`, `stateChanged`, `dialogueOpen`…). Compiler-checked; decouples
  HUD/overlay from sim. Not Phaser `scene.events` (lifecycle only).
- **Registry** for continuous HUD state: `WorldScene` publishes per frame (hp, stamina, gold, crew, ability
  cooldowns, objective, enemies-left, minimap dots, state); `HudScene` reads.
- **Multi-scene**: `BootScene` → `WorldScene` (sim/world) + `HudScene` (parallel canvas overlay). Start/help
  is a **DOM overlay** toggled via EventBus (`ui/overlay.ts`).
- **Pooling** for FX. **Depth banding** in `constants.ts`; actors set `depth=y` for top-down sort. Camera
  via Phaser `startFollow` + `shake()`.
- **Data-driven Defs** (`defs/`): content (actors, abilities, level) is data; systems are generic.

---

## 8. Frame loop (WorldScene.update → GameDirector → systems, fixed order)

```
doors → input → squads → AI → movement → body-collision → ships → melee → abilities → combatant → effects → director (fixed SIM_DT steps), then presentation: sea/dialogue/fx/render/accessories/nameplates
→ (WorldScene publishes registry)
```
dt clamped (≤ 1/30). `GameDirector` gates updates by game state and owns win/lose/respawn + objectives.

---

## 9. Feature parity checklist (from the reference prototype)

- [ ] World: 86×54 two-island map (home + enemy), water/grass/sand/dock, docks; baked terrain + minimap.
- [ ] Hero: WASD move, mouse aim, dodge-roll (i-frames + stamina), hp/stamina regen.
- [ ] Combat: melee cleave; devil-fruit unlock → Gomu Pistol / Gatling / Rocket. Knockback, combo, hit-flash.
- [ ] FX (pooled): particles, floating damage numbers, swing arcs, corpses, screen shake.
- [ ] Devil-fruit pickup at the great tree → ability unlock.
- [ ] Crew: hire from tavern NPCs; follow/hold (`F`), attack order (`Q`); follow-formation + separation.
- [ ] NPCs: villager wander + tether + dialogue; recruitable pirates.
- [ ] Enemies: grunts + boss captain; chase/idle/wander, tether-to-spawn, attack cd; gold drop.
- [ ] Boat: board/leave + sail (simple parity now; redesign → `features/big-walkable-ship.md`).
- [ ] HUD: hp/stamina, ability cooldowns, gold, crew + stance, enemies-left, combo, objective, notifications,
      minimap.
- [ ] Flow: start/help overlay, pause, death+respawn at home, win on clear.

---

## 10. Build order (each step runnable)

0. **Tooling + boot** — Vite/TS/Phaser; `BootScene`→`WorldScene` renders baked terrain. *(pixels on screen)*
1. **ECS + hero** — World/components/spawn; `transform/mover/render`; `InputSystem`+`MovementSystem`+
   `Collision`+`RenderSystem`; hero walks the islands. **← vertical slice target (DONE)**
2. **Combat** — enemies via `actorBrain`(FSM); `MeleeSystem`+`AbilitySystem`; `FxSystem`; `HudScene` bars. **(DONE)**
3. **Crew & NPCs** — recruitment + crew command (the squad/verb seams exist; crew system pending).
4. **Abilities** — devil-fruit unlock; pistol/gatling/rocket as `AbilityDef`s.
5. **Boat** — board/leave/sail (parity).
6. **Flow & polish** — overlay/pause/dead/win, objectives, minimap, notifications.
7. **New feature** — big walkable ship (`features/big-walkable-ship.md`).

---

## 11. Factions & control — the scalability spine

Two decisions keep the design open-ended instead of painting us into a corner.

### 11.1 Data-driven factions (no `Team` enum)
`faction` holds a `FactionId` (`defs/factions.ts`); hostility is resolved through a **relations matrix**:

```ts
factions.isHostile(a, b)   // explicit per-faction stance > faction default > 'neutral'; self === 'ally'
```

Targeting, separation, win conditions, HUD colors — all ask the matrix, never `team === 'enemy'`. Adding
the **World Government, Marines, Revolutionary Army, Cipher Pol, or individual pirate crews** is a data
entry, not a code change. Defined today: `straw_hat`, `bandits`, `civilians` (used) + `marines`,
`revolutionary`, `worldgov`, `pirates` (declared, awaiting content). Per-character allegiance shifts =
swap the `faction` component.

### 11.2 Control is a component (the Moat)
**The player is not special.** Every character runs the identical component/system stack. The only thing
that makes one "the player" is the `control` tag:
- `InputSystem` drives `world.first('control')`.
- `AISystem` skips whoever holds `control`.
- `GameDirector.possess(entity)` moves the tag to **any** entity (granting a default `avatar` if absent).

Possess a Marine, a villager, a rival captain → it plays exactly like the hero did. `avatar` (stamina,
abilities, combo) is generic controllable-character state, not "hero stats". This is the moat: a living
world of peers, any of which you can become.

> Possession TODO when surfaced as gameplay: re-point `camera.startFollow` at the new body (one line).

---

## 12. One Piece feature roadmap (headroom, not yet built)

All expressible as components + Defs + brains/abilities on the existing spine — no rewrites:

- **Devil fruits** (Paramecia / Zoan / Logia) → `devilFruit` component + `AbilityDef`s + an effects system
  (the hivyss ability/effect lifecycle pattern). The current `hasFruit` → Gomu kit is the seed.
- **Haki** (Observation / Armament / Conqueror) → `haki` component modifying combat resolution + AI
  (Observation = dodge/aim assist; Armament = damage/defense; Conqueror = AoE fear via a CC effect).
- **Bounties / reputation** → `reputation` component feeding faction-relation modifiers (Marines escalate
  with bounty; rival crews react).
- **Crews & ships** → `crew` membership + `vehicle`/`rideable` (the walkable-ship feature, §`features/`).
- **Marine ranks / hierarchy** → `rank` component + faction membership; squad AI via behavior-tree brains.
- **Sea / islands (Grand Line)** → multiple `LevelLayout`s + sailing between; weather/log-pose later.
- **Den Den Mushi, quests, trade** → event-driven systems over the EventBus.

The architecture's job is to make these **additions**, not surgeries. Factions (§11.1), control-as-component
(§11.2), data-driven Defs, the Brain strategy, and the typed EventBus are the load-bearing pieces that keep
them cheap.
