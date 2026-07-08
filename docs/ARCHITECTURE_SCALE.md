# Ballpiece — Scalability Architecture

How the foundation absorbs the full vision (`docs/design/`) as **content + small systems**, never rewrites.
Builds on the ECS-lite + factions + control foundation in `docs/ARCHITECTURE.md`. Patterns are the
industry-standard ones for content-heavy action-RPGs (see **References**).

---

## 0. Five load-bearing principles

1. **Content is data, code is generic.** Every fruit, weapon, style, haki, potential, item, recipe, ship
   part, cannon, faction, event, creature, zone, race, mount, ability, effect is a **Definition** in a typed
   **Registry**. Systems operate over registries; adding content = adding a data entry. *(Data-driven design /
   ScriptableObject pattern.)*
2. **Definition vs Instance.** `WeaponDef` (static: base stats, vfx) ≠ `WeaponInstance` (runtime: rolls,
   durability, upgrades, enchants). Defs are shared & immutable; instances are per-entity. Same for every kind.
3. **One combat engine (GAS-lite).** Attributes + Abilities + Effects + Tags. The *four combat layers* don't
   each get bespoke code — they all **grant abilities + passive modifiers + tags** into this single engine.
4. **Composition over inheritance.** Characters, ships, mounts, creatures, bosses are all entities = bags of
   components. A ship is a hull + parts; a Zoan form is a swapped component set.
5. **Decoupled by events & tags.** Discrete signals via the typed `EventBus`; conditions/states/immunities
   via hierarchical **Gameplay Tags**. No system reaches into another's internals.

---

## 1. Content Registry (the spine for "many contents")

```ts
type ContentId = string;                       // 'fruit.gomu', 'weapon.cutlass', 'haki.armament'
interface Def { id: ContentId }
class Registry<T extends Def> {
  register(def: T): void;
  get(id: ContentId): T;            // throws if missing (fail fast)
  all(): T[];
  filter(pred): T[];
}
```
- One registry per content family: `Fruits`, `Weapons`, `FightingStyles`, `HakiAbilities`, `CombatPotentials`,
  `Abilities`, `Effects`, `Items`, `Materials`, `Recipes`, `Blueprints`, `Cannons`, `ShipHulls`, `ShipParts`,
  `Factions`, `Races`, `Mounts`, `Creatures`, `Zones`, `LandEvents`, `SeaEvents`.
- Defs live in `defs/<family>/*.ts` (one file per entry or grouped), registered at boot. A designer adds a
  fruit by dropping a file — zero system edits. (Later: load from JSON/data tables for hot-tuning.)
- IDs are namespaced strings → stable saves, debuggable, moddable.

---

## 2. Combat engine = GAS-lite (the moat, build first)

Four sub-systems, each generic and data-driven. This is where the four layers converge.

### 2.1 Attributes (`AttributeSet` / `StatBlock`)
- Base stats: **Health, Endurance, Defense, Willpower, Luck, Spiritual** (+ Haki tiers). Derived:
  stamina/haki pools, move speed, **power tier (-F…SSS+)**.
- `StatBlock` = base values + a list of **Modifiers**; `get(stat)` recomputes on demand (or caches+dirties).
- *Implemented* (`combat/attributes.ts`): tier seeds the six; `health→maxHp`, `endurance→maxStam`,
  `defense→def` via linear factors, re-derived on attribute change (not live). `atk`/`atkSpeed` stay tier
  magnitudes — deliberately no attack attribute (damage belongs to weapon/style/tier). Willpower/Luck/
  Spiritual are reserved (posture/CC resist, crit/drops, haki pool). Per-unit spreads: `UnitDef.attributes`.

### 2.2 Modifiers (stacking, source-tracked) — *validated industry pattern*
```ts
type Op = 'flat' | 'addPct' | 'mulPct' | 'override';
interface Modifier { stat: StatId; op: Op; value: number; source: string; }
// eval order: base → +flat → ×(1+Σaddpct) → ×Πmulpct → override
// removeBySource(src)  — drop all mods from an unequipped weapon / expired buff / removed potential
```
Sources: gear, devil fruit, haki, fighting style, **Combat Potentials**, race, buffs/debuffs, mounts, zone.

### 2.3 Gameplay Tags (hierarchical conditions)
`state.logia.intangible`, `haki.armament.active`, `cc.feared`, `fruit.type.zoan`, `weapon.class.heavy`,
`mode.ship.battle`. Drive immunities, counters (Armament tag bypasses Logia intangibility — *Haki counters
fruits*), ability requirements, and AI reads. A `TagSet` per entity (add/remove/has, prefix queries).

