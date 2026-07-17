# Open World & Ocean Zones (Design)

> **Stage:** designed — zones + seamless chunked sea decision (ledger); chunk build deferred

Open world: travel anywhere across the One Piece seas — many islands, connected by sailable ocean divided
into **zones** that gate content, set hazards, and reward exploration.

## Sea region progression (content gates)
| Region | Name | Notes | Ship gate |
|--------|------|-------|-----------|
| **C1** | East Blue / Calm Belt | Starter. Calm waters, low-tier factions, intro content. | basic **Sloop** |
| **C2** | Grand Line Entry | Mid-game. Unpredictable weather, stronger faction presence. | **Caravel** recommended |
| **C3** | New World Approach | Late-game. Extreme hazards, elite faction encounters. | **Galleon** + upgrades |
| **C4** | End Game Seas | Max danger, top-tier crews, exclusive content. | full gear + max ship |

## Environmental hazards (per zone)
- **Tsunami Zones** (high risk) — massive waves capsize/heavily damage ships. Sloops vulnerable; Galleons
  resist best. Stationary ships take extra damage (interacts with sea events).
- **Stormy Zones** (medium) — high winds, low visibility, lightning; hull damage accumulates over time
  without upgrades. All classes can enter.
- **Sinkholes** (high) — pull currents drag surface ships under. **Submarines** use them as entry points to
  underwater content.

## Climate / temperature
Zones have climates; the **Adventure Dex temperature** tracking ties directly to the zone climate system
(gear/consumables to survive extremes later).

## Wildlife & sea creatures
Spawn across seas/zones — whales, sea kings, crocodiles, sky serpents. Some hostile, some hunted for
materials (feed crafting + dexes). **Underwater wildlife changes with depth** — deeper dives reveal
different creatures.

## Underwater (C4+, WIP)
A third content layer via **submarines / diving gear**: hidden caves, deep-sea dungeons (mini & full bosses),
current-based puzzles.

## Engine implications (preview)
- World = a **graph of regions/islands**; each `ZoneDef` carries climate, hazard set, tier gate, spawn tables.
- **Seamless chunked sea** (decided 2026-07; supersedes region-scene streaming — scene transitions would kill
  the sailing moat, `SAILING.md`): chunks tick in tiers (active/nearby/distant); zones are DATA painted over
  one continuous ocean — crossing a boundary changes hazards/climate, never screens. Built at the recorded
  trigger (world size/entity counts), AFTER persistence; sailing ships earlier on a larger fixed map.
- Hazards = environmental systems reading the active `ZoneDef` (a `HazardSystem` that applies effects to ships).
