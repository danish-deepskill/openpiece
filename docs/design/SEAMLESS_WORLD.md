# Seamless World — the chunked sea, the tick tiers & the ledger (Design)

> **Stage:** designed — backlog #14; synthesis complete + research-hardened (two verified passes), but **design-review gates UNPASSED — do not treat as canon yet**: knobs lack Def homes (F2), the moat test isn't walked (F5), ledger/ROADMAP sync pending (F3). Build 0%; §15 Q1–Q5 await the developer. (`design-reviewer`, 2026-07-16; F1's dehydration-trigger hole and F4's hysteresis contradiction are FIXED below.)

> The **substrate** half of the open world: how one continuous sea can be bigger than memory, cheaper than
> its own size, and still deterministic. What the sea CONTAINS is `WORLD.md` (zones, hazards, regions) and
> `EVENTS.md` (the director); how a ship MOVES on it is `SAILING.md`; how anything PLANS across it is
> `PATHFINDING.md`. STATUS: design ahead of code — the code is a single fixed 86×54 grid and knows no chunk.
> This pass answers `DESIGN_BACKLOG.md` #14. Its vocabulary (**ticket · delta · dehydrate**) is what #7, #12,
> #16 and #18 were told to wait for.
>
> **§2 is an INDUSTRY SURVEY** — eleven shipped games, their real mechanisms and their real failures, tiered
> S/A/B/C/D against our pillars in the `references/rimworld-simple/adoption-tiers.md` house pattern. It is
> load-bearing, not decoration: it killed two of this doc's own first-draft designs (§5 and §6 are rewrites)
> and corrected a premise in `CLAUDE.md` (§2.9). Sources in Appendix A. Where a widely-repeated number
> traces only to forum folklore, it is **excluded** — see A.2.

---

## 0. What this pass does NOT relitigate

The decision exists and is load-bearing; this pass designs *under* it, never around it:

- **One seamless tile-based world** — sea + islands in one continuous space, chunk-streamed + LOD'd.
  NOT Dwarf Fortress's two-tier world/site split (`DEEP_SIMULATION.md` §5).
- **Because sailing is a Moat** — the sea must be real playable space, not a travel menu. No loading screen
  may sit between you and a sail you can see (`ARCHITECTURE_SCALE.md` §5).
- **Chunking is invisible.** An implementation detail *under* a continuous world, never a structure the
  player can perceive. If a seam is visible, the design failed. (EVE proves the converse: its grids ARE
  perceivable, so players weaponised them — §2.6.)
