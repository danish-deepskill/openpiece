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
