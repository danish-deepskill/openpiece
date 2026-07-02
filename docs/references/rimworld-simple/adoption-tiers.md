# RimWorld Patterns — Tier-Listed by Adoption Worth for Ballpiece

> The atlas (chapters 00–19) says **how RimWorld works**; `others.md` gives deep adopt/skip analysis for six
> core subsystems; **this doc is the verdict layer**: every pattern/system in the atlas, tiered by
> worth/fit for ballpiece's architecture and endgame (living Kenshi-tier sea · F-tier→Yonko · strategic
> command + possess-any-unit · server-authoritative multiplayer). Companion to `docs/design/REFERENCES.md`
> (which tiers *game ideas*; this tiers *architecture patterns*). Ordered most→least worth within each tier.
>
> **Tiers:** S = adopt now / already canon · A = adopt at a named milestone · B = adapt (right idea, needs
> reshaping) · C = defer until scale or pain proves the need · **D = do not adopt (misfit — with reasons)**.
> **Status:** ✅ done · 🌱 seeded in code · 🔨 to build · 🧊 far-future.
> **Trigger** = the roadmap moment to build it (Phases: 0 PoC ▶ current · 1 Prototype · 2 MVP · 3 Production).

---

## S — adopt now / already canon

1. **Def/instance + fail-loud registries** *(ch 01)* — ✅ canon (`core/Registry.ts`); RimWorld is the 10k-def
   existence proof. Two cheap upgrades are due **now** because external-data loading is the declared next
   milestone: a boot-time cross-registry `resolveAll()` (every id in every def resolves — turns the sweep
   *tests* into a runtime guarantee) and a `defs/wellKnown.ts` DefOf-style ids module. 🌱→🔨
2. **Decide/execute intent split (Job pattern)** *(ch 08)* — the FSM's real successor: brains emit an intent
   (`{kind:'attack', target}`), a driver executes it in resumable steps. One pattern buys four things: simpler
   brains, the BT migration path, save-safe actions, and **serializable intents = the PlayerIntent/
   ControlSystem multiplayer keystone** (CLAUDE.md names it). Trigger: next AI or netcode work. 🔨