### 2.4 Abilities & Effects
- `AbilityDef`: cost (stamina/haki), cooldown, cast/active windows, granted tags, required tags, the
  **Effects** it applies. Granted by any layer (fruit moveset, weapon, style, cross-class loadout).
- `EffectDef`: **instant** (damage/heal), **duration** (buff/debuff/DoT), **infinite** (passive). Carries
  Modifiers and/or Tags; stackable; source-tracked; `onApply/onTick/onExpire`. (Mirrors hivyss effect
  lifecycle + the 7-phase damage pipeline — reusable here.)
- Resolution: an `AbilitySystem` (activation, cost, cooldown, cast) + `EffectSystem` (tick/expire) feeding a
  damage pipeline. Knockback/combo from the current `CombatSystem` become abilities/effects.

### 2.5 The four layers → engine (no bespoke code)
| Layer | Contributes |
|-------|-------------|
| Devil Fruit (`FruitDef`) | a moveset (Abilities) + passive Modifiers + tags (`fruit.type.*`, logia intangible) |
| Haki (`HakiDef`) | toggle/active Abilities + Modifiers + tags (`haki.armament.active` → bypass/counter) |
| Weapon class (`WeaponDef`) | base attack Ability + class Modifiers + `weapon.class.*` tag |
| Fighting style (`StyleDef`) | mobility/combo Abilities (Flash Dash, Geppo) + Modifiers |
| Combat Potential (`PotentialDef`) | a bundle of Modifiers (the "poster") |

Equipping = registering that def's modifiers (by source) + granting its abilities. Unequipping =
`removeBySource`. **That's the whole extensibility story for combat.**

---

## 3. Component additions (extend current ECS)

Built now is `transform/mover/health/faction/attacker/ai/render/avatar/control/crew/npc/loot/item`.
Add as features land (all optional, composable):

`attributes` (StatBlock) · `tags` (TagSet) · `abilities` (granted + loadout slots + cooldowns) ·
`effects` (active EffectInstances) · `equipment` (weapon/fruit/haki/style/potentials refs) ·
`inventory` (items/materials) · `progression` (talent/dex tracks + stat/haki/talent points) ·
`reputation` (per-faction score) · `race` (def ref) · `rideable`/`riding` (mounts/ships) ·
`shipHull`/`parts` (ships) · `harvestable` (gather nodes) · `bounty` · `powerTier`.

The hero's current `avatar` (stam/combo/cd) folds into `attributes` + `abilities` as combat matures.

---

## 4. Domain → pattern map

| Domain | Pattern | Notes |
|--------|---------|-------|
| Devil Fruits / Haki / Weapons / Styles / Potentials | **Registry defs → GAS-lite** | §2 — abilities + modifiers + tags |
| Stats / power tier | **Attributes + Modifiers** | §2.1–2.2; tier derived from attributes |
| Races | **Modifier bundle + tags** (def) | like Potentials, plus race-gated abilities |
| Class system | **WeaponClassDef + ability loadout** | classless-with-loadout, cross-class slots |
| Progression / talents / dexes | **Independent XP tracks** (`progression`) | non-linear; caps in data |
| Items / materials / recipes / blueprints | **Registry defs + `inventory`** | Def vs Instance for upgrades/enchants |
| Crafting / blacksmithing / market | **Generic systems over recipe defs** | consume materials, emit items |
| Open world / islands | **One seamless chunked sea** (tiered ticking) | zones are data over a continuous ocean; see §5 |
| Ocean zones / hazards | **`ZoneDef` + HazardSystem** | climate, hazard set, tier gate, spawn tables |
| Buildings / walls / doors / trees | **StructureDef + per-grid occupancy index** (built) | entities on the two-layer grid (`ARCHITECTURE.md §5`); door state on the component; HP/destructibility = add `health` + a damage path at the trigger below |
| Ships / parts / cannons | **Composite entity + part components** | naval combat reuses GAS-lite engine; ship WEAK-POINTS (mast/helm/hull breach) = structures ON the deck grid taking damage — emerges from the structure layer, no bespoke system |
| Ship modes | **FSM** (exploration ↔ battle) | swaps active ability/control set |
| Land & sea events | **Event Director + `EventDef`** | proximity triggers, Adventure-Dex tiering |
| Factions | **Data-driven relations matrix** (built) | `docs/ARCHITECTURE.md §11` |
| Reputation | **Per-faction score → relation modifier** | persists; gates stance/missions |
| AI (grunts → bosses → squads) | **Brain Strategy: FSM → BT/Utility/HTN** | one interface, swap brains |
| Wildlife / creatures | **CreatureDef + spawn tables by zone/depth** | hunted for materials |
| Mounts / vehicles | **`rideable`/`riding` + speed modifier** | ships are the sea analog |
| Save / progression | **Serializable component snapshot** | §6 |

