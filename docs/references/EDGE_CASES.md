# Ballpiece — Edge-Case & Robustness Checklist

> The bugs that bite when you build/test each system — a QA + code-review checklist, **adapted to ballpiece's
> ECS + custom `Collision`** (NOT Phaser Arcade Physics). Use it as: (1) an audit of systems you have, (2) a
> landmine map before building roadmap systems, (3) a standing review list (the cross-cutting section).
>
> Status: ✅ ballpiece already handles this · 🔨 watch for it when you build this system · ⚙️ adapt to our custom
> collision/ECS (the source list assumes Arcade Physics). Source: an edge-case checklist for a TS/Phaser sandbox.

---

## ★ Cross-cutting (the standing code-review list — applies to *everything*)
- **Clamp after every mutation** — any value with a min/max; watch **NaN** from divide-by-zero in bars/ratios (`hp/maxHp`, progress bars). ✅ (Damage clamps)
- **Delta-time on anything time-based** — movement, decay, cooldowns, DoT, growth. Missing it = both "instant" *and* "jittery/too-slow" bugs. ✅
- **Overlap/trigger fires every frame** — pickups, gathers, doors, interactions, hits: guard so **one contact = one action** (flag, disable, or edge-detect). ✅ (`m.hit`, interaction-once)
- **Edge-trigger vs level-trigger** — death, quest-complete, construction-finish, harvest, guard-break: run **once on transition**, not continuously while the condition holds. ✅ (`health.dead`)
- **Value vs reference** — *copy* item/stat data when you mean a copy; don't share one object across slots/entities (duplication + double-consume bugs).
- **Correct id/type matching** — never hardcode/default a type; compare the **actual id** (the "everything is apples / gold gives wood" family). ✅ (data-driven defs)
- **Serialize plain data, rehydrate references** — sprites/functions/entity-links don't survive JSON; store **by id**, rebuild + rewire on load. *(= the persistence/reference-resolution architecture — cutlass/Shanks — `DEEP_SIMULATION.md §7`.)*
- **Order of operations:** mutate → **clamp** → check transition (death/complete) → update UI. Reordering causes "bar wrong" / "dies instantly". ✅ (`StrikeResolver`)
- **Null/destroyed refs** — in ECS, an entity ref held across frames may point at a dead/removed unit → guard (`e?.health?.dead`). ✅

---

## Systems ballpiece HAS (audit these)

### Health ✅ (mostly handled)
- Clamp both ends (never <0, never >max); heal can't overheal; damage can't wrap negative into a heal.
- HP bar updates on **every** change (damage, heal, max change, load); guard `maxHp = 0` → NaN.
- Death triggers **once** (not per-frame at 0 hp).
- Order: apply damage → clamp → check death → update bar.

