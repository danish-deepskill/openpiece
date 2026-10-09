# Openpiece — Roadmap (phasing)

We ship in stages, each with a clear question and a clear "done". The discipline: **never build the next
phase's breadth before the current phase's question is answered** (e.g. don't author 30 Devil Fruits in PoC
— one proves the system).

## Method: tracer-bullet, not throwaway
The architecture *is* the risky bet, so the PoC is built as the **thinnest real version of the final system**
(a "walking skeleton") and **kept** — it grows into prototype → MVP → production. Each phase adds **content +
small systems**, never a rewrite.

## Phases

### 0 · PoC — de-risk the bet  *(▶ current, ~90%)*
**Question:** can a clean, data-driven architecture absorb layered combat (and later ships/zones/economy)
without rewrites, and does the core action loop run?
**Done when:**
- [x] ECS-lite + data-driven factions + control-as-a-component (the Moat)
- [x] GAS-lite combat: Attributes · Modifiers · Tags · Abilities · Effects
- [x] Four layers (weapon/fruit/style/potential) compose through pure data (live + unit-tested)
- [x] Runnable action loop: move/aim/attack/dodge/enemy AI/death/respawn/HUD
- [ ] **Capstone — one cross-cutting *design* validation: Haki Armament counters a Logia's intangibility,
      emerging from tags (not bespoke code).** Closes PoC.
**Output:** the foundation we keep.

### 1 · Prototype — find the fun  *(vertical slice)*
**Question:** is the core loop actually fun and representative on one small island?
**Scope:** real combat feel (mode switching, Haki counter, a *few* fruits/weapons/styles); crew
recruit+command; 1–2 enemy types + a boss; 1 land event; sail between 2 islands; 1 ocean zone. Placeholder art.
**Done when:** a playtester has fun for ~15–30 min and "gets" the moat. Design validated, not content-complete.

### 2 · MVP — smallest shippable slice of the real game
**Question:** can a player play a coherent, end-to-end experience for hours?
**Scope:** C1 / East Blue only. Progression (stats/haki/talents + 1–2 skills like fishing/mining +
crafting/upgrade); 3–5 factions with events + reputation; a handful of islands + sailing + 1–2 sea events;
2–3 bosses; save/persistence; the Sloop with basic customization; power tiers wired.
**Done when:** alpha/demo-able; the core promise is fully deliverable in one region.

### 3 · Production — full game
C1–C4 breadth; all systems (underwater, all ship classes, full economy/dexes, races, mounts, advanced Haki,
many fruits, mesh-form bosses); polish, balance, performance, art pass; multiplayer if pursued.

## Status
End of **PoC**. Combat feel pass + character UI + the Haki↔Logia capstone are the last PoC items; then we
enter **Prototype** (find the fun).
Design pass #21 landed (`ITEMS.md` — the item substrate: stacks/instances/holds/ownership). Its slice 1
(stacks + the `Items` service + materials) and slice 3 (bag/chest/ship hold unified on one `Hold`, the
transfer/drop/split/equip verbs, the DOM inventory panel speaking INTENTS into InputSystem) LANDED 2026-09-17;
slice 2 (instances) + 4 (ownership) wait on their triggers; loot-a-body waits on corpses persisting as entities.
**The first duel pair LANDED 2026-10-09:** the Samurai (C, pirates — neutral to you) vs the Marine Officer on the
home island, the first fight the world stages on its own. Built as data on six GENERIC combat seams the Haki layer
will reuse (ledger in `COMBAT.md` → Built): the C-slot buff, attack speed scaling swings, channels, mid-swing
volleys, per-volume damage, projectile deflect + the block glance. Flagged for later: flat defense vs multi-hit
moves, a parried ball's return. (The sword rows' `range: 0` is gone: a melee reach now comes from the EQUIPPED
weapon's drawn length — `combat/swing.abilityReach` — the same read the hitbox makes, never from the row.)
**The dominance ladder + the Haki layer LANDED 2026-10-09** (`COMBAT.md` § Power tier + Built): tier gaps are walls
(flinch / guard / interrupt / parry / rebound by band gap — never damage), Armament is the fourth equip layer and the
first haki row (+1 letter while coated, turns half the balls, unlocks Kokutō; haki is A-+ by rule). The Ronin (A-) holds the far-south desert
ARENA (a walled sand ring, one gap, a dock) — the first unit built on both, his edge QUALITY not stats: his own
chains (dash-cut → return → gale; dash-thrust → whirlwind), Sandan — three re-aimed pass-through steps on Q, Flow + Iron Will, a
brain that reads weight and ripostes; Kokutō RAGDOLLS (the knockdown class: flight → sprawl → get-up, pushable while down).
Three training dummies share the ring; a WAYSTONE pair links the home spawn to the arena (E beside either). The arena
is a SQUARE colosseum on a square isle; its DUEL GONG (`structure.duelGong`, `verb.summon`) summons ZORO (ADVANCED, A —
`challengers`, at war with the ronin alone, mutually) and the Ronin face to face, so the duel starts when you are there to watch
it and can be rung again once it's over. Zoro fights nitōryū on the first PAIR weapon (`grip.hold 'each'` — a blade in
each hand, cuts alternating hands). The PoC
capstone's Armament half is live; the Logia half waits on a Logia unit.

## Foundation-audit ledger (repo-wide, 2026-07 — baseline d7d5afb)

The first full architecture audit (OOP-creep, boundaries, hot loops, determinism, scaling pillars) returned
**zero critical findings** — canon is test-enforced, determinism is proven, no OOP rot. What it flagged, and
the state of each:

**Fixed same-day:** dead events deleted (`enemyKilled`/`playerDied` had zero listeners); dense deck-cell
index (`DeckGrid.byCell` — tileAt/deckCellAtLocal are O(1) now); every "who's near X" enumeration routed
through the SpatialQuery chokepoint (melee, AoE, pistol cone, close-pass, doors, hull boarding — the future
uniform-grid swap is now a one-class change; systems take a defaulted `query` so tests stand, the scene
passes its SHARED instance).

**Open, with triggers:**
- **Chase-state extraction** (brains.ts ~500-line god-state → named pure sub-behaviors): its own focused
  session; prework for the jobs/behavior-tree brain (pillar 6).
- **ShipSystem three-hats split** (physics / deck parenting / helm-station verbs): trigger = the CANNON
  station. Until then the rule is "no new station methods on ShipSystem". Never split the physics integrator.
- **Versioned full save** (masterSeed + Rng stream states + wind.time + director atop the entity snapshot):
  the audit's #1 strategic move — land BEFORE persistent world state exists to lose (pillar 2).
- **External-data widening** (units/aiProfiles/layers/abilities → JSON rows): pillar 1's next tranche; a
  content-velocity multiplier that gets pricier the longer TS literals grow.
- Minors, opportunistic: input policy behind named fns (PlayerIntent prep); town spawns → LevelLayout
  `units`; `''` loadout sentinels → optional fields; fx payloads carry entity/faction ids not `control`
  reads (multiplayer prep).
