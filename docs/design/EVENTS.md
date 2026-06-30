# Events, Factions & Reputation (Design)

The world is alive: faction-driven encounters that **activate by proximity** and **randomize** over time —
not pre-placed static quests. Every event rewards XP, items, money, and **reputation** shifts.

## Factions
Many distinct pirate/world factions, each with unique lore, crew designs, and **multiple bosses** (incl.
**mesh-form bosses** — giants of combined enemies). Factions drive land events: two may wage a territorial
war while a third raids a dock. (Architecture: factions already are data + a relations matrix — see
`docs/ARCHITECTURE.md §11`.)

## Land events (spawn across islands)
- **Camp** — rescue imprisoned faction members (gratitude + rep) or raid (combat). Rep swings both ways.
- **War** — two factions clash; pick a side or hard neutrality. Highest-XP (enemy numbers). Big rep swings.
- **Pirate Dock** — faction holds a dock vs rivals; victor claims loot; your side decides control.
- **Raid Dock** — escalating waves; join raiders (cargo, raider rep) or defend (defender rep, boss drops).
- **Village Raid** — faction attacks civilians; Marines may engage. Defend (Marine/civilian rep) or attack
  (raider rep; alerts Marines → Jail System).

## Sea events (open-ocean, trigger while sailing)
- **Cargo Ship Protection** (common) — escort an NPC cargo ship; teaches the yellow→orange→red multiplier.
- **Cruise Ship Wars** (common) — pick a side in a two-faction naval battle; neutrality = minimal reward.
- **Ghost Ship** (uncommon) — spectral vessel, reduced damage from standard shots → enchantments help.
- **Marine Warships** (uncommon) — Admiral-tier patrols hunting high-bounty players; needs Galleon/upgraded
  Caravel. Pirates earn loot, Marines earn rank.
- **Legendary Ship** (rare) — raid-boss ship; multiple crews; best blueprints/materials/figureheads.
- **Sea Beast Hunt** (uncommon) — co-op fight a surfaced beast; Sea Kings drop blueprints/rare mats.
- **Sea Beast Battle** (rare) — two beasts fight; exploit chaos for double loot; tsunami zones punish idling.
- **Underwater events** (C4+, WIP) — submarine/diving only: caves, deep-sea dungeons, current puzzles.

## Reputation system (persists across sessions)
- **Positive** → friendly NPCs, missions, discounts, special items.
- **Negative** → hostile on sight; their territory is dangerous.
- **Neutral** → skippable, minimal rewards. Past choices are remembered.

## Adventure Dex drives spawns
Per-area exploration quality dictates event **tier**; thorough exploration unlocks better encounters. Some
events are island/region-exclusive.

## Engine implications (preview)
- An **Event Director** (à la L4D AI Director): picks `EventDef`s by area, Adventure-Dex tier, and active
  factions; spawns the encounter; resolves rewards & reputation deltas on completion.
- Events are **data** (`EventDef`: type, faction roles, spawn table, triggers, rewards, rep deltas).
- Reputation = a per-faction score component on the player; faction relations consult it for on-sight stance.
- Proximity triggers = a `TriggerVolume`/zone check system.