---

## 5. World streaming & the Event Director

- **World = ONE SEAMLESS SEA, chunked** (decided 2026-07, superseding the earlier region-scene idea: scene
  transitions are incompatible with the sailing moat — no weather gauge or cross-zone chase through a loading
  screen). Chunks tick in TIERS — **active** (full sim) / **nearby** (reduced) / **distant** (frozen or
  abstract via the Event Director). Zones (`ZoneDef`: climate, hazards, tier gates) are DATA painted over the
  continuous sea, not scenes; crossing a zone boundary changes numbers, never screens. Chunk-proof invariants
  already in place: all grid reads via the TileGrid/Collision facade; Uint8-ready ordinals; the structure
  layer is a per-grid REBUILDABLE index over serializable `structure` components (a chunk reloads by
  re-placing its entities); worldgen a pure fn of the seed (becomes per-chunk pure at the trigger); absolute
  f64 world coords; plain serializable components. PERSISTENCE lands BEFORE chunking (an unloaded chunk's
  state must live somewhere).
- **Event Director** (L4D-AI-Director style): each tick over the active region, it weighs `EventDef`s by
  Adventure-Dex tier, active factions, region, and player power, then spawns encounters by proximity and
  resolves rewards + reputation deltas. Events never hardcode placement.

## 6. Persistence

Progression, equipment, inventory, reputation, dexes, bounty, ship loadouts, and world flags are
**serializable component snapshots** keyed by stable `ContentId`s. A `SaveSystem` writes/reads a plain JSON
blob (localStorage now, server later). Defs are never saved — only ids + instance state.

## 7. AI scaling

The `Brain` interface stays; complexity grows by swapping implementations:
`FsmBrain` (grunts) → `UtilityBrain` (smart enemies) → `BehaviorTreeBrain` (bosses, multi-phase) →
squad/`SquadBrain` coordinating faction crews (war events). Mesh-form bosses = entities that merge component
sets at runtime. Spatial queries already sit behind `SpatialQuery` (swap for a grid at scale).

## 8. Folder additions (when built)
```
src/
  combat/    Stat.ts  Modifier.ts  Tags.ts  Ability.ts  Effect.ts  pipeline.ts
  core/      Registry.ts
  defs/      fruits/  weapons/  styles/  haki/  potentials/  items/  recipes/
             ships/  cannons/  zones/  events/  creatures/  races/  mounts/
  world/     RegionGraph.ts  ZoneDef.ts  HazardSystem.ts
  systems/   AbilitySystem.ts  EffectSystem.ts  EventDirector.ts  CraftingSystem.ts
             ProgressionSystem.ts  SaveSystem.ts
  ship/      ShipMode.ts  NavalCombat.ts
```

## 9. Build order for the foundation (combat first, per direction)
1. **Registry** (generic) + **Stat/Modifier** + **Tags** — pure logic, unit-tested. ← *start here*
2. **Ability + Effect** contracts + `AbilitySystem`/`EffectSystem` skeleton; port the current punch/dodge into
   it as the first abilities/effects.
3. **Equipment**: wire one `WeaponDef` + one `FruitDef` + one `StyleDef` + one `PotentialDef` through
   equip → modifiers/abilities/tags. Prove the four-layer stack end-to-end with a single example each.
4. **Power tier** derivation from attributes.
5. Then breadth: more content defs, then world/zones, ships, events, economy — each just data + a small system.

## 10. Golden rules (avoid the rewrite traps)
- No `if (fruitName === 'gomu')` — behavior comes from the def's abilities/effects, not branches.
- No stat math scattered in systems — only the Attribute/Modifier system computes stats.
- No hardcoded content lists — iterate registries.
- No privileged player code — every character uses the same stack (the Moat; `docs/ARCHITECTURE.md §11.2`).
- Log any silent cap/truncation (spawn limits, loot caps) — never fail silently.

## 11. Scaling roadmap — load-bearing pillars (retrofit-risk ordered)

At full scope (the whole story, interact-with-anything), the architecture's one job is to **make content
nearly free and avoid retrofits.** §0–§2 (data-driven + GAS-lite + composition) are the right, proven
foundation — keep them. Below are the pillars that are **expensive to add late**: design each *before* it's
load-bearing, even as a stub. Everything NOT listed (fruits, weapons, styles, enemies, items, abilities,
animations, swing motions) is **just data** — added forever once these exist. Don't pre-build content; build
the engines that make content cheap.

