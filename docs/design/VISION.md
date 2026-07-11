# Ballpiece — Vision (Design)

> These design docs capture the **target vision**. They are intentionally ahead of the code. Nothing here is
> "build now" — the job is a foundation that can absorb all of it as **content + small systems**, never rewrites.
> See `docs/ARCHITECTURE_SCALE.md` for how each domain maps to a proven, scalable pattern.

## Reference & genre
A **One Piece-inspired open-world action-RPG**, in the spirit of **Rell Seas** (and Necesse/OSRS for systems):
direct-control action combat, a living faction world, sailing the seas between many islands, and deep
**non-linear** progression where you grow by *doing what you enjoy*, not grinding one track.

## Pillars
1. **Deep, skill-based combat as the moat.** Your combat identity = four layers stacked: **Devil Fruit** +
   **Haki** + **Weapon class** + **Fighting style**, tuned by **Combat Potentials**. Skill expression
   (Flash Dash directional i-frames, mode switching, Haki countering fruits) matters more than raw stats.
2. **Every character is a peer (the Moat).** The hero is not special — NPCs, marines, rivals all run the
   *same* component/system stack. Control is a component; you could possess any of them.
3. **Open world, many islands & seas.** East Blue → Grand Line → New World, gated by **Ocean Zones** with
   real environmental hazards and ship-class requirements.
4. **Living world, not static quests.** Faction-driven **land & sea events** activate by proximity and
   randomize; **reputation** persists and reshapes the world.
5. **Non-linear progression.** Stat / Haki / Talent points; you *can't* max everything. Skills (fishing,
   mining, cooking, crafting, woodcutting, shipwright, thieving, sailing) each cap at 500 and feed overall growth.
6. **Naval depth.** Ships are characters too — classes, parts, stats, exploration vs battle modes,
   cannon types, ship-to-ship combat, submarines.

## Power & scope tiers
- **Power tier** per unit: `-F … F … SSS+` (derived from stats + gear + fruit/haki). Drives matchmaking of
  threats, bounty, and content gating.
- **Sea regions** C1–C4 gate the world (see `WORLD.md`).
- **Races**: Human, Fishman, Mink, Cyborg, Sharkman, Skypiean, … (stat/trait modifiers + ability access).

## Design docs index
- `DESIGN_BACKLOG.md` — **the moat map**: which systems still need a REAL design pass (vision capture ≠
  design), the hard questions each must answer, and the pass order. Start here to see what's next.
- `COMBAT.md` — the four-layer combat system, power tiers, mode switching.
- `SAILING.md` — the sailing MODEL (wind, sail curves, momentum, anchors, impacts, sinking, navigator skill
  bands, AI feasibility) — a completed design pass; NAVAL's movement half stands on it.
- `NAVAL.md` — ships as AXES (rig/size/draft/crew), parts + the upgrade trade-off LAW, cannons, naval combat.
- `WORLD.md` — open world, ocean zones, hazards, wildlife, underwater; the seamless chunked-sea decision.
- `PATHFINDING.md` — the movement-planning stack: solver, regions, cross-frame portals, shared fields,
  squad/division movement, execution contract — a completed design pass.
- `PROGRESSION.md` — stats/haki/talents, dexes, class system, ability sources, races, EXP tiers.
- `EVENTS.md` — sea events, land events, factions, reputation, the event director.
- `ECONOMY_ACTIVITIES.md` — gathering, crafting, blacksmithing, market, activities/talents, mounts, items.
- `ai/AI_INTELLIGENCE.md` — the INT axis: one AI stack where INT 1–10 gates perception, knowledge, decision,
  execution, and command; the information economy; counter-play; offline-only ML.
- `DEEP_SIMULATION.md` — the Moat, the living sea, world structure, the multi-scale runtime, the road to
  ballpiece.io. `REFERENCES.md` — ideas from reference games, tier-listed.
- `features/` — per-feature design notes (movement frames + the transition rulebook, the walkable ship).

**Status:** vision capture, with completed design passes marked above. Combat foundation was the agreed
first build target; the pass queue lives in `DESIGN_BACKLOG.md`.
