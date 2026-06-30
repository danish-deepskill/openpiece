# Progression, Classes & Character (Design)

Fully **non-linear**: grow by doing. No global level gate; you invest in any mix and **cannot max everything**.

## Three point categories
- **Stat Points** — Health, Endurance, Defense, Willpower, Luck, Spiritual.
- **Haki Points** — Armament, Observation, Conqueror (+ later advanced tiers).
- **Talent Points** — per-activity skills, each capped at **500**: Fishing, Cooking, Crafting, Mining,
  Woodcutting, Shipwright, Thieving, Sailing.

Early sea regions cap potential lower; veterans in late regions fully develop builds.

## EXP tiers
- **Major** — bosses, world events, dungeons.
- **Moderate** — random events, bounties, dexes.
- **Minor** — woodcutting/area discovery/exploration.

## Dexes (collection trackers, each feeds progression)
- **Adventure Dex** — per-area exploration quality; higher rating → higher-tier event spawns. Tracks
  temperature (tied to zone climate).
- **Fishing Dex**, **Recipe Dex**, **Craftsman Dex** — completion grants points/abilities.

## Class System (identity framework)
- **Weapon class** chosen at creation (Light/Medium/Heavy/Ranged): base attack style, starting weapon, core
  stat spread, passive traits (damage, stamina cost, move speed). Not irreversible — you can branch.
- **Cross-class ability transfer:** unlocked abilities slot into finite **loadout slots** across class lines.
  Core attack style/primary weapon doesn't transfer; only active/passive abilities do.
- **Ability categories:** **Agile** (mobility), **Combat** (offense/finishers), **Stealth** (evasion/counter),
  **Support** (heal/buff — crucial for crew play).
- **Ability sources:** faction crews (unique drops), talents (passive bonuses), land events, sea events
  (Legendary Ship / Marine Warship = high-tier), bosses (guaranteed first-kill), dungeons (scaled to depth).

## Races
Human, Fishman, Mink, Cyborg, Sharkman, Skypiean, … → stat/trait **modifiers** + race-gated abilities
(e.g. Fishman water affinity, Mink electro, Sky dweller). Pure data: a `race` def = modifier bundle + tags.

## Engine implications (preview)
- Talents/dexes = independent XP tracks (a `progression` component: `Map<TrackId, points>`), not one level.
- Class = a starting `WeaponClassDef` + a `loadout` of ability slots (data), not a subclass.
- Stat allocation feeds the **Attribute** system; race/potentials/gear/haki are **Modifier** sources.