3. **Effect engine: severity + stages + comps-as-union + merge-rules-as-data** *(ch 05)* — the debuff layer
   (chilled/burning/anti-heal, REFERENCES #20) and Haki-drain tiers all fall out of one number driving
   stage blocks. `EffectSystem` is seeded; stages/merge rules are the missing half. 🌱→🔨
4. **Verb unification** *(ch 06/07)* — fist, cutlass, pistol, fruit power = one attack-action shape
   (windup/active/recovery + targeting + cost). `swing.ts` already is this for melee; **extend it for ranged,
   never add a parallel path**. The four-layer moat depends on this staying unified. 🌱
5. **Player intent as world data (Designations)** *(ch 18 §1)* — player paint-orders become world markers;
   unit AI consumes them independently. This is *the* architecture for the multi-scale command loop
   (REFERENCES S#1): orders outlive possession switches, work identically for AI captains, and serialize
   trivially for MP. Adopt the shape the moment squad orders exist. 🔨
6. **Stat explanation mirror** *(ch 04)* — `explain(stat)` returning (source, op, value, running total).
   Cheap now, priceless when four layers stack; feeds the debug overlay. 🔨
7. **Single-oracle discipline** *(ch 11)* — one `HostileTo` function, no scattered team checks: ✅ canon
   (`combat/targeting.ts` + faction matrix). RimWorld's special-case ladder (mental states, predators,
   prisoners) is the preview of cases to *centralize there* as they arrive (berserk pirates, sea kings,
   captured crew). ✅
8. **Eligibility/execution split** *(ch 19 #17)* — `canFire`/`execute`, `hasJob`/`jobOn`, `testRun`/`run`:
   probe cheaply, commit separately, **log desyncs between the two** (RimWorld treats that as a named bug
   class — exactly what `silent-failure-hunter` hunts). Adopt as house discipline in every new system. 🔨
9. **Shared hook vocabulary** *(ch 17)* — DLC absorbs whole expansions because everything plugs in by
   emitting `statOffsets`/`abilities`/`hediffs`. Ballpiece's equivalent (grants = Abilities + Modifiers +
   Tags) is already canon — this is the proof it scales; **guard it** when adding Haki/styles/potentials. ✅

## A — adopt at a named milestone

10. **Event director blueprint** *(ch 13)* — EventDef registry + canFire/execute workers + one EventParms
    bag + per-def refire cooldowns + directors-as-defs. Take whole; it's the `GameDirector` destination
    (REFERENCES #12). Trigger: living-world events, Phase 1→2. 🌱
11. **Threat-points budget** *(ch 13)* — wealth+pop+time → one number sizing every event; `PowerTier` slots
    where colony wealth sits (bounty escalation, REFERENCES #13, is this formula). With #10. 🌱
12. **Ticker classes + hash-bucket staggering** *(ch 12)* — Rare/Long ticks bucketed by `id % interval`
    (~20 lines in `World`); REFERENCES #10 calls tiered ticks mandatory. Trigger: first perf pain from
    wildlife/towns/distant ships. 🔨
13. **Sim-LOD via per-kind tick rates** *(ch 03/12)* — RimWorld's `UpdateRateTicks=15` animals + world-pawns
    are the concrete seed for REFERENCES #11 (full detail near player, abstract far away); doubles as the MP
    sharding model. Trigger: off-screen battles / distant islands. 🔨
14. **Duty dispatch for squads** *(ch 08)* — squad layer writes a `duty` field; a top-priority brain check
    defers to it; no duty → personal AI. Never two brains fighting. Trigger: squad command (REFERENCES #9),
    `SquadSystem` is the seed. 🌱
15. **Scoped RNG + per-step pipeline seeds** *(ch 12/15)* — `rng.scoped(seed, fn)` brackets; worldgen steps
    seeded by `hash(parent, stepConstant)` so inserting a step doesn't shift sibling randomness. Determinism
    insurance for replays/MP. Trigger: worldgen expansion or event rolls. 🌱
16. **WorkGiver scan pattern** *(ch 10)* — cheap candidate index → early skip → nearest-first confirm →
    stop at first hit. THE architecture for OSRS activity skills (fishing spots, ore veins — REFERENCES #19)
    and crew autonomy. Trigger: first gathering skill. 🔨
17. **Persistence: serialize-by-id + ownership rule + multi-pass load** *(ch 16)* — defs by id (✅ canon),
    exactly-one-deep-owner rule (machine-checked at save), three-pass load (create → resolve refs → derive).
    Adapt to JSON/schema — see D#44 for what *not* to take. Trigger: save/load milestone, Phase 2. 🔨
18. **GenStep ordered pipeline** *(ch 15)* — def-declared, independently-seeded worldgen steps; biomes/zones
    inject/remove steps declaratively. `WorldGen.ts` is the seed. Trigger: multi-island generation. 🌱
19. **Capability-gating matrix** *(ch 03)* — which unit gets which components, decided in ONE explicit
    assembly function from def data (not scattered spawn code). `Spawner.ts` is the seed; formalize when
    unit variety grows (crew, mermen, giants). 🌱
20. **Goodwill dynamics** *(ch 11)* — numeric relation + single write path carrying *reasons* + hysteresis
    thresholds (hostile at −75, back at 0 — no boundary flapping) + drift toward natural. Makes the static
    matrix dynamic. Trigger: faction war (REFERENCES #16). 🔨
21. **Stat post-process curves + Stats registry** *(ch 04)* — stats as defs (default/clamp/round/curve);
    diminishing returns tuned in data. Trigger: with the next stat-heavy layer (Haki). 🔨

## B — adapt: right idea, reshape for ballpiece

22. **Needs/moods/thoughts** *(ch 09)* — the push-memories vs poll-situations split + diminishing stacking
    is the concrete mechanism behind REFERENCES #26 (crew depth). Adapt the *scale*: crew + notables only —
    Kenshi-tier, not DF-tier (REFERENCES meta: don't simulate everything). 🧊→🔨 at crew milestone.
23. **Event-bus veto/query channel** *(ch 17)* — HistoryEvents with reasons + `MemberWillingToDo` veto:
    beliefs *prevent* actions. Reshape onto the typed EventBus for crew loyalty/honor codes (a mutinous
    cook refusing to poison). Novel — nothing in ballpiece plans this yet. 🧊
24. **Quest generation/runtime split** *(ch 14)* — build-time node graph vs runtime listeners is the right
    shape for multi-step sea events; replace string signals with the typed EventBus (see D#42). Trigger:
    event chains beyond one-shot incidents, Phase 2+. 🧊
25. **BaseGen grammar + Sketch blueprints** *(ch 15)* — symbol expansion for town/structure layouts;
    blueprint-then-stamp for prefabs. Trigger: island towns with interiors. 🔨 later.
26. **RulePack text generation** *(ch 18 §4)* — grammar-driven names/battle-logs; a perfect News-Coo
    newspaper mechanism and the cheap half of generated history (REFERENCES #22). Low priority, high flavor. 🧊
27. **Price-as-stat + StockGenerators** *(ch 18 §2)* — market value riding the modifier pipeline means the
    living economy (REFERENCES #15) needs no second math system; procedural trader stock = def rows. 🧊
28. **Discard-and-retry generation** *(ch 03)* — roll whole NPCs against validators instead of constraining
    every step; the cheap way to get varied rivals (Nemesis synergy, REFERENCES S#5). 🧊
29. **Exception isolation per subsystem** *(ch 19 #25)* — RimWorld try/catches every tick sub-call. Adapt
    with care: fail-loud stays right for dev/boot (canon), isolation belongs only at the production-server
    tick boundary — and never silently in deterministic MP paths (a swallowed error there is a desync). 🧊
30. **Composed FX (Effecter)** *(ch 18 §6)* — one def = sparks + sound + glow sub-effects. Struct Flecks
    already validate `core/Pool` ✅; the composition idea fits `FxSystem` when effects get richer. 🧊

## C — defer until scale or pain proves it

31. **Stat caching with tolerated staleness** *(ch 04)* — profile first; adopt RimWorld's shape (value +
    computed-tick, caller declares staleness) only when stat queries show up in a profile. Correction from
    the 2026-07 comparison review (`ballpiece-comparison.md`): staleness is declared in *sim ticks*, so a
    cached read is a pure function of deterministic state — lockstep-safe, **not** a desync seed. Don't
    reject it on MP grounds when a profile says adopt. 🧊
32. **Region-based reachability/path hierarchy** *(ch 12/18 §8)* — hierarchy-first pathfinding; only when
    islands outgrow plain grid A* + `SpatialQuery`. 🧊
33. **StatParts plugin list** *(ch 04)* — ballpiece's "parts" are its four layers; revisit only if per-stat
    contributions multiply beyond them. 🧊
34. **Mental breaks** *(ch 09)* — stat-derived thresholds are elegant (personality via pipeline, no special
    cases); crew-morale flavor for the deep-sim era. 🧊
35. **DAG unlocks via data mutation** *(ch 18 §3)* — progression is OSRS skills, not a tech tree; the
    research *mechanism* (unlock = def-reference surgery) may fit shipwright blueprints someday. 🧊
36. **Attribute-scanned debug actions** *(ch 18 §7)* — the Debug flag panel already works; registration-free
    scanning is a nice-to-have for dev tooling only (never the sim — see D#45). 🧊
37. **Mod/patch machinery** *(ch 18 §5)* — XPath patches, DefModExtension. Only if third-party modding
    becomes a goal (Phase 3+); external-data loading gets ballpiece 80% there anyway. 🧊
38. **Body-part anatomy + immunity** *(ch 05/06)* — REFERENCES #33 already ruled: abstract instead, unless
    per-part injury is someday *chosen* as a deep axis. The adjacent insight worth keeping now: damage and
    health sharing one representation (injuries ARE effects). 🧊

## D — do not adopt (misfit — and why)

39. **`Find`/`Current` service locator** *(ch 00)* — hidden global state; breaks constructor-injection canon,
    headless tests, and a server hosting multiple sims. RimWorld affords it as a single-instance SP game;
    ballpiece.io cannot. The cautionary counter-example.
40. **Comp-bag on hot entities** *(ch 02)* — ballpiece's ECS queries already beat by-type comp lookups;
    RimWorld itself ditches comps for hard-typed trackers on pawn hot paths. Nothing to gain.
41. **Subclass-scan auto-registration for sim systems** *(ch 19 #22)* — explicit tick order in `WorldScene`
    is canon *because order matters*; auto-discovered systems would hide it.
42. **String signals** *(ch 14)* — typo = silent dead letter (the exact bug class `silent-failure-hunter`
    exists for). Keep the choreography idea (#24) on the **typed** EventBus.
43. **Reflection instantiation (`Activator` from Type fields)** *(ch 19)* — the TS translation is
    discriminated unions + handler maps / function-bearing def rows — already house style, fully typed.
44. **Symmetric `ExposeData` mode machine** *(ch 16)* — refuse the *global static mode flag* (one
    serialization context per process kills N-sims-per-server), but keep the **symmetry property**: one
    declaration drives both directions, so save and load structurally can't drift. In TS that means schema
    tables or a passed-in scribe context — **not** hand-written toJSON/fromJSON pairs, which reintroduce
    the exact two-directions-diverge-silently bug class Scribe was built to kill (corrected 2026-07,
    `ballpiece-comparison.md`). Keep #17's ownership rule + passes.
45. **XML list-append inheritance** *(ch 01)* — ballpiece deliberately chose arrays-REPLACE (simpler, already
    documented); don't import the append rule. Do steal base-defs-as-tuning-sheets (a usage habit, not a rule
    change).
46. **Short hashes** *(ch 01)* — JSON saves with namespaced string ids are fine at any plausible scale.
47. **Multi-map/multi-clock split** *(ch 00/12)* — RimWorld's world is discrete maps; ballpiece's soul is one
    seamless sea (zoned world is REFERENCES #39, fallback only). Sim-LOD (#13) is the substitute.
48. **Scenario/tutorial/localization machinery** *(ch 18/README gaps)* — different game shape; nothing to
    take beyond patterns already cataloged.

---

## Meta-principles (the lessons under the verdicts)

- **Aggregation points will know every layer — confine, don't eliminate.** Even RimWorld's clean seams end
  with `StatWorker` enumerating genes and precepts inline. `StatBlock` naming the four layers is fine —
  as long as it's the *only* place that does (ch 17).
- **Every new modifier source ships its invalidation event** (`Notify_GenesChanged` lesson) — the recurring
  bug class behind stale caches; applies the day ballpiece caches anything (ch 17, #31).
- **Strategies are stateless; per-entity memory lives on components** — RimWorld enforces this across
  hundreds of workers; matches brain-profile canon (`bb` scratch, shared profile rows) (ch 19 #2).
- **Probe/commit pairs must be kept in sync and desyncs logged** — adopt the discipline with #8 everywhere.
- **RimWorld is single-player.** Every D-tier verdict traces to the two endgame constraints RimWorld never
  had: server-authoritative multiplayer and a deterministic headless sim. When a new pattern tempts, ask:
  *does this survive a server running N sims?*
