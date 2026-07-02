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