### Movement ✅ ⚙️ (custom collision, not Arcade)
- Normalize diagonals (`norm()`) or they're ~1.41× fast. ✅
- Multiply by delta; reset intent each frame before reading input. ✅
- Screen-Y is **down-positive**; up = −Y. ✅
- Combine X *and* Y velocity (don't overwrite one axis → "only moves right").
- ⚙️ Solid vs passable, wall blocking, shoving, **fast-body tunneling** → these live in `Collision`/`MovementSystem` (circle-vs-tile, `mass`, `tryMove`), *not* Arcade bodies. Tunneling: watch dash/`dvx` at high speed vs thin walls.

### The continuous × tile SEAM ⚙️ (hybrid movement — where the two truths meet)
> Bodies are floats, the world is tiles (`../qna/movement-tile-vs-continuous.md`); every bug in this family
> is the two views DISAGREEING. Three relationships with the grid = three failure families — READ (label
> lookups), COLLIDE (enforcement), PLAN (search → steer handoff) — plus the dynamic-world drift family.
> Overhaul owner: `../design/PATHFINDING.md`; the AI side: `../design/ai/AI_FOUNDATION.md` §4.

**READS — the body asks the ground:**
- Straddling a boundary (the shoreline): any mode/label MUST come from ONE rule — the tile under the
  CENTER, read AFTER the move. Prediction/hysteresis "cleverness" was the whole swim/foot flicker family. ✅
  (`MovementSystem` mode rule)
- Read the TERRAIN, never the derived mode — a derived label is one tick stale by definition (speed read
  from mode while mode lags = a tick of wrong speed at every shoreline). ✅
- Every NEW tile effect (fire DoT, mud, ice, poison pools) must CHOOSE its semantics — center-tile (like
  mode) or circle-overlap (like solids) — and state why. Center-only lava lets a fat body hang safely over
  it; overlap-fire burns a swimmer whose shoulder grazes the shore. 🔨
- Exact-edge coordinates: `floor(x/TILE)` is deterministic AT a boundary, but negative/local coords need
  `Math.floor`, not truncation (trunc rounds toward zero → off-by-one west/north of an origin). ⚙️ decks +
  any future local frame.

**COLLIDE — enforcement; nobody opts out:**
- FAST impulses (dash, wall-slam shove, Rocket leap) vs THIN walls: tunneling between ticks. Audit any new
  impulse whose per-tick travel approaches a tile width. ⚙️
- Corner grazes: SAMPLED line checks (half-tile steps) can miss a body radius clipping a corner between
  samples — the exact swept-circle DDA (PATHFINDING Layer 0) is the fix; until then treat "slipped through
  a corner" reports as this. 🔨
- A body INSIDE solid (spawned there, shoved there, a ship swept over it) must DEPENETRATE before it moves —
  and a perched body (`onLedge`) is legally "inside" a low wall; depenetration must respect the perch. ✅
  (per-tick `unstick`)
- Wall-impact detection uses headway PROJECTED onto the intended heading, never total distance moved — a
  diagonal hit slides along the wall (high distance, no headway) and a distance test misses it. ✅ (the
  wall-slam projection)

**PLAN → WALK — tiles think, vectors move:**
- A committed continuous destination can be a WALL (the blind juke): pre-validate candidates with a cheap
  walkability read where INT allows (AI_FOUNDATION §4 — the INT-5 rung), and ALWAYS keep the failure
  ladder underneath (stuck watchdog → give up → re-decide). A silent forever-jog into a wall is the banned
  shape. ✅ give-up (`KITE_STUCK_GIVEUP`) · 🔨 candidate pre-read
- Waypoint ARRIVAL is a radius, never equality — a float body is never exactly at a tile center. Too tight =
  orbiting jitter at the waypoint; too loose = corners cut into walls. ⚙️ every new follower/executor.
- A* output is a tile STAIRCASE — the line-of-sight shortcut is what makes the walk read smooth. A walker
  slavishly visiting tile centers is a bug even when it "works". ✅ (`clearLine` shortcut)
- The GOAL tile can be unwalkable while the goal is legitimate (target perched on a wall/rail, standing on
  a ship): plan to the nearest walkable ADJACENT cell; returning "unreachable" strands every melee chaser. 🔨
- Moving targets: the repath THROTTLE (0.5s) and the stuck WATCHDOG are different clocks — verify the
  throttle can never mute the watchdog, or a pinned chaser waits out both. ⚙️
- UNREACHABLE goals burn the full node budget before failing (locked compound, another island — the common
  case, not the edge): the Layer-1 reachability oracle is the fix; until it lands, cap how many chasers can
  flood per tick. 🔨

**TWO TRUTHS DRIFTING — dynamic worlds:**
- A structure built/destroyed MID-WALK makes every planned path stale: the watchdog + repath must recover
  (never walk the ghost corridor); `StructureIndex.version` is the dirty signal. 🔨 territory building.
- Ships are MOVING tile grids: a hull is a wall the static grid can't know (the hull veto), and an EMBEDDED
  body must be able to walk itself free — vetoing every still-overlapping step was the frozen-at-the-rail
  deadlock. ✅
- Frame transitions (world↔deck) are ZERO-displacement address-book switches — moving the body at the seam
  always reads as a teleport, however small the nudge. ✅ (gangplank/rail exit rules)
- AI sight and projectile collision must share ONE occlusion truth — sampled sight + exact bullets (or the
  reverse) = "he shoots walls" / "he sees through walls". The fumbled-shot-through-wall bug was this
  family's first member. ⚙️

### Combat / Enemy AI ✅ (strong)
- Attack **only within range** (use squared distance); aim recomputed each frame (target moves). ✅
- Exclude self from targeting **and** own hits/projectiles (`o === e`). ✅
- Handle "no target" without erroring; re-acquire if the target is destroyed (null the ref). ✅
- Cooldown between attacks (ability `cd`) — not every frame; sane damage (no accidental one-shots). ✅
- Bullets/strikes spawn at the **muzzle**, not center. ✅

### Interaction ✅ (verb system)
- Detect the **nearest** interactable when several overlap (`best`), not a random one. ✅
- Show/hide prompt on enter/leave; interacting in open space must not error. ✅
- Route each type to the right handler (talk vs take vs board). ✅ (verbs)
- Complete **once**, not repeatedly in the zone; guard the interactable ref (already taken). ✅

### Equipment ✅ (loadout/GAS-lite)
- Equipping swaps the active visual; unequipping hides the old. ✅ (draw reads loadout)
- One item active per slot (new selection deselects prior). ✅
- Behavior gates on being equipped (fruit power only in fruit stance); aim/spawn direction correct per tool. ✅
- UI reflects the active item + updates on swap; guard equipping nothing/missing.

---

## Systems on the ROADMAP (the landmine map — read before building) 🔨

### Save / Load  *(the big one — ties to persistence architecture)*
- Serialize **all** state: inventory *amounts* (not just presence), world-object states, resource nodes, player/entity stats, **world-placed objects** (not only inventory).
- **Rehydrate references** on load (respawn sprites, rewire links — plain JSON only).
- Guard missing/partial/corrupt saves; fully rebuild **before** the game reads state; **version** the format.

### Inventory
- Stack existing items (don't make a new slot per pickup); **copy by value** on add.
- Pickup overlap fires every frame → disable/flag the item immediately (no double-grab).
- Drop removes the right quantity (no dup); handle drop-from-empty gracefully; capacity limits enforced.
- Spawn a world sprite on drop, destroy it on pickup; UI refreshes on add **and** remove; null-guard the item.

### Crafting
- Validate **all** inputs present in sufficient quantity **before** consuming any.
- Consume the **exact** amount (not one, not all); only produce output if consumption succeeded (no partial state).
- **Don't mutate the collection mid-iteration** (copy keys first); distinguish "some but not enough" from "none".

### Key / Door
- Key **type** must match door type (not "any key"); consume on use (decide, don't double-remove).
- Don't pre-load a key at start; pickup must actually add; open state triggers **once** and stays.

### Building / Placement  *(territory layer)*
- Validate resources before consuming; feed construction **incrementally**.
- **Grid-snap** placement + validity (not overlapping, buildable ground).
- Each instance is **independent** (a 2nd build doesn't reuse the 1st's state).
- Progress bar = contributed/required (guard ÷0 → NaN); activate only when **fully** built; don't over-consume.

### Quest
- Track against the **right** event/target; increment by the correct amount for relevant events only.
- Time-based quests (walk distance) use delta (not instant / never); complete **once** then stop listening.
- Multiple active quests don't cross-contaminate; don't auto-start unless intended; guard null quest data.

### Gathering / Resource nodes
- Gather over time (channel) if intended; correct resource **type** + quantity per node (no double-count).
- Node **depletion** — stop yielding when exhausted; trigger fires per frame → one gather = one yield; null-guard node.

### Needs (hunger/thirst) & Farming  *(if survival/economy layer lands — `REFERENCES.md` #32)*
- Decay via delta (not instant / not stuck); clamp 0↔max; consuming refills the correct amount (no overfill).
- At zero → **rate-limited** starvation DoT into Health (don't one-shot).
- Farming: staged growth via delta timers; require water; harvest **only when grown**, yields **once** then resets; placing seeds consumes the seed.

---

## How to use this
- **When building a roadmap system:** open its section first — it's the test list.
- **In review:** run the **★ Cross-cutting** list against any diff — those bug classes recur everywhere.
- **Testing:** the pure, deterministic systems (combat/inventory/crafting logic) unit-test cleanly (Vitest) against these cases — that's the payoff of keeping the sim engine-agnostic.
