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
- `COMBAT.md` — the four-layer combat system, power tiers, mode switching.
- `PROGRESSION.md` — stats/haki/talents, dexes, class system, ability sources, races, EXP tiers.
- `WORLD.md` — open world, ocean zones, hazards, wildlife, underwater.
- `NAVAL.md` — ships, parts, stats, modes, cannons, naval combat, submarines.
- `EVENTS.md` — sea events, land events, factions, reputation, the event director.
- `ECONOMY_ACTIVITIES.md` — gathering, crafting, blacksmithing, market, activities/talents, mounts, items.

**Status:** vision capture. Combat foundation is the agreed first build target ("good moat combat system first").
