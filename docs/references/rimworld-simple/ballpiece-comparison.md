# Ballpiece vs RimWorld — the head-to-head verdict (2026-07-02)

> The atlas says how RimWorld works; `adoption-tiers.md` tiers its patterns; **this doc records the direct
> comparison**: which codebase is closer to best practice, and which more effectively supports complex
> interlocking systems at scale. Method: 8 independent dimension judges working from extracted fact sheets
> plus the live code of both subjects, then 3 adversarial critics (paper-architecture bias, modernity bias,
> proven-scale bias) attacking the panel's claims — 6 survived, 8 weakened, 3 overturned. The scoreboard
> below is the post-critique state. Subjects as of this date: RimWorld 1.6 (9,217 classes, 5 DLCs, shipped
> 13 years); ballpiece ≈6,000 LOC vertical slice.

## Headline

**Best practice and complex-system support are different questions with different winners.** On
design-as-it-exists, ballpiece is cleaner where its endgame demands it (typed contracts, DI, machine-enforced
sim boundary, one composition idiom) — RimWorld's service locator, string signals, and reflection would be
outright errors for a deterministic MP sim. On *effectiveness for complex systems*, RimWorld wins clearly:
not because it is older or bigger, but because it **closes every loop** ballpiece leaves open. Every RimWorld
system ships with its boot validation, save story, cache-invalidation events, tick cadence, and an escape
hatch for novel behavior. Ballpiece has the better skeleton and almost none of that connective tissue yet.

## Scoreboard (post-critique)

| Dimension | Best practice | Scalability / complex systems |
|---|---|---|
| Data-driven content | RimWorld (narrowed: much of its "closed loop" is XML scar tissue) | **RimWorld, clearly** |
| Entity/composition model | **Ballpiece** (narrowed: purity claims partly aspirational) | RimWorld (critics overturned the panel's "split") |
| Stats/modifiers/effects | Split — ballpiece's StatBlock, RimWorld's effect engine | **RimWorld, decisively** (effects) |
| Tick & performance | Split-leaning-ballpiece (the clock itself is cleaner) | **RimWorld, not close** |
| AI | RimWorld | **RimWorld, not close** |
| Persistence | RimWorld (trivially — ballpiece has 0 lines) | RimWorld |
| Determinism & testability | **Ballpiece** | Split (testability ours on evidence; determinism fenced, never proven) |
| Extensibility | Split (our one loaded seam is already accreting) | RimWorld |

## The three findings that matter most

1. **RimWorld's superpower is completeness of contract, not any single pattern.** Each subsystem answers
   five questions at birth: boot validation, save participation, cache invalidation, tick cadence, and where
   novel behavior goes when data isn't enough (the def-field → comp → worker → subclass escape-hatch
   ladder). Ballpiece's canon answers the *shape* questions and skips the lifecycle ones: 1 of 10 registries
   validated, 0% save, no invalidation channel, no cadence, no escape hatch on `AbilityDef`. That contract
   gap — not ECS-vs-comps — is the real distance between the codebases.
2. **Ballpiece's cleanliness is largely unloaded.** The one seam with real content pressure (Abilities,
   14 rows) already shows RimWorld's named anti-pattern: `AbilityShape` accreted ~15 optional fields (several
   used by one row) and `AbilitySystem.update()` carries an engine branch for the Gomu Rocket family-of-one.
   Where extensibility has been tested it chose field-accretion; where it looks elegant it is untested. And
   several "eliminated RimWorld bug classes" are eliminated only by not yet having the open surface (external
   data, mod hooks) that causes them — external JSON loading re-inherits them with ~10% of the mitigation
   written.