- **Zones are DATA painted over the continuous ocean** — crossing a boundary changes numbers, never screens.
- **Persistence lands BEFORE chunking** (`ARCHITECTURE_SCALE.md` §5) — an unloaded chunk's state must have
  somewhere to live. #18's clock is co-designed *with* this pass; tick-tiers and the calendar are one
  substrate (`DESIGN_BACKLOG.md` #18).
- **Sim-LOD is the substitute for multi-map** (`adoption-tiers.md` D#47) — we do not get RimWorld's discrete
  maps, so fidelity must carry that weight alone.

## 1. The thesis

> **A distant thing is not ticked slowly; it is EVALUATED. Its state is a pure function of (seed, route,
> world-time) with no retained state — so visiting it cannot change it, and not visiting it cannot cost
> anything.**

Consequences, and each is the reason for a later chapter:

- **Determinism survives streaming.** Session B's same-seed replay proof (`2645b06`) holds only if streaming
  injects no nondeterminism. Pure per-chunk generation + stateless evaluation mean load order, visit order
  and camera position cannot reach sim state. This is not theoretical: **Factorio shipped exactly this bug
  and it hid for seven years** (§2.4).
- **Prime directive #5 survives** — "cost scales with the active area, not the world." An evaluated entity
  costs O(1) *when observed*, not O(1) per tick.
- **#18's clock line already said this** — "a dehydrated ship's ETA is **clock math, not per-tick sailing**."

### 1.1 The honest correction — it is not "closed-form"

The first draft of this doc claimed *closed-form*. That was wrong, and the survey caught it. A ship tacking
against a wind field is **path-dependent**: its ETA is an integral, not an expression. There is no closed
form for it.

The property that actually matters is **statelessness**, not closed-formness:

> **Evaluable from (seed, route, t) with no retained state.** The mechanism may be a fixed-step quadrature.
> What is forbidden is an *accumulator whose value depends on having been ticked*.

Which forces one non-negotiable rule, arrived at independently by two of the survey's agents:

> **★ Quantize evaluation to ABSOLUTE world-time buckets** (e.g. 1.0 s on a world-global grid) — never to
> the moment an entity dehydrated. A ship sleeping at t=100.3 and one at t=100.7 would otherwise land on
> different step boundaries, produce different results, and desync from a live-simmed peer. The symptom is
> **ships teleporting on rehydration**, and it would be blamed on the hydration code for weeks.

Cost is then O(elapsed / bucket), paid **only on read**, and identical whether you asked continuously or
once after an hour. RimWorld ships precisely this shape — an accumulated `delta` handed to
`TickInterval(delta)` so an entity catches up in one step (§2.7).

### 1.2 Where evaluation does NOT apply

Evaluation works where the mechanism is a pure function of time. It does not where state is genuinely
emergent and path-dependent (an island's politics over a year). Those get **reduced-rate ticking**, not
evaluation. The failure mode is *permissive*: slow-ticking what could be evaluated quietly restores
cost-scales-with-world. §4's rate function is where that line is drawn per system.

---

## 2. The industry survey

### 2.1 The two families — and the one nobody shipped

Every shipped seamless world picks one:

| Family | Mechanism | Ships | Cost model |
|---|---|---|---|
| **Stream-the-world** | everything real, load/unload by distance | Minecraft, Factorio, Valheim, Sea of Thieves | scales with *what exists* |
| **Ledger-the-world** | distant things become abstract records | X4, RimWorld, Dwarf Fortress, Elite | scales with *what's watched* |

**Nobody shipped stateless evaluation.** X4 **degrades the tick** (distant ships keep flying, minus
physics). DF **teleports** the irrelevant and **paths** the consequential. Elite **doesn't move anything at
all**. Kenshi **freezes**. So §1's thesis has *no prior art to copy* — a genuine design opening, and a
genuine risk: the correctness burden is entirely ours. **Budget for calibration testing, not for confidence.**

Openpiece must be family 2. §2.10 is the proof: Sea of Thieves bought "the horizon is real" by capping the
world at ~6 ships. A living sea cannot pay that.

### 2.2 Minecraft — the ticket integer *(the best idea in the survey)*

**One monotone integer per chunk expresses everything.** Tickets are placed at a level; the level
flood-fills outward **+1 per chunk step**; a chunk takes the **`min()`** of all tickets. One propagation
pass replaces four independent questions.

| Level | Meaning |
|---|---|
| ≤ 31 | **entity ticking** — mobs, spawning, everything |
| 32 | **block ticking** ("lazy") — blocks tick, entities do not |
| 33 | **border** — accessible, nothing ticks |
| 34–44 | inaccessible; **worldgen only** |

The masterstroke: **44 = 33 + 11**, because each level above "full" maps to a *less-generated* status. **The
generation-radius requirement is folded into the same integer as the tick tier.** Tickets carry a **source
tag and a TTL** (player = 31, no timeout; portal = 30, radius 3, 300-tick TTL) — "keep this alive briefly"
needs no bespoke code. Simulation-distance and render-distance are genuinely separate knobs.

**The neighbour problem, solved.** This doc forbids a chunk reading neighbours to generate (§3.3) — but
islands span chunks. Minecraft's answer is two mechanisms:
1. **A DAG of (status, margin).** Each generation stage declares the neighbour radius it needs *at the
   previous stage*, never its own. Cycles become structurally impossible.
2. **The structure two-phase.** `structure_starts` computes placements **purely from seed + coords**, zero
   neighbour reads. `structure_references` publishes pointers to nearby chunks owning a start. `features`
   places **only the slice inside the current chunk**.

**Storage.** Region = 32×32 chunks; a 8192-byte header of (3-byte sector offset + 1-byte length) × 1024.
**Offset 0 = chunk absent = literally zero bytes.** Sparse by construction.

**What breaks:** *cascading worldgen lag* — a feature writing outside its own chunk drags a neighbour into
generation, recursively. The 31/32/33 thresholds are folklore, not named constants. "Border" chunks are an
invisible third state that produced years of "my farm stopped" reports.

> **Steal:** the ticket integer + min() + flood-fill; TTL'd, source-tagged tickets; folding gen-radius into
> the same number; the (status, margin) DAG; the seed-pure start/reference two-phase; offset-0-is-free.
> **Avoid:** magic threshold literals; features writing outside their chunk; unobservable states.

### 2.3 Valheim — ZDOs: the ledger, shipped

**This is §5's design, in production.** Every entity — player, creature, **every building piece** — is one
**ZDO**: prefab hash, position, sector, owner, revisions, persistent/distant flags, plus typed key→value
dicts. Hydrate: `ZNetScene` sees a ZDO whose sector is in range, instantiates the prefab, binds it back.
Dehydrate: the GameObject is destroyed and **the ZDO survives untouched**.

> **The ledger is authoritative; the instance is a view.**

**Geometry:** zone = 64×64 m. Active radius 1 (3×3, creatures simulate) ⊂ loaded 2 (5×5, structures
instantiated) ⊂ generated 4 (9×9). Zones load **one per 0.1 s** (2.5 s for all 25) and unload after **10 s**
of being out of range — staggered load and unload hysteresis, ~10 lines each.

**Persistence is exactly §3.5:** the world regenerates from seed; the `.db` is the **delta**. Provable —
`--resetWorld` regenerates every zone that has *no player-built structures*, leaving built ones intact.

**What breaks — three failures, all instructive:**
1. **ZDO explosion.** One ZDO per building piece. Perf collapses at 5–6 players against a nominal 10 —
   *"a networking decision, not a game design one."*
2. **Unbounded dict → corruption.** `SpawnSystem` appends a spawn-attempt timestamp per creature per zone;
   the list grows past the per-ZDO entry cap and **the zone corrupts**. An append-forever list on a capped
   record.
3. **Whole-object resend, not deltas** — bandwidth-bound; retrofitting deltas later is brutal.

> **Steal:** ZDO-as-truth/instance-as-view; three concentric radii as separate integers; staggered load +
> unload hysteresis; sector-indexed lookup; seed-regenerable world + delta-only save.
> **Avoid:** one record per part (§5.5); unbounded per-record accumulators; claimed-not-arbitrated
> ownership; no schema versioning.

### 2.4 Factorio — determinism, and a fake counterpoint

**The single most important citation in this document:**

> **FFF-415:** chunk generation *"would attempt to use all of your available CPU cores but was done in a way
> that the number of cores… would change the chunk generation results slightly."*
> **Introduced July 2017. Found 2024. Fixed in 2.0.**

Streaming injected nondeterminism into the most determinism-obsessed game ever built, and it hid for seven
years. That is why §11 is a *tested contract*, not an assumption.

**Transcendentals are the real hazard.** kovarex wrote custom `sin/cos/asin/atan` because C++'s aren't
cross-platform reproducible — *"We are not talking about precision here, it is about getting the same
(though possibly imprecise) outcomes."* Positions are fixed-point (1/256 tile). Result: a 500-player server
across Win7/10/Mac/Linux and continents, **zero desyncs**.

**Sleep is exact, not approximate.** Asleep = *"consuming zero processing time."* An inactive chunk is not
LOD — inactive means *provably nothing changes*. That is a sharper bar than "cheap."

**Waking must be ordered.** Threads may not wake an inserter directly — *"If Inserters would activate in a
different order, desyncs would happen."* They push wake **requests**; the main thread drains them in
group-update order. This is the pattern for tiering without desync (§11.3).

**Belts validate §5.5.** Store the *gaps between* items, not absolute coords; normal flow mutates only the
terminal gaps — two integers instead of 200 items. **×50–100** on item movement.

**Deferred update + presentation interpolation:** robots tick 1/20 while moving, 1/60 stationary; rendering
interpolates predicted positions. That is our sim/presentation boundary, shipped.

**The fake counterpoint.** Factorio has *no* LOD and simulates everything — seemingly refuting §1. It
doesn't, and the reason matters: **Factorio's world is player-authored.** ~1e6 live tiles out of 4e12
possible; unrevealed chunks don't exist. Cost scales with *what you built*, not world size. Empty sea has
nothing to simulate, so Factorio agrees with us by accident — and **has no answer for AI-authored population
that exists unobserved**, which is precisely our case.

> **Steal:** exact sleep; ordered wake-requests; deferred ticks + render interpolation; chunk-granular
> fields on a slow cadence; custom transcendentals; a cheap per-tick CRC + replay bisection; the rule that
> **cached derived state must be serialized or recomputed identically** (FFF-340).
> **Avoid:** lockstep (§12.2); floats-in-sim-because-we-own-the-compiler; "just simulate it all".

### 2.5 X4: Foundations — the divergence cautionary tale

The deepest shipped "the whole economy is real". A **~100–150 km attention bubble** around the player, not
zones; outside it, ships keep flying but lose *physics* — no collision, no LOS.

**Combat divergence, unsolved and shipped.** Out of bubble, combat becomes a numbers game: turrets have a
**30% chance to fire**, station turrets check *range only, not line of fire* (so hull geometry stops
blocking), damage types flatten. Weapons balanced in-bubble around low accuracy + high damage become
"ridiculously effective" outside it. Players report fleets that shred capitals abstractly getting decimated
concretely. Player verdict: *"each mode functions like an entirely different game."*

**Save bloat.** Nothing despawns; saves run ~60 MB compressed, **500 MB+ uncompressed**, XML, single-threaded
save/load. Standing endgame advice is to delete your own miners. The one saving grace: AI factions have a
**hard actor cap** and maintain rather than grow it.

> **Steal:** the attention-bubble boundary (a radius, not a zone); the hard actor cap.
> **Avoid:** two rulesets that pick different winners; a text-serialized ledger with no pruning.

### 2.6 EVE / Elite — grids, dilation, and the accumulator

**EVE.** A *grid* is the set of objects that can see each other; two independent grids never merge. Players
weaponised this ("grid-fu") — **what loads became a mechanic**, which is exactly what §0 forbids. **Time
dilation**: load scales O(n²) with players on grid, so rather than letting actions fail randomly, CCP slows
all in-space actions uniformly, floor 10% speed. The brilliant part is **what is never dilated**: server
time, skill training, industry, and **reinforcement timers** — because dilating them *"opens up the ability
for players to move when the reinforcement will expire."*

**Elite.** Per-system daily ticks, no global tick; per-tick influence change is **capped**. But: *"without
players visiting a system no NPCs are spawned, and NPC activity doesn't influence a system."* Political
influence **freezes** unvisited. The BGS is a **player-action accumulator, not a world sim**.

> **Steal:** uniform slowdown over selective failure; **★ an absolute clock that never dilates**, so
> consequence timers can't be gamed by pushing the sim into its cheap mode; capped per-tick deltas;
> staggered per-entity tick times.
> **Avoid:** load boundaries players can observe and therefore control; a ledger that only integrates
> observed input — the sea would be dead behind you.

### 2.7 RimWorld — components, not rows *(this killed our §5 draft)*

**RimWorld never converts a pawn into a row.** `PawnComponentsUtility` nulls exactly the **map-coupled**
components — `pather, rotationTracker, drafter, natives, filth, roping, flight, caller, interactions` — and
keeps the **identity** ones: health, needs, relations, skills, story, ageTracker, records. Dehydration is
*component removal*, not serialization to a parallel type.

**Three tiers, not two:** `pawnsAlive` (full tick) → `pawnsMothballed` (batch-ticked every **15000** ticks) →
`pawnsDead`. `TickMothballed` does exactly two things: **age and records**. That is "countable things count",
shipped.

**The observability rate function** (1.6; absent from our atlas) — steal wholesale:
```
GetCameraUpdateRate(thing) = 15  if off-map or not InViewOf(camera)
                           = zoom+1 (1..5) otherwise
WorldObject.UpdateRateTicks = 15 when the world map isn't being looked at, 1 when it is
```
dispatched as `tickDelta++; if (tickDelta > UpdateRateTicks || IsTickInterval(HashOffset(), rate))
{ TickInterval(tickDelta); tickDelta = 0; }` — three ideas at once: **rate keyed on observability**, an
**accumulated delta so the entity catches up in one step** (= §1.1), and **hash-offset staggering**.

Tick classes verified: `Normal=1, Rare=250, Long=2000`; bucket `= abs(hash) % interval`, dispatched
`buckets[TicksGame % interval]`; register/deregister **deferred into queues** drained at the top of `Tick()`
so buckets are never mutated mid-iteration.

**WorldPawnGC** — mark-and-sweep with **named string reasons** (`GetCriticalPawnReason` returns *why*, and
`LogWorldPawns` prints "will be discarded on next GC pass"). Roots: Colonist, BondedAnimal, FactionLeader,
CaravanMember, ForSale, Spawned, CorpseExists, **InPlayLog, InBattleLog**, InActiveTale, ReservedByQuest…
- **Closure is depth-1, deliberately** — a pawn kept by "Relationship" does not pull in *its* relations.
- **Stable-seeded random retention:** keep 10 extra humanlikes at `ChanceSeeded(0.25, id ^ 0x3A73ECFD)` —
  seeded on ID, so **the same pawns survive every pass** (no re-roll churn).
- **Incremental + interruptible**; a cancelled pass **doubles the GC rate** so a busy colony still converges.

**★ AVOID — the leak is real and unfixed.** `InPlayLog`/`InBattleLog`/`Relationship` are roots, so pawns
accumulate that are kept *forever*; players report ~2000 leaked pawns taking 600 TPS → 100. **Never let an
append-only log or a symmetric relation be a GC root** without a TTL or weak (id + name snapshot) refs.

**Caravans are ticked, not evaluated** — real `Pawn` objects in a `ThingOwner`, a cost-accumulator per tile.
`GetOrGenerateMap` regenerates *terrain* procedurally from the tile; **pawns survive because they were never
abstracted away**. `MapDeiniter` passes every pawn to `WorldPawns` and drops everything else. Pawns persist;
the map does not.

**The keystone:** `StorytellerComp.AllIncidentTargets` is **one polymorphic list of Maps + Caravans + World**,
all `IIncidentTarget`, each with a `ConstantRandSeed`. The director never asks "is this hydrated?"

> **Steal:** dehydrate = drop map-coupled components; three tiers; the observability rate function + delta
> catch-up + hash staggering; GC roots as named reasons; depth-1 closure; stable-seeded retention; one
> incident-target interface across hydrated and dormant.
> **Avoid:** logs/symmetric relations as GC roots.

### 2.8 The autoresolve question — Mount & Blade, HOMM3, AoW, Dominions

**Warband's cautionary math** (verified in module-system source):
`stack_strength = max(1, ((level+4)^2 * 2) / 100) * (size − wounded)`, then
**`clamp(strength/20, 1, 50)`**. Power is character **level only** — equipment and troop type are never read.
The clamp saturates at 1000, so **50 knights and 1000 looters are identical to the auto-calc**. That single
cap mechanically explains the entire "looters kill Swadian knights" folklore.

> **★ A cap on an aggregate power score is how you build an exploit.**

**Bannerlord** replaced the aggregate with pairwise rolls:
`damage = (0.5+0.5·rand) · 40 · (attackerPower/defenderPower)^0.7 · advantage`, rounds
`= round(min(attackers·2, defenders^0.6))`, settlement advantage 200–700%. The **sub-linear `^0.7`** is a
deliberate compression so elites aren't invincible. It still overvalues defenders badly (320 attackers vs 24
defenders → 100+ dead on autoresolve, near-zero manually), because the sim reads terrain as a coarse enum
and player skill only as a Tactics stat. **They patched morale/rout in v1.3.0 — September 2025, five years
post-launch**, explicitly to let *"a small party of elite troops stand against a numerous but less trained
force."*

**HOMM3 — the answer, from the man who wrote it.** Gus Smedstad (NWC AI programmer):
> *"'Quick Combat' is exactly the same as running the combat with Auto Combat on. The same code is executed,
> it's just run with the animations off."*

**But the caveat is the lesson:** in the same post he notes HOMM3 *also* shipped a cheap estimator for AI
heroes fighting wandering monsters — ~4 rounds of archer fire, then force ratios. **The canonical
"run the real sim headless" game still kept an approximation for the bulk background case, tiered by who is
watching.**

**Age of Wonders 3/4** corroborates structurally: you can **watch a replay of an auto-resolved AI-vs-AI
battle** — replays of *moves* cannot exist if the resolver is a formula.

**Total War is the warning.** No formula ever published, and a decade of per-case patching (Rome 2 patch 15
"improved autoresolve handling for ranged and routing units"; TWW Update 5 protecting high-quality units).
CA *does* calibrate against headless runs — battle designer James Martin: *"improvements to our auto-test
system… allowed us to gather better data, so it's gonna be much cleaner for the auto-resolve to use."*
**A decade of hand-tuning is the signature of an approximation that cannot be fitted.**

**Three escapes observed in the wild:** delete the second model (Paradox: no playable battle exists;
RimWorld: no abstraction exists — grep for `SimulateBattle` returns **zero hits**); make the sim truth and
the battle a **dramatization** (Dominions: pre-commit orders, resolve between turns, watch the replay);
refuse autoresolve (Battle Brothers).

**★ The reframe.** One engine does not eliminate divergence — it converts a **model mismatch** into an **AI
skill gap**. AoW players still beat "very likely victory" odds by hand because the AI won't focus-fire. But
that gap is **monotone**: playing manually is never *worse* than autoresolving, so it is not exploitable in
the dangerous direction. **Perfect agreement is unachievable; monotonicity is achievable.** That is the
property to design for.

> **Honest null result:** no canonical designer essay exists on "the abstraction must not be exploitable
> relative to the detailed sim". This is **under-theorized ground, not solved ground** — flagged as such.

### 2.9 Kenshi — ★ the north star does not do this

`CLAUDE.md` says "Kenshi-tier world sim"; `REFERENCES.md` calls Kenshi *"a living world that ignores you."*
**The feeling is real; the mechanism is not simulation.**

> *"Anything remotely far from your characters is not being processed by the game, it's all just frozen and
> static, waiting for you to come nearby. **If nobody is at your base, literally nothing will happen to it.**"*

What Kenshi ships is a discrete boolean state machine: **World States** (condition sets → true/false, fired
by events like a leader dying) triggering **Town Overrides** (wholesale prefab swaps). Three failures, each
one a rule for §5:
1. **Round-trip state loss** — an overridden town is a *new location*; "any Player-Owned Buildings in Town
   are completely forgotten by the game."
2. **The observer vetoes change** — "If a player is currently there when the override is supposed to
   trigger, the game will simply wait for them to leave."
3. **Hydration is visibly fake** — squads spawn directly on whoever isn't looking.

**The good part, and it's genuinely good:** *touch-based persistence*. Town NPCs become persistent once
you've been near them; randomly-spawned "homeless squads" are **deleted** on leave. **The save grows only
with places you touched** — §3.5 by another name.

Chris Hunt, on the record: *"The more dynamic a game gets, the more unstable it becomes… Dynamic economies
are a nightmare to balance."*

> **Steal:** World States as cheap booleans; touch-based persistence.
> **Avoid:** prefab swap that discards player-authored state; **letting presence veto world change**.
> **Correction for CLAUDE.md:** Kenshi is our reference for the *feeling* and for persistence policy — it is
> **not** a reference for the ledger. Nobody should read "Kenshi-tier" as "Kenshi did this."

### 2.10 Sea of Thieves — ★ it bought the horizon by capping N at 6

SoT ships are **always real and always server-simulated** (physics + wave sim server-side) — *and that is
precisely why SoT runs only ~5–6 ships per server*; Rare **reduced** ships-per-server for performance. They
draw a low-detail hull at horizon range for draw cost only.

**This is the strongest single argument for the ledger in the entire survey.** "The horizon is real" and
"hundreds of sail" are purchasable together *only* through abstraction. SoT chose real-and-six. We want
hundreds, so we must choose abstraction — and then make the abstraction good enough that the horizon doesn't
lie (§8).

Also: SoT's wind is **global** — *"the changing direction of the wind is always the same direction for every
location on a server."* So is Minecraft's weather (one server state). Black Flag: per-region. **No shipped
game uses a continuous evaluated wind field as gameplay** (§9.4).

### 2.11 Worlds Adrift / SpatialOS — ★ the substrate ate the game

A physics MMO on SpatialOS. Shut down 2019. Bossa's own notice:

> *"The challenges that came with our ambitious project meant that **all our work went into making the game
> work, rather than making it the experience we wanted it to be.**"*

Their CTO: a SpatialOS retro-compat break left them stuck on an old version; moving *"would require rewriting
more than 40% of our code base."* And the FAQ line that should be nailed above any seamless-world project:
*"**Worlds does not run without it, nor can it be hosted outside of SpatialOS's infrastructure**"* — hence no
private servers, no open-sourcing, no preservation. The game simply ceased to exist.

The scoreboard for SpatialOS's flagships: **Nostos** shipped and died in 18 months; **Scavengers** never left
Early Access, died in 20 months, studio closed two years later; **SEED** survives — most likely by leaving
SpatialOS. Improbable exited games and **became profitable afterward**; its homepage no longer mentions
SpatialOS.

The deeper structural cause was **control, not just cost.** Improbable financed studios in exchange for
authority over their communications and finances, and — per Bloomberg's reporting — *"game makers also
agreed not to make disparaging comments about Improbable."* (Its own site conceded SpatialOS ran *"8% to 35%
more per hour"* than dedicated servers — the only citable cost figure; the folklore numbers are excluded, A.2.)
That contract is *why* the public record is thin, and it deepens the lesson from technical to total: the
vendor held the only technical key **and** the gag on complaining about it.

Bossa's next game inverted every choice — P2P, player-hosted, offline-playable — and made survivability a
**veto condition** on the partnership: *"if disaster strikes twice and we have to shut it down… the game is
still there. It's still playable."*

**The counter-case proves the same rule from the other side.** Chronicles of Elyria (Soulbound Studios)
*left* SpatialOS mid-project, by choice, and shipped a verbatim post-mortem naming three reasons: SpatialOS
load-balanced only *spatial* workers (auth, AI, their story engine still needed their own infra); the cost
was un-estimable and un-shoppable (no choice of host); and the deprecation of the JavaScript SDK was the
breaking point. **They could leave because they had kept their own engine layer underneath** — *"we already
had an efficient routing and communication protocol, an architecture that allowed for scalability… CoE is
entirely built on the Soulborn Engine."* Bossa could not leave; Soulbound could. **The difference was owning
the layer under the vendor** — which is exactly what openpiece's Phaser-free, engine-agnostic sim already is.

> **This is the missing rationale for a rule we already have.** `CLAUDE.md`: the Phaser-free deterministic
> sim "keeps headless-server/multiplayer/replay open — **never trade it away**." Worlds Adrift is *why* that
> sentence is written that way — sim/host coupling made preservation impossible — and CoE is *how you avoid
> it*: keep your own engine under any middleware, so the middleware is replaceable, not load-bearing. The
> lesson is not "coupling is fatal" but "coupling is a retrofit you must be able to afford." It is the
> epigraph for §14 — **the substrate can eat the game.** Build the sea last, on a layer you own.

### 2.12 The verdict table

Tiers per `adoption-tiers.md`: **S** = adopt now / already canon · **A** = adopt at a named milestone ·
**B** = adapt (right idea, needs reshaping) · **C** = defer until scale proves the need · **D** = do not
adopt. Status: ✅ done · 🌱 seeded · 🔨 to build · 🧊 far-future.

| Tier | Pattern | Source | Trigger | § |
|---|---|---|---|---|
| **S** | Dehydrate = drop map-coupled components (no row type) | RimWorld | with the ledger | 5 |
| **S** | Observability-driven rate + delta catch-up + hash stagger | RimWorld | with tiers | 4 |
| **S** | One engine, no second combat model | HOMM3 / RimWorld | now (free — §6.2) | 6 |
| **S** | Absolute-time bucket quantization | (derived ×2) | with the ledger | 1.1 |
| **S** | Ledger-as-truth, instance-as-view | Valheim | with the ledger | 5 |
| **S** | Seed-regenerable world + delta-only save | Valheim / Minecraft / Kenshi | with persistence | 3.5 |
| **S** | Streaming must inject zero nondeterminism (tested) | Factorio FFF-415 | with chunks | 11 |
| **A** | The ticket integer (min + flood-fill, gen folded in) | Minecraft | with chunks | 3.2 |
| **A** | Seed-pure start / reference two-phase generation | Minecraft | with chunks | 3.3 |
| **A** | (status, margin) DAG for gen stages | Minecraft | with chunks | 3.3 |
| **A** | Hash-bucket tick staggering (Normal/Rare/Long) | RimWorld / Factorio | first perf pain | 4.2 |
| **A** | GC: named reasons, depth-1 closure, stable-seed retention | RimWorld | with the ledger | 5.4 |
| **A** | Exact sleep (zero cost, not cheap cost) | Factorio | with tiers | 4.3 |
| **A** | Ordered wake-requests drained by one owner | Factorio | with tiers | 11.3 |
| **A** | Staggered load + unload hysteresis (0.1 s / 10 s) | Valheim | with chunks | 3.4 |
| **A** | Hard actor cap + prune policy | X4 / DF | with the ledger | 5.4 |
| **A** | An absolute clock that never dilates | EVE | with #18 | 11.4 |
| **A** | Aggregate, don't enumerate (one row per ship) | Valheim ⊕ Factorio | with the ledger | 5.5 |
| **A** | Deterministic positional hash (SquirrelNoise5) | Eiserloh (GDC17) | with the field | 9.2 |
| **A** | 2D curl noise via scalar stream function | Bridson '07 | with the field | 9.3 |
| **B** | Attention **radius**, not zone boundary | X4 | with tiers | 4.1 |
| **B** | Touch-based persistence | Kenshi | with persistence | 3.5 |
| **B** | World States as cheap booleans | Kenshi | #16 / #12 | 5.6 |
| **B** | Capped per-tick deltas | Elite | #12 | — |
| **B** | Cheap estimator, tiered by observability | HOMM3 | only if §6.2 measures too slow | 6.5 |
| **B** | Sub-linear `^0.7` + morale/rout (IF an estimator exists) | Bannerlord | ditto | 6.5 |
| **C** | Custom transcendentals / fixed-point | Factorio | cross-machine MP only | 11.2 |
| **C** | Uniform time dilation over selective failure | EVE | overload, far future | 12 |
| **D** | **Lockstep** — kills hidden info; we need fog of war | Factorio | — | 12.2 |
| **D** | "Just simulate it all" — only works player-authored | Factorio | — | 2.4 |
| **D** | Two rulesets that pick different winners | X4 | — | 6.1 |
| **D** | Ledger that only integrates observed input | Elite | — | 2.6 |
| **D** | Presence vetoes world change | Kenshi | — | 2.9 |
| **D** | Player-observable load boundaries | EVE grid-fu | — | 0 |
| **D** | Capped aggregate power score | M&B Warband | — | 6.5 |
| **D** | Impostor/parallax machinery | GPU Gems 3 | — (2D: a sprite is a sprite) | 8 |
| **D** | Third-party infrastructure holding the only key | SpatialOS | — | 2.11 |

### 2.13 Formal foundations — the design's mechanisms already have names

The games told us *what works*; the academic literature tells us this design's core moves are **named,
proven patterns**, not clever improvisation. A `/deep-research` pass adversarially verified these against
primary sources (3 skeptics per claim, majority to kill). **Verified** = survived; **sourced** = the source
is solid but the verification vote was lost to a session limit — treat as strong-but-unconfirmed.

- **"Evaluate, don't tick" is the DES efficiency theorem** (verified). *"As in between events the state of
  the system does not change, a discrete-event simulator need not explicitly represent the state at
  non-event times"* (McGill CS522). Polling on a fixed step is formally the wrong tool — Activity Scanning
  must size its step to the *smallest* possible inter-event gap, re-checking unchanged conditions forever.
  §1 and §4 are this theorem applied.
- **The scheduled-event queue is the Event Scheduling world view** (verified) — §7. Its determinism rule
  (strict total order on simultaneous events) and its retraction semantics (DEVS external transitions) are
  §7's rules, now proof-backed rather than intuited.
- **Hydrate-on-observation is "alibi generation"** (verified; Sunshine-Hill & Badler, AIIDE 2010 / UPenn).
  Agents are created with minimal state; detail is *"created on demand in a manner which ensures consistency
  with previous observations."* Its correctness bar is the formal form of §8.4's "the billboard must not
  lie": **every fabricated detail must be a fair sample from the distribution consistent with what the
  player already saw** — a naïve "roll a plausible value" fails it, because repeated observation reveals the
  seam. This is the academic name for §5's dehydrate/hydrate and §8's horizon billboard.
- **Quantizing STATE instead of TIME has a name: QSS (Quantized State Systems)** (sourced; Kofman). A
  continuous system quantized *with hysteresis* maps *exactly* onto a discrete-event (DEVS) model, next
  event time in closed form (σ = distance-to-threshold ÷ rate). The load-bearing consequence: **the
  tier-boundary hysteresis in §3.4/§4.1 is not anti-thrash polish — it is a correctness requirement.**
  Without a hysteresis band a quantized value can cross its threshold infinitely often in finite time (a
  Zeno blowup: infinite events, unsimulable). **Our promote-at-3 / demote-at-5 chunk band (§3.4) is the Zeno
  guard** — the ε>0 window that makes a minimum inter-event time exist at all. (An earlier draft of this
  line said "2/4", contradicting §3.4's numbers inside the very sentence claiming correctness — caught by
  the `design-reviewer`. The band is 3/5; §3.4 is the one source of truth for it.)
- **Save migration is DataFixerUpper's composable-rewrite model** (sourced): versioned schemas + typed fix
  rules composed into one converter. Its cited horror-number: DFU rebuilds its fixers at every startup,
  *">85% of load time."* §3.5's versioning should take the shape (schema-stamped deltas, composable fixes)
  without the cost.

> **What this buys the doc:** every mechanism it invented turns out to be a named pattern with a published
> failure mode we can now dodge by name. The one move with *no* prior art is §1's headline — stateless
> evaluation of a *whole living background* (alibi generation does single agents, QSS does control systems,
> DES does queues; nobody composed all three into a sea). That is the real research risk, now precisely
> located instead of diffuse.

---

## 3. Chunk mechanics

### 3.1 Size — 32×32 tiles (1024×1024 px, 1 KiB)

`TILE = 32`. Rationale against real numbers: the sea is sparse, islands are dense — size for the **island**.
32×32 matches Minecraft's chunk, Factorio's chunk, and our own recorded reference. Terrain is **1 KiB**
(`Uint8Array` ordinals; `TileGrid.ts:11` already declares the storage chunk-ready). A resident 7×7 ring is
**49 KiB** — memory is not the constraint, bookkeeping is.

**The uniform-chunk fast path is what makes the sea free**: an all-deep-water chunk stores one ordinal and a
flag, not 1024 bytes. Most of the world is that chunk.

*Rejected: 64×64* — 4× the generation hitch at the load edge and 4× waste on a coastline that clips a corner.

### 3.2 The ticket integer *(replaces the first draft's four tiers)*

A chunk's aliveness is **one integer**, the `min()` of every ticket flood-filled outward +1 per step. Ours,
with **named constants** (Minecraft's own lesson — 31/32/33 are folklore there):

| Constant | Level | Meaning |
|---|---|---|
| `LVL_FULL` | 31 | full sim — entities tick at `SIM_DT` |
| `LVL_COARSE` | 32 | terrain/structures live; entities at reduced rate (§4) |
| `LVL_BORDER` | 33 | terrain/structures readable (collision, pathfinding, LOS); **entities here are DEHYDRATED** — nothing ticks because nothing *needs* ticking (§1: they're evaluated on read) |
| `LVL_GEN` | 34…44 | not accessible; **each level = one rawer generation stage** |

> **`LVL_BORDER` is NOT the Kenshi freeze (§2.9).** "Nothing ticks" here is the thesis paying off, not a
> world put on pause: a dehydrated entity has no tick to skip, because its state is a function of
> (seed, route, t). Frozen means *stopped*; dehydrated means *evaluated when asked*. The distinction is the
> whole doc.

### 3.2.1 The dehydration trigger — the ticket level IS the trigger

*(This was an outright hole until the `design-reviewer` pass caught it: the doc used `dehydrated` as an
input to §4.1's `rateOf` while nothing ever made an entity dehydrate.)*

> **An entity DEHYDRATES when its owning chunk (§3.7) falls to `LVL_BORDER` or below, and REHYDRATES when
> that chunk rises to `LVL_COARSE` or above.** One rule, both directions, driven by the same integer that
> drives everything else. The promote/demote hysteresis (§3.4) is what stops a body on a boundary from
> dehydrating and rehydrating every tick — and per §2.13, that band is a *correctness* requirement (QSS's
> Zeno guard), not comfort.

**Tickets have a source tag and a TTL** — and, critically, **being loaded is NOT a ticket source.** A ticket
comes from control or consequence, never from already-existing; otherwise the system is circular (anything
hydrated would keep its own chunk alive and could never dehydrate — the ledger would only ever hold things
nobody had visited):

| Source | Level | TTL | Why |
|---|---|---|---|
| a **controlled** body | `LVL_FULL` | none | **the Moat — `control` is a component, so a possessed NPC captain holds this ticket exactly as you do** |
| a scheduled event (§7) | `LVL_COARSE` | until fired + ε | the sea battle you're sailing toward, loaded before you arrive |
| a player-owned base / claim | `LVL_BORDER` | none | your dock keeps its cells readable |
| recently-left | `LVL_BORDER` | 10 s | unload hysteresis (Valheim) as a TTL, not a special case |

> **The Moat, applied to streaming:** the world does not load "around the player" — it loads around
> **ticket-holders**, and the player's body holds an ordinary ticket *because it is controlled*, not because
> it is the player. Any rule that reads `distanceToPlayer` is a Moat violation. An NPC ship does **not**
> ticket itself into permanence: it is hydrated exactly when a ticket-holder is near it — the identical rule
> that hydrates yours. That symmetry IS the Moat here; a self-ticketing NPC would break both the Moat and
> prime directive #5.

### 3.3 Generation is pure per chunk — and the neighbour problem

```
chunkSeed = hashCombine(worldSeed, chunkX, chunkY)
stepSeed  = hashCombine(chunkSeed, STEP_ID)      // per-step, NOT sequential
```

The same chunk always regenerates identically, **independent of visit order**. `STEP_ID` is the subtle half
— seed each stage independently so inserting a stage (kelp beds) doesn't shift every later stage's
randomness and silently regenerate the world. `WorldGen.ts:177` is already pure in the seed; this makes it
pure *per chunk*.

**A chunk may never read a neighbour to generate itself.** Minecraft's two mechanisms are how an island
still spans four chunks (§2.2):
1. **The (status, margin) DAG** — each stage declares its neighbour radius *at the previous stage*. Cycles
   unrepresentable; cascading generation impossible by construction.
2. **The seed-pure two-phase** — `islandStarts(chunk)` computes island centres/params **from seed+coords
   alone**; `islandRefs(chunk)` lists nearby starts whose footprint overlaps; `features` stamps **only the
   slice inside this chunk**. A chunk learns which islands cross it **without those chunks generating.**

### 3.4 Radius, hysteresis, margin

| Knob | Value | Why |
|---|---|---|
| `LVL_FULL` radius | 3 chunks (7×7 = 49) | 3072 px of full sim around a ticket |
| unload | 5 chunks / **10 s TTL** | hysteresis — never unload what a tack re-enters (Valheim) |
| generation stagger | **one chunk per 0.1 s** | Valheim's anti-hitch, ~10 lines |
| margin | ~1792 px beyond the widest view | **≈9 s** at a caravel's 200 px/s |

That 9 s is the budget. A uniform sea chunk is instant; a dense island chunk is the one to measure. **If
generation can't fit, the answer is a background queue ordered by heading — never a smaller radius** (that
just moves the pop-in closer).

### 3.5 The UNLOAD contract — the delta IS the save

| Layer | On unload | Why |
|---|---|---|
| Terrain (generated) | **discarded** | pure fn of (seed, coord) |
| Terrain (mutated) | **sparse cell delta** | #16's frozen sea, burn scars, quake scars |
| Structures | **entity records** | `StructureIndex` is a *derived* index (`StructureIndex.ts:15`) — a chunk reloads by re-placing entities |
| Entities (touched/named) | **dehydrate** (§5) | the ship, the captain, the rival |
| Entities (untouched fodder) | **discarded** | regenerates from the spawn table; never a character |

> **An untouched chunk persists ZERO bytes.** Three shipped proofs: Minecraft's Anvil header (offset 0 =
> absent), Valheim's `--resetWorld` (regenerates every zone with no player structures), Kenshi's
> touch-based persistence (homeless squads deleted on leave).

**Kenshi's touch rule is the policy** for the entity rows: an NPC becomes persistent **once you've been near
it**. Save size then tracks *places you touched*, not world size.

**The format is not a new invention** — it is a subset of `ecs/snapshot.ts` (`2645b06`), which already
serializes entities to plain JSON with ids-at-rest and rebuilds derived indices. Chunk deltas and the world
save **must share one serializer**, or the second one will be wrong. *That is why persistence is sequenced
first.*

### 3.6 Versioning & migration — the day-one discipline *(second research pass, verified)*

Versioning is not optional, and it is the pillar built FIRST — so the format has to survive years of updates
from its very first byte. The hardening research (§2.13 sources) surfaced two shipped models and one horror
story that lands directly on our code:

**★ The horror story is OUR situation.** GearBlocks serialized its world as a positional binary blob through
one code path that fed **both the on-disk save AND networked construction data** — exactly what
`snapshot.ts` does for us (live snapshot + future save share one serializer). The result: *"if I add or
remove any variables to be saved, or reorder them, then old saved games will no longer load"*, and the
version-convert code the dev bolted on he calls, verbatim, *"a hack… messy and hard to maintain."* Because
the serializer was shared, the fragility spread to the network path too.

> **The rule that falls out: tagged, self-describing records — never positional blobs.** Every serialized
> field is named or id-keyed, so adding/removing/reordering a field can't silently break an old save; every
> record carries a schema version; a reader meeting an unknown version **fails loud**, never guesses. This is
> the minimum that keeps migration *always possible*, and it must hold from `snapshot.ts`'s first on-disk
> write — retrofitting it after saves exist is the GearBlocks trap. (Our ids-at-rest discipline is already
> half of this.)

**Two production migration models, both verified — steal Factorio's:**
- **Minecraft DataFixerUpper** — composable *typed* rewrite rules (a `Schema` = type definitions, a `DataFix`
  = a rewrite rule between two schemas, `DataFixerBuilder` composes an ordered chain). Powerful, but **eagerly
  built at startup for every schema** — reportedly *">85% of load-screen time"* (one profiling figure,
  hardware/version-dependent — cite as such, not a constant). A linear version-stepping chain.
- **Factorio** — **no single version counter**; each save remembers the *set of migration filenames already
  applied* and runs each at most once, idempotent and order-independent, with `on_configuration_changed` as
  the one reconciliation hook. Lighter, and the better fit for chunk-deltas that arrive out of order. **Lean
  Factorio's model: a per-save applied-set, not a global schema number** — a chunk written three versions ago
  and one written today must both load, so a monotonic counter is the wrong shape.

And per §2.3's corruption bug: **no unbounded per-record accumulator** — any per-chunk list needs a ring
buffer or a TTL from day one (Valheim's spawn-timestamp list grew past the record cap and corrupted the zone).

### 3.7 Boundary ownership — a KNOWN GAP, decided at implementation *(second research pass: no evidence)*

An entity sitting exactly on a chunk seam, a structure straddling 2–4 chunks, a projectile crossing a border
mid-tick — *which chunk owns it?* This is the one hardening question the research **could not answer**: it
returned zero verifiable claims on how Minecraft/Factorio/Valheim resolve boundary ownership. That absence is
itself the finding — **it is an implementation-time decision, not a research-answerable one**, to be made by
reading the actual sources and our own `StructureIndex`, not by more searching. The design *constraints* it
must satisfy are already fixed by this doc, which narrows the choice:

- **Ownership must be a pure function of position** (e.g. owned by the chunk containing the entity's *center*,
  ties broken toward the lower coord) — never insertion order or load order, or §11.1's determinism contract
  breaks at every seam.
- **A multi-tile structure is ONE entity in ONE chunk** (§5.5 "aggregate, don't enumerate") — the chunk that
  owns its origin cell saves the whole record; the other chunks it overlaps reference it, never duplicate it.
  Our `StructureIndex` already stamps a footprint across cells from one entity, so this is the existing idiom.
- **Crossing a seam re-homes the entity** to the new owner in the tick's ordered handoff (§11.3), the same
  shape as the deck↔world frame handoff (`frames.ts`) — a solved pattern, one scale up.

Recorded so nobody builds chunks assuming this is covered. It is the first thing to nail when §14 step 6 starts.

---

## 4. Fidelity — a rate function, not a type

### 4.1 The rate

RimWorld's `GetCameraUpdateRate` generalized; ours reads the **ticket level** (§3.2), not the camera —
because a headless server has no camera and the sim must not know one exists:

```
rateOf(e) =  1                     if chunkLevel(e) <= LVL_FULL      // every SIM_DT
             REDUCED (≈15)         if chunkLevel(e) == LVL_COARSE
             MOTHBALL (≈15000)     if dehydrated (§5)
             ∞ (not in any list)   if provably nothing changes        // Factorio's exact sleep
```

Dispatch is RimWorld's, verbatim in shape — and the **`delta` argument is §1.1's absolute-time bucket**:

```
tickDelta++
if (tickDelta > rateOf(e) || isTickInterval(hashOffset(e.id), rateOf(e))) {
  e.tickInterval(tickDelta)   // catch up ONCE, from accumulated elapsed
  tickDelta = 0
}
```

Promotion/demotion inherits the ticket's hysteresis (§3.4) — no separate thrash rule needed. **This is one
function, not a tier type.** Nothing in the ECS gains a "tier" field.

### 4.2 Staggering is a hash bucket

A reduced-rate entity lands in bucket `hash(id) % N`; tick `T` processes bucket `T % N`. Naive
`tick % 250 === 0` gives a **stutter spike every 250th tick** — every rare thing firing on one frame.
~20 lines in `World`, deterministic (id-hashed, never clock-hashed). Register/deregister go through
**deferred queues drained at the top of the tick** — never mutate a bucket mid-iteration (RimWorld).

### 4.3 The fidelity table

| System | `LVL_FULL` | `LVL_COARSE` (≈1/15) | Dehydrated (§5) |
|---|---|---|---|
| Movement / collision | full sweep, body-vs-body | move, **no body collision** (X4's rule) | route integrated per §1.1 |
| AI brains | full FSM every tick | FSM on its bucket (~4 Hz) | **intent only** — no states |
| Combat | full GAS-lite | full GAS-lite (§6 — no second model) | **§6.2 headless, or §6.5 estimator** |
| Ships | full sail model | sail model, no hull-vs-hull | route + ETA |
| Wildlife | full | bucketed (~0.25 Hz) | **a population count**, not animals |
| Economy | — | bucketed | rate × elapsed on read |
| Structures | full | static | delta only |
| Aging / records | full | full | **the only things a mothball ticks** (RimWorld) |
| **Wind / weather** | **evaluated** | **evaluated** | **evaluated** |

> **Wind has no row-variation** — the tell that §9's evaluated-field rule is right. A pure function of
> (seed, x, y, t) has no fidelity, because there is nothing to tick.

**Exact sleep beats cheap sleep.** A chunk with nothing in it is not "ticked cheaply" — it is *in no list at
all*. Factorio's asleep entities cost literally zero, and inactive means **provably nothing changes**, not
"probably nothing important."

---

## 5. Dehydration — fewer components, not a new type

### 5.1 The reframe *(the survey killed the first draft here)*

The first draft designed a `LedgerRow` type and a `world/ledger.ts` to convert entities into it. **RimWorld
shows that's unnecessary, and our own canon makes it actively wrong.** `DESIGN_PATTERNS.md` §4: *"Presence
is state… attach with assignment, detach with `delete e.melee`."*

> **Dehydrate = `delete` the map-coupled components. Hydrate = re-add them.** The entity is the same entity,
> with the same id, the whole time. There is no row, no conversion, no second representation to keep in sync.

Valheim proves ledger-as-truth works; RimWorld proves you don't need a separate type to get it. We get the
better half of both because our ECS already treats component removal as the idiom.

### 5.2 Map-coupled vs identity — the classification

Every component is one or the other. This table **is** the dehydration contract:

| Component | Class | On dehydrate |
|---|---|---|
| `transform` | map-coupled | **dropped** — position is the route's to evaluate |
| `mover`, `onDeck` | map-coupled | dropped |
| `melee`, `projectile` | map-coupled | dropped (a swing in flight is not a fact worth keeping) |
| `render`, `accessories` | presentation | dropped |
| `ai.bb` path/steering fields | map-coupled | dropped — derived, rebuilt on hydrate (`PATHFINDING.md`) |
| `identity`, `faction`, `grudge` | identity | **kept** |
| `health`, `attributes`, `tags`, `equipment`, `loadout` | identity | **kept** |
| `inventory`, `loot` | identity | **kept** — cargo is the strategic layer's substance |
| `ship` (hull id, damage) | identity | **kept** |
| `crew` | identity | **kept as counts + named ids** (§5.5) |
| `route` *(new)* | identity | **the position, evaluated** |

`snapshot.ts` already refuses non-plain components by throwing — so this classification is **machine-checked
the moment a dehydrated entity is saved.** That is B's harness paying for C's design, unplanned.

### 5.3 What survives the round trip

Ids-at-rest is the enabler and it already holds (`World.ts:56`, `components.ts:116`), including
`World.advanceNextId` guarding re-issue. The asymmetry is the design:

> **★ Named things persist; countable things count.** The captain is an entity. The 39 deckhands are
> `crew.count = 39` plus a def id, regenerated on hydrate. RimWorld's mothball ticks **only aging and
> records** — that is this rule, shipped.

**Kenshi's failure is the rule's teeth:** anything not kept is *destroyed*, and an overridden Kenshi town
forgets player-built structures forever. Hydration must be a **projection of what's kept**, never a
regeneration that quietly invents.

### 5.4 The GC — and a leak already in our components

Dehydrated entities accumulate. X4 didn't cap and ships 500 MB saves; DF caps world population; RimWorld GCs
and **still leaks**. Ours, taking RimWorld's shape and avoiding its bug:

- **Roots are named reasons**, not booleans — `"CrewOf(ship#41)"`, `"FactionLeader"`, `"Nemesis"`,
  `"QuestReserved"`, `"Touched"` — so "why is this still alive?" is answerable in a debug readout.
- **Closure is depth-1.** An entity kept by a relation does not drag in *its* relations.
- **Stable-seeded retention** for flavour NPCs: `chanceSeeded(0.25, id ^ K)` — the same ones survive every
  pass, no churn.
- **Incremental + interruptible**, doubling its rate when cancelled, so a busy world still converges.
- **A hard cap** (X4/DF): the ledger has a maximum, and factions *maintain* their actor count rather than
  growing it.

> **★ FLAG — this lands on existing code.** RimWorld's unfixed leak is caused by **append-only logs and
> symmetric relations as GC roots**. `components.ts` has `grudge: { ids: Set<number> }`, documented as
> *mutual, permanent* — the exact shape. The Nemesis system (#6) deepens it. **Rule: `grudge` must not be a
> GC root by itself.** Either give grudges a TTL, or store `{id, nameSnapshot}` so a collected entity leaves
> a legible scar instead of pinning a whole entity graph forever. This is a real bug in a real feature that
> hasn't been built yet — the cheapest possible moment to fix it.

### 5.5 Aggregate, don't enumerate

Two independent sources, opposite directions, same rule:
- **Valheim's scaling wall** is one ZDO **per building piece** — perf collapses at 5–6 players against a
  nominal 10. Mods exist purely to merge them.
- **Factorio's biggest win** was collapsing N belt items into **one** structure storing gaps: ×50–100.

> **A dehydrated ship is ONE entity — never one per part, never one per crew member.** This lands directly
> on the recorded intent that ships be **player-built from part tiles**: the part grid is `ship` component
> data, not 60 entities. Same for a convoy: a fleet sailing together is one entity with a `fleet` component
> until it fights or splits — Factorio's "only splitters break a line."

### 5.6 World States — the cheap half

Not everything needs an entity. Kenshi's **World States** (a named boolean fired by a condition set) are the
right weight for "Marineford has fallen" — one flag, no simulation. `ARCHITECTURE_SCALE.md` §11 pillar 5
already names the varbit/varp flag store; this is that, and #12/#16 should reach for it before they reach
for entities.

---

## 6. Combat: one engine, no second model

### 6.1 The divergence problem

If dehydrated and hydrated combat can disagree, **players will fight where the sim is cheap**. This is not
hypothetical — X4 ships it (30% turret fire rate out-of-bubble; players report fleets that shred capitals
abstractly getting decimated concretely — *"each mode functions like an entirely different game"*), and
Bannerlord needed **five years** to patch the same class of bias.

Our exposure is real the moment the strategic layer (#12) exists and you own ships that fight elsewhere.

### 6.2 The answer we already paid for

> **Gus Smedstad (HOMM3 AI programmer): *"'Quick Combat' is exactly the same as running the combat with Auto
> Combat on. The same code is executed, it's just run with the animations off."***

**This is free to us, and we bought it already.** The Phaser-free sim + seeded `Rng` + fixed `SIM_DT` is
*exactly* the precondition. The property that buys a headless server and replay is the same property that
lets an off-screen battle be **the real GAS-lite engine with rendering off**. `AI_GYM.md` already measured
the cost: *"a 30 s fight ≈ 1,800 `SIM_DT` steps — single-digit milliseconds headless,"* parallel across
`worker_threads` because fights share nothing.

RimWorld makes the same choice harder: grepping its entire decompile for `SimulateBattle|AutoResolve` returns
**zero hits**. It LODs *time*, never *combat resolution*.

> **Do not write a second combat model.** Total War's decade of per-case autoresolve patching is what the
> alternative costs.

### 6.3 Monotonicity, not agreement

One engine doesn't eliminate divergence — it converts a **model mismatch** into an **AI skill gap** (the
scorer doesn't focus-fire as well as you do). That is the good failure:

> **★ Monotone divergence: showing up is never *worse* than not showing up.** Perfect agreement is
> unachievable (AoW proves it, Total War proves it expensively). Monotonicity is achievable and is the
> property that kills the exploit — you can't farm the abstraction, only under-perform it.

And it makes "sail to the battles that matter" a real strategic decision: **the headless resolution is the
expected outcome; being there is your skill as variance on top.**

### 6.4 The gym is the calibrator

If §6.5's estimator ever exists, `AI_GYM.md` is already the harness that keeps it honest — its scenario
matrix, **holdout scenarios**, and ladder gate are exactly fit-the-abstraction-to-simulated-outcomes. CA does
this for Total War (*"improvements to our auto-test system… allowed us to gather better data"*) with an
unpublished methodology; ours would be a gym run. **The gym was designed for AI tuning; it is the same
machinery.**

### 6.5 IF an estimator is ever needed

Only if §6.2 measures too slow at scale — and **measure first**. Smedstad's caveat is the precedent: HOMM3
kept a cheap estimator for the bulk background case, **tiered by observability**. Then:
- Sub-linear `(attackerPower/defenderPower)^0.7` (Bannerlord) — elites strong, not invincible.
- A **morale/rout threshold** — the non-linearity that makes quality matter (Bannerlord's 2025 fix).
- **Never a capped aggregate score.** Warband's `clamp(strength/20, 1, 50)` saturates at 1000 and makes 50
  knights ≡ 1000 looters. *A cap on an aggregate is an exploit generator.*
- Every coefficient on a **Def**, never a constant — it's our canon, and it's the only reason Bannerlord's
  math is documentable at all.

---

## 7. Scheduled interactions

Two dehydrated fleets on crossing routes must be able to meet with nobody watching. **Do not poll the ledger
each tick for intersections** — O(n²) per tick on the thing that was supposed to cost nothing.

When a route is **set**, solve its intersections against known routes and push a **dated event** onto a
time-ordered queue. The director pops by world-time. A meeting at `T` fires at `T`, deterministically,
whether or not anyone is within a thousand chunks. The event holds a `LVL_COARSE` ticket (§3.2) so the sea
battle you are sailing toward is *loaded before you arrive*.

**This is not a novel trick — it is the Event Scheduling world view**, a named, 60-year-old discrete-event
simulation (DES) pattern, and the formal literature hands us three correctness rules we'd otherwise learn by
bleeding (all adversarially verified against primary sources — see §2.13):

- **Ties break by a STRICT total order, or the sim is non-deterministic — full stop.** DES is explicit:
  *"If priorities do not resolve a collision to one single event, the selection becomes implementation
  dependent… leads to different simulation results on different platforms"* (McGill CS522). Order by
  `(time, entityId)` — never insertion order, never map iteration, never float equality. Any unbroken tie is
  a reproducibility bug, not a harmless detail. This is the same rule as §11.1 clause 5, now with a proof.
- **Route changes retract — and the event must be KEYED ON STATE, not trusted blindly.** DEVS handles this
  as an *external transition* that recomputes the deadline: a pending event is abandoned when the world
  changes under it. The sharp version: when an event fires, **re-derive it from current state before acting**
  (did these two ships *still* meet here?). A scheduled event is a hint, not a fact.
- **★ The exact internal/external tie is the documented trap.** Classic DEVS has an acknowledged defect:
  when a scheduled arrival and a state-change land on the *same* tick, the scheduled one is **silently
  dropped**. Parallel DEVS exists solely to fix this. So: define behavior for "the battle fires the same tick
  the route changes" *explicitly* — never let it fall through.

*Rejected: resolving lazily "when the player next looks."* Makes history depend on attention — Elite's
mistake (§2.6), the exact nondeterminism this design exists to avoid.

---

## 8. THE HORIZON PROBLEM

### 8.1 There is no horizon today

`CAMERA_ZOOM = 2` (`constants.ts:130`). Effective view: **640×360 world px** — 20×11 tiles, half-width
**320 px**. A galleon is **352 px long**.

> **You cannot see a ship on the horizon; you cannot see a ship one ship-length away.**

The backlog frames this as "render LOD ≠ sim LOD", but today **render distance is far SHORTER than sim
distance** — the opposite of the premise. The moat shot has no room to exist, and no ledger design creates it.

### 8.2 The sea zoom is the load-bearing decision

`horizonRadius = (GAME_W / 2) / zoom`

| zoom | view (world px) | half-width | tiles | reads as |
|---|---|---|---|---|
| 2 (today) | 640×360 | 320 | 20×11 | brawler — right on foot, blind at sea |
| 1 | 1280×720 | 640 | 40×22 | two wheel notches out |
| **0.5** | **2560×1440** | **1280** | **80×45** | a sea worth navigating |

At 0.5 a sail appears 1280 px out — **6.4 s** of caravel closing time: enough to see it, read its heading,
decide. It is also *the entire current world* (2752 px) nearly on one screen — the clearest statement that
86×54 is not a sea, it's a pond.

**Recommendation: zoom is a per-mode knob** (foot 2 → helm 0.5, eased on the seat transition), not a global.
It is also **the cheapest slice of this entire document** — a knob and a lerp, buildable today, independent
of chunks, and it answers "how far should you see?" with a playtest instead of a guess.

### 8.3 The render side is a non-problem

The impostor literature (octahedral impostors, GPU Gems 3 *True Impostors*) solves **view-angle parallax on
3D geometry**. In 2D top-down **a distant ship is already a sprite** — one draw call, no angle problem.
*Don't import that complexity.* The horizon is a **sim-LOD problem wearing a rendering costume**.

### 8.4 The billboard must not lie

A distant sail draws from the dehydrated entity — presentation reading sim, exactly as `RenderSystem` reads
components. The sim never knows the billboard exists.

**Hydration is a promise coming due.** The hull that materializes must carry the identity, heading, flag and
damage the billboard showed. That is free *because* §5.1 keeps the same entity with the same id the whole
time — there is no second representation that could disagree. Kenshi's visibly-fake hydration (§2.9) is what
the alternative looks like.

> Done right, *"the world-sim is literally visible from your deck"* is not a feature — it is a **consequence**
> of the entity being real the whole time.

---

## 9. Wind & weather — the evaluated field

### 9.1 The rule, and its real justification

> **`wind(seed, x, y, t) → {dir, strength}` — a pure function. Evaluated, never integrated.**

The first draft justified this with the navigator's forecast. **The survey found a stronger reason:**

> **A dehydrated ship needs no stored wind state — the pure field is what makes dehydrated sailing possible
> at all.** The forecast is a bonus; the ledger is the point.

Also free: spatial variation is the same function (a squall is a high-frequency term), so there is nothing
per-chunk to persist and no seam at a chunk edge — and wind has no fidelity row in §4.3.

### 9.2 Determinism — JS is a lucky case

ECMAScript numbers are IEEE-754 f64, and **`+ − × ÷` and `Math.sqrt` are correctly rounded and exactly
specified** → bit-identical across engines. Only **`Math.sin/cos/pow/exp/atan2` are implementation-defined**.

**Gradient noise needs none of them** — Perlin's fade `6t⁵−15t⁴+10t³` is pure arithmetic. So:

> **Integer hash + f64 polynomial interpolation is bit-deterministic today, with no fixed-point.**

Use **SquirrelNoise5** (Eiserloh, GDC 2017) — all-integer via `Math.imul` + `>>>0`. It is **stateless and
positional**, which is *why* it fits: `wind(seed,x,y,t)` needs unordered access and a streaming PRNG
fundamentally cannot provide it. **`core/Rng.ts` (streams) and a positional hash are complementary tools,
not competitors** — a new `core/hash.ts`, not a replacement.

### 9.3 The shape — curl noise, and two fields not one

**OpenSimplex2F with `ImproveXY`.** The Simplex patent expired 2022-01-08, so it's a free choice — but
OpenSimplex2 wins for a non-legal reason: `ImproveXY` **domain-rotates the lattice for exactly the (x, y, t)
case**. Naive 3D noise with time as the third axis puts lattice planes parallel to XY, so the field **pulses
in place instead of flowing**.

**2D curl is the cheap case**: a scalar stream function ψ, `v = (∂ψ/∂y, −∂ψ/∂x)`, ε≈1e-3. Divergence-free
because divergence-of-curl is identically zero. **Why it matters as gameplay:** raw 2-channel noise has
**sources and sinks** — points that shove every ship away, and convergence points that suck ships in and pile
flotsam forever. Those are **ship-traps**, and they are a bug you would chase for weeks. Curl gives closed
gyres, no traps. **Bonus (from Bridson's paper): ramp ψ by distance-to-obstacle and flow bends around solids
exactly** — that's our islands, free, no special-casing.

**Honest caveat — one field cannot do both.** Divergence-free is physically *wrong* for storms; real
convergence zones are where weather forms. So: **curl for the flow layer** (sails, drift) + **a separate
plain-fBm scalar pressure field** for storms.

**fBm:** lacunarity 2.0, gain 0.5 — but **decouple spatial from temporal lacunarity**. Prevailing wind =
octave 0, huge wavelength, near-zero time frequency; gusts = high octaves with `timeLacunarity` ≈ 2–3, so
gusts *evolve faster*, not merely smaller. One shared lacunarity gives gusts that crawl — the classic
wrong-feel bug.

**Cost:** ~2 µs per wind sample (2D curl, 4 octaves). 100 ships @60 Hz ≈ **1% of one core** — a non-issue.
What bites: route integration (~0.4 ms/query — cache, recompute on route change). **Optimization: the
prevailing octave is smooth by construction — sample per-chunk and bilerp; only gusts need per-ship
evaluation (~4×).**

### 9.4 ★ The legibility risk — nobody ships this

**No shipped game uses a continuous evaluated wind field as gameplay.** Sea of Thieves: *"the wind direction
is always the same for every location on a server."* Minecraft: one global state. Black Flag: per-region.
Black Flag *Resynced* is moving **toward** integrated per-region state — the thing this rule rejects.

**Why they all chose global: legibility.** Global wind is a *shared fact* the whole server can name and argue
about. A field means the wind at your bow differs from 200 m out and players cannot reason about it.

**Mitigation, and it's a good one:** give the prevailing octave a **~4000-tile wavelength**, so it is
effectively uniform across any one screen; let only gust/eddy octaves vary locally. That buys SoT's
screen-scale legibility *and* a world-scale field.

> **This is a design bet, and it should be recorded as one.** It is defensible — the navigator-reads-the-
> future mechanic is exactly what global wind cannot do, and the ledger *requires* a field. But it is not
> industry standard, and **the wind readout UI is load-bearing, not polish.**

### 9.5 FLAG for Session A — wind is integrated, not evaluated

`systems/WindSystem.ts` (shipped in the sailing work) **accumulates**: `this.dir += err * k`, retargeting off
the injected stream. It is deterministic and correct for what it ships — one global vector, full-sim only,
and the forecast works by peeking `targetDir`. **Not a defect**, and A marked the persistence seam honestly
in its own header.

But it is **not random-access in time**: `wind(t)` for a future `t` requires ticking forward (or cloning
`Rng.state` and speculatively advancing). Dehydrated route integration and the per-chunk field both need
random access. **Recorded so that "make wind evaluated" is a known, scoped ~40-line change at #14's trigger,
not a surprise.** The knobs (`RETARGET_*`, `VEER_MAX`, `EASE_TAU`, the strength band) survive the rewrite —
they become the field's frequency/amplitude terms rather than an accumulator's.

Note also: `Math.exp` in its easing is one of the implementation-defined functions of §9.2. Same-machine
replay is unaffected; cross-machine lockstep would be. See §11.2 — this is a seam to know about, not a fire.

---

## 10. Geometry & travel time

Travel time is the **design variable**; world size is the *output*. At a caravel's 200 px/s:

| If crossing C1 should feel like… | …then C1 is | in chunks | resident cost |
|---|---|---|---|
| 2 min | 24,000 px (750 tiles) | ~23 across | 49 KiB |
| **8 min** | **96,000 px (3000 tiles)** | **~94 across** | 49 KiB |
| 20 min | 240,000 px (7500 tiles) | ~234 across | 49 KiB |

**Resident cost is flat** — that is the whole point, and the reason world size is a *feel* decision, not an
engineering one. For scale: the current world is **2752 px** — **13.8 seconds** end-to-end. An 8-minute C1 is
~35× its span, ~1200× its area.

**Landmark visibility couples §8.2's zoom to island spacing.** If you can see an island at the horizon
radius, you can navigate by sight and a chart has something to be a chart *of* (#9). **Islands should sit
~1–2 horizon radii apart** — one visible anchor between them, not zero (featureless) and not five (a
corridor).

**The method behind the number — derive size from density, don't fix it up front** *(Burgess, GDC 2011,
verified)*. Choosing a world size first and populating it later is *"a trap we fell into with Fallout 3."*
The discipline: pick a **"vertical chunk"** (Burgess uses a square quarter-mile — for us, roughly one
horizon-radius tile of sea+island), populate it to the target POI density, then let total world size fall
out of how much of that you can afford to author. That is the same "travel-time is the variable, size is the
output" rule above, arrived at independently. And the **"valley of boredom"** is real: player interest sags
after leaving one island and before the next, and the fix is **seeded intermediate POIs** along the route
(a derelict, a reef, a lone sail) — Bethesda literally drew lines along quest paths to place them. This is
the design half of §10; the empirical half — *how many minutes players actually tolerate* — **did not
survive verification** (no shipped crossing-time numbers surfaced), so §15 Q2 stays a playtest call, not a
number we can borrow.

---

## 11. Determinism under streaming — the contract

Session B proved same-seed replay (`2645b06`). **Streaming is the thing most likely to break it**, and
Factorio is the proof that it breaks *quietly*.

### 11.1 The contract (each clause is testable)

1. **Generation is pure per chunk** — `f(seed, coord)`, per-step seeded, no neighbour reads (§3.3).
2. **Load/unload order cannot reach sim state.** Visiting is a *read*. The test: stream a world two ways
   (straight line vs a spiral), assert identical hashes.
3. **Dehydrated evaluation is bucket-quantized to absolute time** (§1.1) — not to the dehydration instant.
4. **Wake/promotion order is deterministic** (§11.3).
5. **Scheduled events tie-break on `(time, id)`** (§7).
6. **★ No worker/core count reaches the sim.** FFF-415, verbatim: parallelism changed generation results and
   hid for seven years. If chunk generation is ever moved to a Worker, this is the test that must exist
   *first*.

### 11.2 The transcendental seam — honest scope

`Math.sin/cos/pow/exp/atan2` are implementation-approximated in ECMAScript; `+ − × ÷ sqrt` are exact (§9.2).

- **Same-machine replay** (what B proved, what the gym needs, what CI needs): **safe today.** Same engine,
  same results.
- **Cross-machine lockstep**: **not unsolvable — there is a concrete path** (verified 3-0, §2.13). Two
  options, either a seam not a rewrite: (a) a pinned `core/simMath.ts` — an fdlibm/table trig, as Factorio
  wrote its own; or (b) **compile the sim to WebAssembly**, which confines nondeterminism to a *small
  enumerated list that excludes FP add/sub/mul/div/sqrt* — so wasm arithmetic is bit-exact across
  V8/SpiderMonkey/JSC. Caveat that survives even wasm: **NaN bit patterns are not portable**, so a lockstep
  checksum must hash *canonicalized values*, never raw float bits, and the sim must stay NaN-free (the canon
  already bans NaN via clamps).

Today the sim's transcendental surface is small — wind's `Math.exp`, steering's trig, the canon's mandated
`Math.exp(-k*dt)` decay. **Do not build either option now.** Record the seam, keep the surface small, note
that §9.2's noise design deliberately needs none of it — and that the engine-agnostic-sim discipline (the
same one that makes a headless server possible, §2.11) is exactly what keeps the wasm path open.

### 11.3 Ordered wake-requests

Factorio: threads may not wake an inserter directly — *"If Inserters would activate in a different order,
desyncs would happen."* They push **requests**; one owner drains them in a fixed order. Ours: promotion and
demotion (§4) are **requests drained by the tick's owner in id order**, never applied where they're
discovered. This is also RimWorld's deferred register/deregister queue (§4.2) — two independent codebases,
same answer.

### 11.4 The clock never dilates

EVE's rule (§2.6): skill training, industry and **reinforcement timers** are never time-dilated, because
dilating them lets players game when consequences land. Ours, for #18: **world-time advances at exactly one
rate regardless of fidelity.** Fidelity changes *how often a thing is evaluated*, never *what time it is*.
Bucket quantization (§1.1) is what makes those two independent.

### 11.5 The test harness — enforce the contract, don't just assert it *(second research pass, verified)*

§11.1 lists the contract; this is how you *catch* a violation, because the FFF-415 bug proves assertion isn't
enough — it hid seven years in a game that *believed* it was deterministic. Factorio's actual toolchain
(FFF-47/76, all verified 3-0), adapted to our scale:

- **Cheap per-tick heuristic hash** (entity count, control state, ledger size, Rng cursor) — nearly free,
  runs in the live sim, catches divergence at the tick it happens. `invariants.test.ts` already hashes worlds.
- **Full-state CRC every tick + a human-readable-tagged dump every tick** — a heavyweight *debug* mode (slows
  the sim to a crawl, so it's a diagnostic not a default). When two runs diverge, you **binary-diff the two
  tagged dumps at the first mismatching tick to the exact differing field** — that's what turns "it desynced"
  into "this variable, this tick."
- **Replay re-CRC to bisect the FIRST divergent tick.** Record per-tick CRCs on run A; replay and re-hash; the
  first mismatch *is* the bug's tick. This is why B's replay harness (`2645b06`) is load-bearing infrastructure,
  not just a test.
- **Save→load→resimulate equivalence ("Heavy Mode")** — save and reload *every* tick and assert the reloaded
  state matches; this is what surfaces **un-serialized hidden state** (the FFF-340 class: a cached derived
  value nobody persisted). Directly extends B's snapshot round-trip test from once-per-run to every tick.
- **★ The FFF-415 test the contract needs and nobody had:** generate the same chunks under **varying
  worker/core counts** and diff the output. Re-running on one machine would *never* have caught it — the bug
  was that core count changed the result. So the streaming-determinism suite must vary the thing that broke:
  thread count, scheduling, visit order (§11.1 #2), load/unload order. **The invariant is `chunk = f(seed,
  coord)` and NOTHING else** — the test's job is to prove "nothing else" by wiggling everything else.

These extend a harness that already exists (`invariants.test.ts`); none is new machinery, and every one maps
to a §11.1 clause. Build them *with* the chunk system, not after — the seven-year lesson is that this class of
bug is invisible until you specifically hunt it.

---

## 12. The multiplayer projection

`DEEP_SIMULATION.md` §7 settled the stack (server-authoritative, Colyseus rooms, thin client predicting with
the *same* TS sim). This chapter only records what **this** design changes about it.

### 12.1 The ledger shrinks the sharding problem

§7 says *"each tile/region = a zone/shard… sailing across a boundary is an invisible handoff."* Cross-shard
authority handoff is **the hardest problem in the industry** — Star Citizen has spent roughly a decade on
server meshing, and SpatialOS was an entire company's attempt that ended with the company **exiting games**
(§2.11).

> **Evaluation makes most of that problem not exist.** A dehydrated sea needs *no shard* — it is evaluated
> on read. Shards are needed only **where ticket-holders cluster**, which is a far smaller problem than
> "mesh the world." The seamless sea does not require seamless *servers*.

### 12.2 Determinism ≠ lockstep — and we want only one of them

Factorio's lockstep is beautiful and **we must not copy it**. Its cheat-resistance comes from everyone
simulating everything — which means **everyone knows everything**; it ships the whole save on join. Hidden
information is impossible.

Openpiece **requires** hidden information: `AI_INTELLIGENCE.md`'s knowledge economy, fog of war, the
navigator's private forecast. So:

> **Keep determinism (replay, rollback, headless authority, tiny input logs, the gym). Reject lockstep.**
> They are separable, and that separation is the whole architecture.

### 12.3 The billboard is interest management

A dehydrated entity replicated as a horizon billboard **is** AoI/LOD for netcode: cheap abstract state at
range, full state up close. §8's horizon and §12's interest management are the same mechanism seen from two
sides — which is a good sign the abstraction is real.

### 12.4 Preservation is an architectural requirement

Worlds Adrift (§2.11) could not be preserved because its sim could not run without its host. Our sim is
Phaser-free, deterministic, and headless **today** — a local build and a self-hosted server are already
possible. Bossa made this a veto condition on their next partnership after learning the hard way. **Any
future infrastructure choice that makes the sim unable to run locally is disqualified**, regardless of what
it offers.

---

## 13. Traps (rejected on the record)

- **Slow-ticking the distant world.** Makes cost scale with the world and history depend on visit order.
  Evaluate, don't tick. (§1)
- **A separate ledger row type.** RimWorld shows components-off is enough; our canon says presence is state.
  A second representation is a second thing to desync. (§5.1)
- **A second combat model.** Total War's decade; Bannerlord's five years. One engine, rendering off. (§6.2)
- **Chasing perfect autoresolve agreement.** Unachievable. Chase monotonicity. (§6.3)
- **A capped aggregate power score.** Warband's `clamp(strength/20,1,50)`: 50 knights ≡ 1000 looters. (§6.5)
- **Polling the ledger for intersections.** O(n²) per tick on the thing that costs nothing. Schedule. (§7)
- **A chunk reading neighbours to generate.** Cascading generation + visit-order dependence. Two-phase. (§3.3)
- **Billboards with their own state.** Guarantees the horizon lies at hydration. (§8.4)
- **Bespoke chunk-delta format.** Two serializers = one is wrong. Share `snapshot.ts`. (§3.5)
- **Unbounded per-record accumulators.** Valheim's spawn-timestamp list corrupts the zone. (§3.5)
- **Logs / symmetric relations as GC roots.** RimWorld's unfixed leak; our `grudge` is that shape. (§5.4)
- **One record per part / per crew member.** Valheim's wall. Aggregate. (§5.5)
- **Presence vetoing world change.** Kenshi waits for you to leave; the world must change while watched. (§2.9)
- **Player-observable load boundaries.** EVE's grid-fu: if it's detectable, it's a mechanic. (§0)
- **Lockstep.** Kills hidden information, which we require. (§12.2)
- **Impostor/parallax machinery.** 2D top-down: a distant ship is already a sprite. (§8.3)
- **Region scenes / an embark screen.** Already rejected (`ARCHITECTURE_SCALE.md` §5). Named so it stays dead.
- **Third-party infra holding the only key.** Worlds Adrift died of it. (§2.11, §12.4)

---

## 14. Build order (triggers, not dates)

> *"All our work went into making the game work, rather than making it the experience we wanted it to be."*
> — Bossa Studios, on Worlds Adrift. **The substrate can eat the game.** Hence: the sea is built LAST, and
> every step below pays off on the map that already exists.

0. **The sea zoom** (§8.2) — a knob and a lerp. **Zero dependencies; ships today.** The only step that makes
   the moat *visible* before the substrate exists, and it settles §8 with a playtest instead of a guess.
1. **Persistence (pillar 2)** — the recorded prerequisite. `snapshot.ts` (`2645b06`) is the seed; missing are
   the on-disk format, **schema versioning + migration** (§3.5), and **system-held state (wind, Rng stream
   positions) which the entity snapshot does not cover** (inbox C-3).
2. **The clock (#18)** — co-designed, not sequenced after. Tick-tiers and the calendar are one substrate, and
   §11.4's never-dilating clock is its rule.
3. **Fidelity rates + hash-bucket staggering** (§4) — buildable on the **current fixed map**, no chunks.
   Trigger: first perf pain from wildlife/towns/ships (`adoption-tiers.md` B#12/B#13).
4. **Dehydration** (§5) — component-drop + the GC, on the fixed map. Trigger: the second island, or the first
   ship that should exist while unwatched. **This is where the living sea actually arrives.**
5. **The evaluated wind field** (§9) — when dehydrated sailing needs it, or the navigator does.
6. **Chunks** (§3) — **last**, at the recorded trigger (world size / entity counts). Everything above works on
   a fixed map; chunking only removes the map's edges. `WorldScene.ts:111`'s
   `setBounds(0, 0, WORLD_W, WORLD_H)` is the one line that hard-codes a finite world.

> **Note the shape:** the parts that carry the living-sea *feel* (rates, dehydration) are steps 3–4 and need
> no chunks at all. Chunking is an optimization for a world we haven't built yet. Building it first is the
> Worlds Adrift failure mode.

---

## 15. Open questions for the developer

1. **The sea zoom (§8.2)** — is 0.5 the sea, or further? A feel call, the only one blocking step 0.
   *(Claude's guess: 0.5 at the helm. The mouse wheel floors at `CAMERA_ZOOM_MIN` = 1 on foot — 0.5 was tried on 2026-09-17 and judged too far for the foot view; drop the floor to 0.5 temporarily to sanity-check at the wheel.)*
2. **How long should C1 FEEL to cross (§10)?** All world geometry falls out of this number. 8 minutes is a
   placeholder, not a recommendation.
3. **★ The wind-field legibility bet (§9.4).** Nobody ships an evaluated field; everyone ships global wind,
   for legibility. The ~4000-tile prevailing wavelength mitigates it, but this is a real bet and it's yours
   to take or refuse. *If refused, §9 still holds* — a global evaluated `wind(seed, t)` keeps the ledger and
   the forecast and drops only spatial variation.
4. **Does the frozen sea thaw (#16), and on what clock?** #16's question, but the *cost* is this doc's: a
   permanent mutation is a delta forever; a thawing one is a delta with an expiry. **Expiring deltas are
   dramatically cheaper** — that is a design lever, not just an optimization.
5. **Do named NPCs age/die off-screen?** RimWorld's mothball ticks exactly aging + records, so it's nearly
   free. But #3 (death) and #18 (time) decide whether it *means* anything. Flagged as theirs.

---

## Appendix A — sources

**A.1 Primary/technical.** Factorio FFF-36 (custom transcendentals), 47 (desync CRC), 83 (latency state),
147/156 (MP scaling), 148 (sleep), 176 (belts), 204 (prefetch), 258 (map gen), 340 (cached derived state),
364 (thread-safe wake order), **415 (the parallelism/generation bug)**, 421 (deferred robot ticks) ·
Factorio wiki: Desynchronization, Replay system, Map structure, pollution · minecraft.wiki: Chunk, Region
file format, World generation, Chunk format, Tick · Minecraft `ChunkStatus` (1.13.2 source; modern
`taskMargin` values inferred from pipeline structure) · Valheim: Jotunn zone docs, valheim.fandom Zones,
valheim-save-tools, LessZdoZoneCorruption, Edgegap backend deep-dive · RimWorld 1.6 decompile
(`C:\Files\Phaser\References\rimworld\rimworld-decomp`): `Verse/TickList.cs`, `Verse/GenTicks.cs:122`,
`Verse/Pawn.cs:1154,1743`, `RimWorld/Planet/WorldPawns.cs`, `WorldPawnGC.cs:174`, `WorldObject.cs:231,361`,
`PawnComponentsUtility.cs:224`, `GetOrGenerateMapUtility.cs` (patterns only — Ludeon copyright, never copied)
· M&B Warband module system `module_scripts.py` 1.134 · Bannerlord `DefaultCombatSimulationModel` API docs ·
Bridson, Hourihan & Nordenstam, *Curl-Noise for Procedural Fluid Flow*, SIGGRAPH 2007 · Eiserloh,
*Math for Game Programmers: Noise-Based RNG*, GDC 2017 · OpenSimplex2 (KdotJPG, CC0) · FastNoiseLite
benchmarks · iquilezles.org/articles/fbm · ECMA-262 (`Math.sqrt` exact; `Math.sin/cos/pow/exp` implementation-
approximated). **Formal (§2.13, /deep-research adversarially verified):** Vangheluwe, *Discrete Event
Modelling and Simulation* (McGill CS522) — Event Scheduling world view, the strict-ordering determinism
requirement, Activity-Scanning inefficiency · Zeigler DEVS notes (McGill) — `select` tie-break, external-
transition retraction, the internal/external collision defect · Univ. Bonn "simultaneous events" project —
tie-break reproducibility · Sunshine-Hill & Badler, *Perceptually Realistic Behavior through Alibi
Generation*, AIIDE 2010 (+ UPenn dissertation) — the hydrate-on-observation consistency bar · Kofman, *QSS*
(quantized state, hysteresis-as-Zeno-guard) · WebAssembly `nondeterminism` spec (FP arithmetic bit-exact;
NaN payloads not) · Mojang DataFixerUpper · Rune "Making JS deterministic" + Gaffer-on-Games — the JS
transcendental hazard. **Hardening pass (§3.6/§3.7/§10/§11.5, /deep-research verified 24/25):** Factorio Lua
API *Migrations* + *data-lifecycle* docs (per-save applied-set, `on_configuration_changed`) · Mojang
DataFixerUpper README + kvverti's Documented-DFU (Schema/DataFix/DataFixerBuilder) · jellysquid3 Cadmium
README (the ">85% load-time" figure — one profiling number, caveated) · GearBlocks devblog *Saved Game
Serialization* (the shared-serializer horror story — medium confidence, single first-party blog) · Factorio
FFF-47/76 + wiki Desynchronization (full-map CRC/tick, tagged dumps, replay bisect, Heavy Mode) · Burgess,
*Motivating Players in Open World Games*, GDC 2011 (POI-density-first sizing, the valley of boredom).
**Refuted 0-3, excluded:** the "Fallout 3 felt pushed-together from reusing Oblivion's density" claim.
**Gap (no evidence surfaced):** chunk-boundary entity ownership (§3.7) and empirical crossing-time numbers
(§10) — both recorded as gaps, not papered over.

**A.2 Statements & interviews.** Gus Smedstad on HOMM3 Quick Combat (comp.sys.ibm.pc.games.strategic) ·
James Martin (CA) on auto-test calibration (GamingBolt) · Chris Hunt (Kenshi) AMA · Bossa Studios shutdown
notice + FAQ (Wayback), Sylvain Cornillon (CTO) on the 40% rewrite, Daniel Clough (GamesIndustry.biz via
MassivelyOP), Henrique Olifiers (Forbes), Luke Williams & Mark Dugdale (coherence dev interview, Mar 2025) ·
CCP on Time Dilation · Egosoft forum (CBJ) on OOZ combat.

> **A.2 exclusion note.** The widely-repeated *"SpatialOS cost Bossa $30k/month"* and *"a shard needs 400+
> cores"* trace to **forum posts, not to any Bossa or Improbable statement**, and are deliberately **excluded**
> — a design doc is better short a datum than carrying a laundered one. The only citable cost figure is
> Improbable's own *"8–35% more per hour"* (via Bloomberg, Mar 2020, retrieved through Wayback). The
> "SpatialOS was too expensive killed these games" narrative is **thinly sourced and partly muzzled**: no
> studio blamed SpatialOS on the record, and Bloomberg documents a **non-disparagement clause** in
> Improbable's studio deals — so absence-of-blame is not evidence-of-innocence, it's a contract term. Dean
> Hall (ION) and Bossa (Worlds Adrift) both *praised* the tech publicly; treat that praise with the same
> caution. Likewise "SEED left SpatialOS" is a **strong inference** from its 2025 Google-Cloud-native
> messaging, not a confirmed fact, and is stated as such in §2.11.

**A.3 Confidence.** Load-bearing claims verified against primary sources or the local decompile. Weaker:
modern Minecraft per-status `taskMargin` (structure verified at 1.13.2 only); Valheim's exact per-ZDO entry
cap (documented as existing, value unpublished); Bannerlord's exact formula (modder decompile, signatures
match official API docs); AC Black Flag's wind model (press/player reverse-engineering only — **no primary
technical source exists**). Sea of Thieves' ships-per-server and always-real simulation are corroborated by
Rare's own performance changes.
