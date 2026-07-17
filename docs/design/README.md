# Design Docs — index

> **Stage:** meta — index of the design docs

The **target vision** for Openpiece (a One Piece-inspired open-world action-RPG, Rell Seas-like). These run
ahead of the code on purpose. Implementation follows `docs/ARCHITECTURE_SCALE.md`, which maps every domain
below to a proven, scalable pattern so it lands as **content + small systems**, not rewrites.

Start at **VISION.md**.

- [VISION.md](VISION.md) — pillars, the four-layer combat identity, non-linear progression, scope tiers.
- [COMBAT.md](COMBAT.md) — Devil Fruits, Haki, Weapons, Fighting Styles, Combat Potentials, power tiers, modes.
- [MOVEMENT_AIR.md](MOVEMENT_AIR.md) — air movement & aerial combat: the two-layer (ground/air) model, jump → Geppo → aerials. **Design only, not built.**
- [PROGRESSION.md](PROGRESSION.md) — stat/haki/talent points, dexes, class system, ability sources, races, EXP.
- [WORLD.md](WORLD.md) — open world, ocean zones (C1–C4), hazards, climate, wildlife, underwater.
- [NAVAL.md](NAVAL.md) — ship classes, parts, stats, exploration/battle modes, cannons, naval combat, subs.
- [features/big-walkable-ship.md](features/big-walkable-ship.md) — ships as WALKABLE platforms (walk the deck, man the helm/cannons; the deck-local-space model). **Design only, not built.**
- [EVENTS.md](EVENTS.md) — sea & land events, factions, reputation, the event director, Adventure Dex.
- [ECONOMY_ACTIVITIES.md](ECONOMY_ACTIVITIES.md) — gathering, crafting, blacksmithing, market, talents, mounts.
- [ai/AI_INTELLIGENCE.md](ai/AI_INTELLIGENCE.md) — the INT axis (1–10): one AI stack where intelligence gates perception, knowledge, decision, execution, and command at unit/leader/faction scale; the information economy; counter-play via habit counters; ML offline-only.
- [ai/AI_FOUNDATION.md](ai/AI_FOUNDATION.md) — the decision ENGINE that executes the INT axis: the gather→gate→score→pick→commit→execute pipeline, one intent pipe shared with player input (the PlayerIntent keystone), executor recursion (maneuver pools), command scopes as entities, the nine decision DOMAINS + the domain arbiter, prior art, build phases + triggers.
- [ai/AI_GYM.md](ai/AI_GYM.md) — the offline tuning pipeline: maximize INT 10, CALIBRATE 1–9 against authored target profiles; scenarios + opponent league as def rows; the same-kit ladder gate; parallel headless runs, flagged-seed replays.
- [DEEP_SIMULATION.md](DEEP_SIMULATION.md) — the Moat, the "be-the-Yonko" vision, deep-sim tiers, seamless world, tiered ticks, and the full tech/multiplayer plan for **openpiece.io**.
- [REFERENCES.md](REFERENCES.md) — the **ideas** from every reference game (Mount & Blade, Kenshi, DF, RimWorld, moomoo, Arcane Odyssey, …), tier-listed S/A/B/C by worth for openpiece, each tagged with its source + build status.

Architecture: [../ARCHITECTURE.md](../ARCHITECTURE.md) (foundation) · [../ARCHITECTURE_SCALE.md](../ARCHITECTURE_SCALE.md) (scaling).