| # | Pillar | Proven pattern (game) | Seam in current code | Build when |
|---|--------|-----------------------|----------------------|-----------|
| 1 | **Content as EXTERNAL data + def inheritance** | RimWorld **Def / DefDatabase + XML `ParentName` inheritance + abstract base defs**; Necesse data-loaded content | `core/Registry` already *is* the DefDatabase — feed it from JSON/data files + add def-inheritance (a "base cutlass" extended by variants) + boot-time schema validation, instead of hardcoded `.ts` | **now** — unblocks all content, cheap today |
| 2 | **Persistence w/ reference resolution + versioning** | RimWorld **Scribe** (`LoadReferenceable`: save an id, re-link refs on load) + save version + migration | each component gets serialize/deserialize; entities keyed by stable id; cross-entity refs (crew, ownership, AI target) saved as **ids**, re-linked on load. Extends §6 | **early** — before the world holds state; retrofitting save into a live game is a rewrite |
| 3 | **Generic interaction system (verbs/affordances)** — the "interact with anything" spine | RimWorld designators/jobs; **Caves of Qud** part-driven verbs | generalize the current E-to-interact (pickup / door / ship board) into an `interactable` component that *lists verbs* (talk, open, harvest, use, board, read, sit); one `InteractionSystem` resolves them — the **Moat for interaction**, never a per-object `if` | **soon** — it's the literal core of "anything is interactable" |
| 4 | **Sim-LOD: tiered ticking + region streaming** | RimWorld **TickRare / TickLong** (cheap things tick every 250–2000 frames); Factorio / Necesse **chunk streaming** + fixed timestep | a tick scheduler (per-system cadence) + active-region streaming (§5) + the spatial grid (§7); distant / off-region entities freeze or slow-tick. Fixes the linear `world.with` scans at scale | **when entity counts / world size climb** (after the 2nd island) |
| 5 | **Quest / flag / dialogue engine** — the "story" pillar (biggest current gap) | OSRS **varbits / varps** (a world-state flag store) + quest state machines; RimWorld **Storyteller / Incidents** (pacing); dialogue trees | a serialized `WorldState` flag store (saved by #2) + `QuestDef` (graph of steps gated on flags) + a dialogue system, paced by the Event Director (§5). The story is **authored on top of** this engine, not coded | **at the first real quest / arc** |
| 6 | **AI: jobs/tasks + behavior trees + schedules** | RimWorld **ThinkTree → Job → Toils** (a coroutine-like action sequence) + pawn **schedules** (daily routines); Kenshi NPC depth | the `Brain` strategy already swaps (§7); add a Job/Task decomposition *under* the brain + a `schedule` component for routines | **when NPCs need non-combat depth** |

**The senior rule:** build *engines, not content*; design the un-retrofittable pillars (**1, 2, 3**) early
even as stubs; ship **one arc fully playable** before widening. "Interact with anything" means *the verb
system supports it generically + sim-LOD keeps it affordable* — never "everything simulated at once." Match
rigor to leverage: a pillar that touches every future system earns heavy machinery; a one-off doesn't.

---

## References (industry-standard patterns this mirrors)
- **Unreal Gameplay Ability System** — Abilities + Attributes + Effects + Tags; data-table-driven, scalable
  RPG combat. https://dev.epicgames.com/documentation/en-us/unreal-engine/gameplay-ability-system-for-unreal-engine ·
  https://github.com/tranek/GASDocumentation
- **Data-driven design / ScriptableObject pattern** — Definition vs Instance, lookup registries, designer-editable
  content. https://gamineai.com/blog/scriptableobjects-and-data-driven-design-in-unity
- **Stat modifier systems** — flat→additive→multiplicative ordering, source tracking / removeBySource.
  https://github.com/meredoth/Stat-System ·
  https://refreshertowelgames.wordpress.com/2024/02/17/how-to-comfortably-deal-with-modifiable-stats/
- **RimWorld** — the canonical data-driven content + deep-sim model: **Def system + DefDatabase + def
  inheritance**, **Comp** composition, **Hediff** modular effects, **ThinkTree → Job → Toils** AI,
  **Storyteller/Incidents** event pacing, **Scribe** reference-resolving save, **TickRare/TickLong** sim-LOD.
  https://rimworldwiki.com/wiki/Modding
- **OSRS** — massive content via data + a **varbit/varp** world-state flag store driving quest state machines.
  https://oldschool.runescape.wiki/w/Varbit
- **Factorio** — fixed-timestep deterministic sim + update groups + chunk streaming (scaling a huge live world).
  https://factorio.com/blog/post/fff-364
- **Caves of Qud** — part/blueprint-driven entities + generic interaction verbs (anything is interactable).
