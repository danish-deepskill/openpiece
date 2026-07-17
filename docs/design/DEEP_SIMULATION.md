# Openpiece — The Moat, Deep Simulation & the Road to openpiece.io

> **Stage:** capture — the long-horizon vision; passes carve designs out of it

> The load-bearing vision + every architecture/tech conclusion from the design conversation, in one place.
> This is the *why* behind the foundation: what "deep simulation" actually means for openpiece, how the world
> is shaped, how it stays performant, and how it becomes multiplayer. Ahead of the code, on purpose.
> Companions: `REFERENCES.md` (game ideas, tier-listed) · `../references/ARCHITECTURE_PATTERNS.md` (the educational
> engineering resources — chunk streaming, persistence, ECS, netcode, …) · `../ARCHITECTURE.md` /
> `../ARCHITECTURE_SCALE.md` (the code).

---

## 1. The core fun — "be the Yonko"

Start as an **F-tier villager**. Live a Luffy-style journey: **recruit strong pirates**, meet **rivals**, fight
**Marines** who patrol and ambush. Eventually become a **Yonko** who:

- **Controls territory** across tiles/islands, each holding factions you command and economies you run.
- **Commands at a strategic layer** — "send Pirate Squad Delta to that Marine-base tile" — and they **fight there
  autonomously, without you**.
- **Can zoom into any front** and select any squad leader — or **possess *any* unit you control** to fight as the
  hero — while your **other squads battle a rival Yonko's crew on another tile at the same time**.
- Some territory **runs economy / trade**.

This is **Mount & Blade × One Piece × a living faction-sim**, with a possess-any-unit twist nobody has quite done.
It is "sand in a desert" — endlessly deep — so it must be built as **vertical slices on one foundation** (§9),
never all at once.

---

## 2. The Moat — the load-bearing idea