3. **Most D-tier refusals are right; two panel condemnations were wrong** (both corrected in
   `adoption-tiers.md` #31/#44): tick-quantized stat staleness is deterministic and lockstep-safe, and
   symmetric one-declaration serialization is separable from the static `Scribe.mode` machine and worth
   keeping — hand-written toJSON/fromJSON pairs reintroduce the drift bug it exists to kill.

## Confirmed defects in ballpiece (verified in code during this review)

1. **Effect reapply collision (real bug)** — `EffectSystem.apply` builds the identical source string
   (`effect:id:by`) for reapplications, so the first instance's expiry `removeBySource` strips a still-active
   second instance's modifiers; tags are refcounted, modifiers are not (`EffectSystem.ts:12,34`). Fix =
   per-def stack rule (`refresh | stack | sum`) + instance-unique or refcounted sources (S#3's merge rules).
2. **Silently dead modifier class** — `health.maxHp` / `combatant.maxStam` snapshot the StatBlock at spawn
   (`Spawner.ts:70-73`) and are never re-read: any later `+maxHp` buff/potential does nothing. Fix = a
   StatBlock change-notification channel (the `Notify_GenesChanged` lesson).
3. **Ids-at-rest violations rotting save-readiness** — live `Entity` refs held across ticks
   (`Blackboard.quarry/focus`, `Riding.ship`), a `Brain` class instance and live `AIProfileDef` on
   components, `Set`/`Map` in `Loadout` — the canon is unenforced by any test.
4. **The O(N²) loop bypasses its own escape hatch** — `separation()` (`brains.ts:31`) iterates
   `world.with()` directly instead of `SpatialQuery`, so the planned uniform-grid swap would miss the
   hottest quadratic loop. Also: `world.with()` allocates a fresh array per query (~21 call sites/tick).
5. **Enforcement holes in `architecture.test.ts`** — `Math.random` is not banned in sim dirs (and
   `core/math.ts:22` exports a `Math.random`-based `rand()` from a SIM dir); the wall-clock ban skips
   `systems/`; the import check misses `phaser/` subpaths, `require()`, dynamic `import()`. No positive
   same-seed replay test exists anywhere — determinism is fenced, never proven. `stepSim()` still calls the
   Phaser-coupled `InputSystem`, so the "future headless server loop" has never run headless.
6. **Fail-loud canon violated at boot** — a typo'd ContentId boots clean and throws at spawn time
   (`Spawner.ts:55-60`); no boot-time cross-ref sweep exists and only Abilities has a validator.

## What to steal, in leverage order

1. **Boot-time cross-ref sweep + validators for all 10 registries** — cheap now, mandatory before external
   JSON; turns the sweep *tests* into a runtime guarantee (upgrades S#1).
2. **Effect engine to the hediff shape** — per-def stack rules (fixes defect #1), severity + threshold
   stages, per-tick hook (already S#3; the review confirms its urgency with a live bug).
3. **StatBlock invalidation channel** — fixes defect #2; adopt "every modifier source ships its
   invalidation event" as house discipline the day anything else caches.
4. **Ids-at-rest, enforced, + a minimal save stub now** — pillar 2's own trigger ("before the world holds
   state") has already fired; every tick the live refs survive makes the retrofit more of the rewrite the
   docs warn about (A#17).
5. **Decide/execute Intent split for AI** — the single highest-leverage adoption; simultaneously the
   PlayerIntent multiplayer keystone (S#2). Route possessed-player input through the same intent type.
6. **Re-route `separation()` through `SpatialQuery`** — minutes of work; restores the single-chokepoint
   contract the deferred grid swap depends on.
7. **Positive determinism regression test** — headless `stepSim` N ticks from a fixed seed, twice, assert
   identical state hashes; forces the InputSystem extraction and closes enforcement holes (defect #5).
8. **`AbilityDef` escape hatch** — a typed behavior/worker list so one-row logic (Gomu Rocket's deferred
   launch) becomes a strategy row, not optional fields + engine branches on the shared interface.
9. **Hash-interval staggering** (~20 lines, A#12) — adopt *before* combat/AI feel-tuning locks in cadence,
   since re-think cadence changes feel.
10. **Order-independent scoped seeding** (A#15) — per-step/per-entity Rngs via `hash(stream, entityId,
    tick)`; today's linear streams silently reshuffle every subsequent roll on any iteration reorder.

## Standing lessons (add to the meta-principles)

- **A seam only counts when its hot callers actually go through it.** "Defer until pain, swap later" is
  sound *only* while the chokepoint contract holds — `separation()` proves it can silently break.
- **An import ban is not a data-purity guarantee.** Machine-enforce the invariant you actually need
  (serializable, function-free, ids-at-rest components), not a proxy for it.
- **Unloaded elegance is unproven elegance.** Judge a seam by its most-loaded instance, not its cleanest.
- **Proven-vs-designed cuts both ways.** RimWorld earns no credit for machinery that compensates
  self-inflicted problems (3-pass loads for pointer-graph saves, side registries for a missing query
  engine); ballpiece earns none for properties that exist only as plans or comments.
