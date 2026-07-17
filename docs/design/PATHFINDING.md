# Pathfinding & Movement Planning — the overhaul architecture

> **Stage:** building — layer 2 slice 1 shipped; layer 0 has a recorded trigger

**Status: DESIGNED (2026-07). Layer 2 slice 1 (gangplank portal) SHIPPED 2026-07 — `frameLeg` in
`ai/brains.ts` redirects a cross-frame steering goal leg-by-leg through the door (live anchors off the
ship's pose; transitions stay physics), behind the one `routeTo` chokepoint. Other layers fire on their
recorded triggers.** Companion: `features/movement-frames.md` (frames, the transition rulebook),
`ai/AI_INTELLIGENCE.md` (the INT ladder this plugs into), the RimWorld atlas (`references/rimworld-simple/` —
adoption-tiers #32 tiered regions C/"defer until pain"; the pains are now enumerated here as triggers).

## The honest audit (what's actually wrong vs. what only looks old)

**KEEP — these seams are the valuable part, and they make the overhaul cheap:**
- **One steering chokepoint** (`brains.ts steerToward`): every brain routes through it. Any planner swap is
  invisible to all AI content. This is the single most load-bearing decision in the current code.
- **One rulebook**: the planner reads the SAME composed walkability (terrain + structures) the collider
  enforces — no navmesh drift, doors plan-through by data. Keep forever.
- **Throttled repath + straight-line shortcut** (`bb.repathT` 0.5s, `clearLine` first): the right execution
  shape for moving targets; also what makes moving portal anchors free.
- **Determinism**: planning is a pure function of grid state. Every layer below must stay that way.

**REPLACE — prototype-grade internals behind the good seams:**
1. **O(n) open-set A***: linear scan per pop + per-call Map/Set allocation (violates our own hot-loop canon).
   Collapses at chunked-sea scale / many agents.
2. **No hierarchy**: unreachable goals burn the FULL node budget before returning null (locked compound,
   other island = the common case, not the edge case); no cheap "can I even get there?" oracle — which
   jobs, target selection, and order-giving all need constantly.
3. **Single-frame**: the planner doesn't know ships/decks exist (root cause of "crew stop at the gangplank").
4. **Binary costs**: `pathable` is yes/no. The planner ignores terrain speed (units happily route through
   slow sand) and has no vocabulary for danger, cover, or preference at all.
5. **Per-agent everything**: 8 chasers on one target = 8 identical A*s; flee is straight-line panic.
6. **Sampled raycasts**: `clearLine`/`lineOfSight` step at half-tile intervals — gaps between samples can
   miss corner clips. Should be an exact grid DDA.

## The architecture — six layers, one vocabulary

The spine: **three granularities of the same world** — cells (units execute), regions + portals (squads and
jobs plan), frames (fleets and divisions order). Coarser layers are views, never separate truths.

### Layer 0 — the solver core (engine rewrite, API-preserving)
- A* over reusable typed-array scratch (g-costs, cameFrom, binary heap), sized per frame-grid, ZERO
  allocation per query. Deterministic tie-breaking (stable ordering) — lockstep/replay safe.
- **Cost-aware**: g accumulates a per-cell cost from a composable `CostProvider` (base = 1/speedMul, plus
  dynamic layers — see Layer 3). Binary blocked stays binary; everything else is a preference.
- **MoveCtx-aware**: the planner takes the collider's `{mode, airborne, onLedge}` — air legs plan with
  `airborne` against the same oracle (blocksAir only). One rulebook, now formally shared.
- Exact swept-circle DDA replaces sampled clearLine/lineOfSight.

### Layer 1 — regions & reachability (RimWorld #32, promoted from C-tier by these triggers)
- Each frame's grid partitions into REGIONS (flood-filled walkable areas; doors are their own 1-cell
  regions). Rebuild is incremental: `StructureIndex.version` is already the dirty signal.
- **Reachability oracle** = BFS over the region graph (microseconds): kills the full-flood-for-null problem
  (A* only runs after reachability says yes), and gives "nearest reachable X" for free — the JOB SYSTEM's
  bread-and-butter query (RimWorld's closest-reachable-thing). Worldgen's test flood-fill becomes runtime
  capability.

### Layer 2 — frames & portals (cross-frame planning; design detail in movement-frames.md)
- Portal edges = typed VERBS (small closed engine set): `door` (gangplank/hatch), `drop` (rail/ledge),
  `leap` (gap ≤ jump range), `flight` (Geppo). Instances are LIVE QUERIES from current poses — never baked
  (ships move); anchors re-resolve on the existing repath tick.
- Edges are **capability + resource gated**: leap needs jump; flight needs Geppo AND a stamina budget with
  margin. Gates and weights live on `AIProfileDef` — cowardice, recklessness, and "doesn't know Geppo
  interception exists" are DATA, not brains.
- A cross-frame plan is a **goal stack of intentions** (reach anchor → traverse → local goal), one leg
  materialized at a time, each leg planned in ITS OWN frame's grid (grids are only axis-aligned in their own
  frame — a 45°-rotated ship costs one worldToDeck at the door, nothing anywhere else). The planner only
  DELIVERS bodies to physical doors; transitions stay physics (the movement-frames rulebook is untouched).
- **Air is NOT a frame** — it's MoveCtx. Airborne bodies stay in their frame; open-air legs are steering
  (nothing to search over empty sky), grid A* with `airborne` only where blocksAir makes real air mazes.

### Layer 3 — shared fields (squad efficiency + tactical surface)
- **Dijkstra maps / flow fields** for HOT targets (≥K seekers): one field serves every chaser; the inverted,
  overweighted field gives FLEE that rounds corners instead of wall-hugging. Throttled + incremental;
  deterministic (rebuilt from sim state, never wall-clock).
- The same machinery is the TACTICAL layer: danger maps (recent AoEs, fire lanes, cannon arcs) and influence
  maps (ally/enemy presence) are just cost layers composed into Layer 0's CostProvider with per-profile
  weights. "Prefers cover", "avoids the burning deck", "shrugs through danger" = one weight row each.

### Layer 4 — group movement (squads → divisions → fleets)
- **Squad**: ONE shared path (leader or virtual leader), members follow FORMATION SLOTS projected on the
  path tangent; body collision handles jostle. The existing focus-fire + attack-token + approach-lane
  machinery (SquadSystem `bb.lane`) stays — this replaces only the N-redundant-A*s underneath it. Approach
  slots on the target ring hand out surround positions from the shared field (natural encirclement, no
  conga line).
- **Division** (multiple squads): plans ONLY at region/portal granularity — an order is "move via region
  path P; squads take lanes A/B, staggered". Cell-level work stays per-squad, so the strategic layer scales
  by graph size, not map size. This IS the strategic-command language: orders reference rooms and doors.
- **Fleet/naval**: the same order shape one level up — frame-graph orders ("close to boarding range; leap +
  gangplank portals open; squads assigned decks"). Boarding actions inherit Layer 2 verbatim.

### Layer 5 — what rides on top (jobs, exploration, knowledge)
- **Jobs**: nearest-reachable-thing (Layer 1 BFS) + target reservation + region-distance as the job-scoring
  distance estimate (never full A* for scoring).
- **Exploration**: frontier-descent on an "unknown" Dijkstra map per squad (autoexplore).
- **Knowledge economy** (AI_INTELLIGENCE): what a unit KNOWS of the graph is per-unit data — a brute knows
  only regions it has seen; a navigator knows charts; an INT ladder rung = which edges/regions exist FOR YOU.

## Traps (rejected on the record)
- A z-axis / 3D navmesh (elevation stays discrete states); air tiles/sky grids (air is ctx).
- Baked edges to moving frames (doors on ships are live anchors).
- One monolithic planner (three thin granularities beat one giant search).
- Global positional authority (see movement-frames.md — authority local, views global).
- Building Layer 3/4 before a scale pain exists — each layer has a trigger; respect them.

## The execution contract (designed now — slice 1 already needs it)

Planning is half the system; the other half is what a unit DOES when the world disagrees with its plan.

- **Failure is a RESULT, not a retry loop.** The ladder: (1) a progress watchdog per leg — best-distance-to-
  waypoint not improving for ~1.5s → forced repath (ignores the throttle); (2) K consecutive stucks or a
  failed repath → the GOAL fails: clear the path and report up to the requester — a chase brain re-decides
  (lose target / reposition), a job abandons + releases its reservation + cooldowns the target, a squad
  order reports failure to the squad. Silent infinite retry is the banned shape (a unit jogging into a wall
  forever is the pathfinding version of a swallowed exception).
- **Portal invalidation** is the same ladder one level up: the edge vanished mid-plan (ship sailed off, plank
  retracted) → the leg fails → pop the goal stack and re-run the frame-graph choice. No special cases.
- **Doorway traffic** (two bodies, one-wide door): the watchdog is the backstop (one of them stalls →
  repaths → yields). Add doorway shove-damping ONLY if playtest shows real deadlocks — don't pre-build
  traffic rules the watchdog already covers.

## Water is a PER-UNIT policy, not a terrain verdict (kills `aiFootAvoid`)

Today `aiFootAvoid` on the deep-water terrain row bans ALL foot planning from water — a placeholder that
can't express the roster: a crocodile AMBUSHES from water, a fishman route-plans straight through the bay,
a Devil Fruit user must never plan a swim (canon: hammers sink — later a mover rule too, not just planning).
Overhaul: the terrain def keeps the FACT (`water: 'deep'`); the unit's profile carries the POLICY — a
`waterCost` on AIProfileDef (`Infinity` default landlubber · high = reluctant last-resort swims · cheap =
aquatic), composed in Layer 0's cost provider like any other layer. The gangplank-foot-over-water wrinkle
resolves itself: finite-cost units plan the last wet steps; landlubbers need the plank over land/shallows.
Content-is-data: a new aquatic creature is a number, not an engine branch. `aiFootAvoid` dies with this.

## Plans are DERIVED state (persistence rule)

Paths, goal stacks, fields, and regions are never serialized. Blackboards persist only GOALS (target ids +
intent); everything below rebuilds from world state on load. This keeps saves small, replays exact, and the
whole planning stack free to change shape between versions without save migration.

## Gated design items (recorded, deliberately NOT designed yet)
- **FormationDef** (formation shapes as data rows) — design when Layer 4 builds; until then squads are
  slot-offsets on a shared path.
- **Time-sliced planning budget** (a per-tick path-request queue) — only if a profile shows planning spikes;
  must stay deterministic (queue order = stable entity order).
- **Knowledge-graph data shape** (which regions/edges a unit KNOWS — the INT ladder's memory) — design in
  `ai/AI_INTELLIGENCE.md` when the knowledge economy lands; Layer 5 only reserves the seam.
- **The job system itself** (job defs, priorities, interruption) and **the strategic ORDER language**
  (division/fleet commands as data) — each gets its own design doc when its milestone arrives; this doc
  only fixes the queries they'll stand on (nearest-reachable, region orders).

## Build order + triggers
1. **SHIPPED (2026-07) — Layer 2 slice 1**: frame-aware steering (`frameLeg` behind `routeTo`) + the
   gangplank `door` edge. Crew heel through the plank; enemies chase aboard. A far-side/diagonal approach
   walks a TANGENT around the hull (frameLeg's stopgap — the world planner still can't SEE hulls; the real
   fix is Layer 0's cost providers). Deck legs steer DIRECT (no per-frame grids yet — decks are small open
   rooms; the goal-stack generalizes when holds/interiors land). **Layer 0's trigger is now PROVEN pain:**
   a far-side approach to a ROTATED hull rounds it but cannot reliably thread the final lane past the solid
   door jambs on local steering alone (frame-route.test records the relaxed contract) — planner-visible
   hulls own that last yard.
2. **Layer 0** solver rewrite: before chunked sea, or the first profile showing pathfinding hot. Zero-risk
   (API preserved behind steerToward/findPath).
3. **Layer 1** regions: trigger = job system starts, OR locked doors/compounds, OR unreachable-target
   floods show in a profile. (This promotes RimWorld atlas #32 out of C-tier — pain proven.)
4. **Layer 2 slices 2–3**: `leap`/`drop` edges at naval boarding; `flight` at Geppo-AI work (the stamina
   budget doubles as the smart-vs-splash difficulty dial).
5. **Layer 3** fields: trigger = >~10 seekers per target, or the first tactical-AI feature (cover/danger).
6. **Layer 4**: trigger = division-scale raids / fleet battles. **Layer 5**: with the job system.