**Control is a component. The player is not special.** Every actor — villager, marine, rival, wildlife, your
crew — runs the **same component + system stack**. (Vision pillar #2; `ARCHITECTURE.md`.)

The Yonko dream **is** the Moat, fully expressed:

| Dream action | = Moat mechanic |
|---|---|
| Be the Yonko commanding the map | control sits on your commander |
| Drop into any squad leader mid-battle | move `control` onto that unit |
| Possess a random grunt | same — control moves; the old body reverts to AI |
| Squads fight on other tiles without you | they're autonomous actors on the identical stack |

You didn't pick a wishlist — you described the architecture's telos. That convergence is the strongest signal the
foundation is right. **Protect the Moat above all.**

---

## 3. Three different "deeps" — only one is the hard one

We kept saying "deep complex simulation." It's three separable things:

1. **Deep content** = breadth (fruits, weapons, islands, abilities). **Solved structurally** by data-driven
   Registries. Not the hard part.
2. **Deep systems** = player-facing mechanics (four-layer combat, progression, crafting). **In progress**
   (GAS-lite). Tractable.
3. **Deep simulation** = **the world runs itself whether you watch or not.** The hard, distinctive one — and the
   thing that drives every tech/platform decision below.

"Deep simulation" for openpiece = **the world is a living system of autonomous agents, not a backdrop of spawned
fodder.**

### What that looks like (the living sea)
- **Autonomous agents:** a rival crew is out there *now* hunting the same bounty, raiding towns, leveling. A
  Marine patrol actually patrols; a merchant sails a trade route; a bounty hunter takes a contract on *you*.
- **Interlocking world systems (on a slow tick, off-screen too):** faction war (islands change hands without
  you), a living economy (prices/routes), bounty escalation (bigger bounty → stronger hunters → an admiral),
  sea ecology/weather.
- **Emergence:** sink a merchant → their rep drops **and** Marines respond **and** a hunter takes the contract
  **and** prices spike on the destination island. Un-scripted, from systems colliding.
- **Persistence & consequence:** the world remembers — a liberated island stays free (or gets retaken); a Devil
  Fruit someone else eats is **gone from the world** until they die.
- **Continuity:** return after a week and the island has *changed* because the sim kept running (at LOD).

---

## 4. The simulation spectrum — and openpiece's target

| Level | Example | The world… |
|---|---|---|
| **Shallow** | Arcane Odyssey; openpiece *today* | backdrop; NPCs are fodder; factions are labels |
| **Medium** | **Kenshi** ← **TARGET** | lives independently; factions war, economy shifts, doesn't revolve around you |
| **Deep** | RimWorld / Dwarf Fortress ← north star | every agent micro-simmed + generated history + ecology |

**Target = Kenshi-tier** (a genuinely living One Piece sea — nobody's done a *deeply-simulated* One Piece world),
**dressed toward DF-tier over time.** The Medium tier is buildable on the web and is the differentiator.

---

## 5. World structure — seamless, not two-tier

**Decision: a seamless, tile-based world (sea + islands in one continuous space), chunk-streamed + LOD'd under
the hood. NOT Dwarf Fortress's two-tier (abstract map + separate embark sites).**

Why: **sailing is a core Moat mechanic** — the sea must be *real playable space*, not an abstract travel menu.
The world is *mostly sea* with **islands of wildly varying size**, which a continuous space handles naturally and
rigid uniform tiles do not.

| Axis | **Seamless** (chosen) | Two-tier / DF |
|---|---|---|
| Real sailing (the Moat) | ✅ sea is real space | ❌ sea becomes an abstract map |
| Landing on an island | ✅ sail up, walk ashore | ❌ hard "embark" transition |
| Islands of very different sizes | ✅ any size in continuous sea | ❌ forced into uniform tiles |
| Deep local sim / sharding / LOD / memory | ✅ (via chunks) | ✅ (via sites) |
| **Kills the core mechanic?** | **no** | **yes (abstracts sailing)** |

The chunking/sharding/LOD is an **invisible implementation detail *under* a continuous world**, not a visible
structure. "Tile-based" is just the representation — both models use tiles; the real axis is seamless vs
two-tier, and seamless wins because of sailing.

---

## 6. The multi-scale runtime (what makes it affordable)

The Yonko dream + real-time combat + a living world is only affordable with **tiered simulation** — the same
design that carries deep-sim *and* multi-front command:

- **Strategic layer** — **slow tick (1–10 Hz):** squads, territories, economies, rival Yonko all move/fight
  across tiles. *All fronts* run here.
- **Tactical zoom** — **60 fps full detail** on the *one* tile you're watching/fighting on.
- **Possess** — `control` drops onto any unit on that tile.
- **Off-screen fronts** — resolve at **LOD** (abstract math or low-detail sim) until you zoom in; playerless
  islands tick cheaply or pause.

The world doesn't need frame-rate fidelity; your **punches** do. This tiered tick + zone-LOD is *also* the
multiplayer sharding model (§7) — one design serves depth, multi-front command, and .io.

---

## 6b. Strategic-layer systems (the RTS toolkit)
The "command squads across tiles" layer is an **RTS**, and RTS systems port cleanly to 2D top-down (the *design*
transfers even though Unity **DOTS/Burst** perf doesn't — JS is single-threaded + GC'd). Systems to build:
- **Selection** (single + drag-box → a `Set` of selected squads/units) · **formations** (offsets around a target so
  units don't stack — extends the boids `separation()`).
- **Flow-field pathfinding** ← the standout. For many units → one destination, do **one** Dijkstra pass from the
  target filling a direction-vector per cell; every unit reads its cell → **O(units)**, not O(units × A*). This is the
  crowd/squad/open-sea nav answer (we use per-unit A* today). Isolate the field-rebuild to a Worker/WASM if heavy.
- **Grid-snapped building placement** (ghost preview + validity vs `TileGrid`) · **build queue + resource/economy**
  (plain data) · **fog of war** (per-tile visibility grid → dark overlay w/ holes = player-facing interest management).
- Buildings/units are **Defs in a Registry** (Unity ScriptableObject ≈ our Def — same data-driven pattern).

**Scope constraint (honest ceiling):** design the RTS layer for **hundreds–low-thousands of *active* units** (sim-LOD
abstracts the rest); JS/Phaser won't reach DOTS's tens-of-thousands. Source course + mapping: `../references/ARCHITECTURE_PATTERNS.md` (Theme 3–4).

## 7. Tech decisions (the whole thread, settled)

### Engine — stay Phaser
Engine ≠ depth (Qud/RimWorld are Unity; DF is C++). Depth is openpiece's own systems. Phaser gives scenes/
camera/input/assets for free and is **better** for scale than raw canvas because `Phaser.AUTO` (WebGL) **batches
sprites**. Rendering is never the bottleneck (DF/RW are visually trivial). **Do not plan an engine switch** — a
mid-project switch is a full rewrite and the #1 way ambitious projects die.

### Simulation performance ladder (climb only as a profiler demands)
1. object-ECS (now) → 2. **data-oriented / typed-array ECS** (biggest lever at scale) → 3. **Web Workers** (sim
off the render thread) → 4. **WASM** for hot loops (pathfinding/fluids/cellular) → near-native, *in the browser*.
Plus **viewport culling** in `RenderSystem`/`AccessorySystem` (cost scales to the screen, not the map).
The current object-ECS is right for now but **won't** reach RimWorld-scale — the typed-array migration is the
known, Phaser-independent path when counts climb.

### Multiplayer — server-authoritative, sharded (openpiece.io)
The deep sim runs on the **server**, not the browser — so the browser's memory/threading limits never gate it.
- **Each tile/region = a zone/shard** (a Colyseus room / server process). Sailing across a boundary is an
  **invisible handoff**, not an embark.
- **Simulation-LOD + interest management:** each client gets only its area-of-interest as deltas; playerless
  zones simulate coarsely.
- **Thin client:** Phaser renders the local slice, interpolates + predicts. Client only holds a small slice →
  browser memory is a non-issue.
- A server can be as beefy/native as needed; **hot loops in Rust/WASM** on the server for the deepest sim.

### Latency — the crucial cost, and where it bites
Latency only hurts the **fast action layer** (combat/movement); the **deep sim is slow → latency-immune** (a few
hundred ms is invisible for factions/economy). Hide action latency with **client-side prediction** (predict your
own moves — feels instant), **interpolation** (others rendered slightly in the past), **lag compensation**
(server rewinds to validate your hits). Openpiece's **engine-agnostic TS sim runs on both client and server**, so
the client predicts with the *same* code the server authoritatively runs — cleaner than moomoo (which reimplements
the client sim). A local single-player build always feels more instant for your own actions; server games *hide*
the gap, never fully erase it for cross-player interaction.

### Recommended stack for openpiece.io
- **Client:** Phaser + TS → **Cloudflare Pages** (free CDN).
- **Game server:** Node + TS + **Colyseus** (authoritative rooms = zones) → **Fly.io** (start) → **Hetzner**
  (scale; cheap bandwidth).
- **Auth:** **Supabase Auth** (or **Discord OAuth** — great for games).
- **Persistence:** **Postgres** (accounts + progression) via Supabase/Neon + **Redis** (Upstash) for live/session.
  Pattern: **load on connect → snapshot periodically → save on disconnect** (never write per-tick).
- **Avoid AWS early** — over-complex, and its **egress bandwidth pricing punishes real-time games**. Consider it
  later for specific managed services only.
- **Cost reality:** a persistent world is **always-on** (can't scale to zero) — bandwidth + always-on compute are
  the drivers. MVP ~$10–40/mo; thousands concurrent = $100s–$1000s/mo. It's a **live service** → needs a revenue
  model (cosmetics/battle-pass/ads).

### Roblox vs web — the fork, and why web
Deepwoken/Arcane Odyssey/Starscape are all **Roblox** — which hands you multiplayer/auth/persistence/hosting +
a **built-in audience** for free (why small teams reached millions). **But** Roblox is locked-in, takes a big
rev-cut, isn't browser/.io, and — decisively — **Luau + Roblox's engine cannot carry a deeper-than-DF
simulation.** openpiece wants **both** ".io / own it" **and** "deep sim," and those two together **rule Roblox
out**. Web is the lane: full ownership, browser reach, and a sim you control (JS/WASM) — at the cost of building
the infra + audience yourself. (If openpiece were "Arcane Odyssey but shallower," Roblox would be the faster,
audience-rich path — but the deep-sim soul is the deciding factor.)

---

## 8. What the current code already seeds

The foundation is deliberately pointed at all of the above ("engines not content"):

- **Moat** (control-as-component, `spawnUnit` uniform stack) → autonomous agents + possess-any-unit.
- **Faction matrix** (`defs/factions.ts`, `canHarm`/`isHostile`) → dynamic politics/war; huntable-neutral wildlife.
- **GameDirector** → the event **Storyteller** seed.
- **Data-driven Registries** → the content the systems act on generically.
- **AI profiles / brains** (`ai.critter`, wander/chase/flee, data-driven knobs) → NPC behavior at scale.
- **Wildlife/critters** (cows/pigs, neutral faction, flee-on-hit, lumber) → ecology seed.
- **SquadSystem** → squad command seed. **Npc.recruit** → recruitment seed.
- **Power tiers + bounty** → the F→Yonko ladder + escalation.
- **Sailing between islands** → the seamless-world / world-layer seed (already a two-island miniature).

---

## 9. Build discipline — vertical slices, one layer at a time

The #1 risk is drowning by building all layers at once. Ship the **spine**, let depth accrete. Suggested order:

1. **Recruit one NPC** who fights alongside you (crew of 1).
2. **Possess-swap** — select a crewmate, *become* them; the old body reverts to AI. (This demo *is* the Moat.)
3. **A squad** — group a few; orders: follow / attack / hold.
4. **Own one tile** — clear an island; it's yours; it produces something.
5. **Minimal strategic layer** — a map; send a squad to a *second* tile; it fights there on abstract resolution;
   you can zoom in.
6. **Widen:** rival Yonko, multi-front, economy, the F→Yonko ladder, Nemesis-style rivals (`REFERENCES.md`).

Each step is playable and proves one layer. This is *tractable* only because every layer plugs into the same
Moat / faction / zone foundation instead of being a bespoke subsystem.

---

## 10. Disciplines to bank now (keep the future cheap)

- **Keep the sim engine-agnostic** — no Phaser types in ECS/systems, so it runs **headless on a Node server**
  unchanged. (Mostly true today — protect it.)
- **Seedable RNG** — replace `Math.random()` in AI/sim with a seeded source, for server-authoritative determinism
  + reproducibility. Small change now, big enabler later.
- **Design the world as zoneable** — regions/islands as units, not one monolith — so sharding is a deployment
  step, not a rewrite.
- **Pick the deep axes early** — rival crews (Nemesis), faction war, bounty, economy — and abstract the rest.

**One-line summary:** openpiece is a **living, deeply-simulated One Piece sea** you rise through from villager to
Yonko — built on the **Moat** (possess anyone, command everyone), shaped as a **seamless island world**, made
affordable by **tiered simulation**, and destined for **openpiece.io** as a **server-authoritative** game whose
depth lives in engine-agnostic systems, not the renderer.
