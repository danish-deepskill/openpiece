# Economy, Activities & Mounts (Design)

> **Stage:** capture — vision capture — the living-economy pass will judge it

Progression beyond combat: gather → craft → upgrade → trade. Each activity raises its own **talent** (cap 500)
and feeds non-linear growth. A merchant playstyle is a genuine path.

## Activities / talents (each caps at 500)
- **Fishing** — catch fish, hunt sea creatures, complete Fishing Dex.
- **Mining** — ores; feeds Craftsman Dex.
- **Woodcutting** — timber.
- **Cooking** — dishes & potions; recipe variations; Recipe Dex.
- **Crafting** — gear via blueprints; Craftsmen Dex.
- **Shipwright** — ship parts/upgrades.
- **Thieving** — lockpicking, steal.
- **Sailing** — navigation; ship-in-a-bottle spawning; unanchored ships can be stolen.
Most use **utility tools** (rods, axes, lockpicks) and track a **Dex**.

## Economy loop
Gather materials (mining/fishing/woodcutting/wildlife) → craft gear from **blueprints** → **blacksmithing**
to **upgrade** (~20×, weaker weapons more upgrades) & **enchant** → sell via a **Trader's Bag** (player market).

### Domains
- **Blacksmithing** — weapon upgrades & enchantments.
- **Blueprints** — categories & sources (drops, events, dexes).
- **Selling Market** — market & trading mechanics.
- **Items** — currencies, equipment, utility items.
- **Materials** — crafting mats (drops & usage).

## Mounts
Rideable creatures & vehicles that speed travel across islands and seas (land mounts; ships/submarines are
the sea analog). A `mount` = a rideable entity + a `rideable` component on it / `riding` on the rider.

## Engine implications (preview)
- Items/materials/recipes/blueprints = **registry defs** (`ItemDef`, `MaterialDef`, `RecipeDef`,
  `BlueprintDef`). Inventory = an `inventory` component (`Map<ItemId, qty>` + equipped slots).
- Crafting/blacksmithing = generic systems reading recipe/blueprint defs + consuming materials.
- Gathering nodes (ore/tree/fish spot) = entities with a `harvestable` component yielding material drops +
  talent XP.
- Market/trade = an economy service over item defs; talents = the `progression` tracks from `PROGRESSION.md`.
- Mounts/vehicles reuse `mover` + `rideable`; speed = a modifier while mounted.
