# Combat (Design)

Combat is the moat. Your identity comes from **four layers** stacked on a shared attribute/ability engine,
tuned by Combat Potentials and expressed through skill (movement, timing, mode switching).

> Architecture: all four layers are **content** that grant **Abilities** + passive **Modifiers** into one
> GAS-lite engine (Attributes + Abilities + Effects + Tags). See `ARCHITECTURE_SCALE.md §Combat`.

## The four layers (combat identity)
1. **Devil Fruit** — elemental or beast powers. Types: **Paramecia / Zoan / Logia**. Each fruit = a moveset
   (a set of Abilities) + passives + lore. Logia intangibility, Zoan transformations, Paramecia gimmicks.
2. **Haki** — **Armament** (damage/defense, can strike Logia & bypass intangibility — *counters fruits*),
   **Observation** (dodge/aim assist, telegraph reads), **Conqueror** (AoE fear / CC). Later: **advanced**
   variants (e.g. ryuo/future-sight tiers). Haki is the rock-paper-scissors answer to Devil Fruits.
3. **Weapon class** — **Light / Medium / Heavy / Ranged**. Defines base attack style, startup/recovery,
   stamina cost, reach. Weapons come in **sets** with stats; upgradable (~20 tiers, weaker weapons get more
   upgrades) and **enchantable** (blacksmithing).
4. **Fighting style** — techniques & bonuses layered on the weapon (e.g. **Flash Dash**, **Geppo**). Provide
   movement tools and combo extensions.

## Reach (body + weapon)
Melee **reach = the unit's body `reach` attribute (race/build) + the weapon's length bonus**; ranged
abilities are a fixed range. So the same fist reaches equally for any human, a bigger body (or a long-limbed
race like Fishman/giant) reaches further, and a sword adds its length on top — all data-driven via a `reach`
attribute that races/potentials modify like any other stat (`abilityRange()` in `combat/Ability`). Hit
detection then adds the target's radius.

## Combat Potentials
Stat-boosting **"posters"** that tune your build (think equippable passive modifier sets). Pure data:
each potential = a named bundle of **Modifiers** (flat/%/override) applied to your Attributes.

## Power tier
Per-unit tier `-F … SSS+`, derived from attributes + gear + fruit/haki investment. Used for: threat scaling,
bounty, content gates, and "can I even hurt this boss" checks (tier gaps reduce effectiveness).

## Core combat mechanics
- **Flash Dash** (base kit, all classes): burst in any direction through attack-startup frames.
  **Directional i-frame rule:** left/right dashes grant i-frames; front/back do not. Identical on land & ship.
- **Mode switching:** swap the active ability set mid-fight (e.g. weapon-forward ↔ defensive stance) without
  pausing. Fully rebindable keys, including ability activations.
- **Damage multiplier hit-spots:** yellow → orange → red escalating damage zones (taught by Cargo Ship event;
  applies to ships and likely bosses).
- **Cross-class abilities:** active/passive abilities slot into finite **loadout slots** regardless of class
  (a Swordsman can run a Gunner mobility ability). Core attack style/primary weapon stays class-bound.

## Bosses
Where you test the full build. Each boss has a unique ability drop (first kill guaranteed). **Mesh-form
bosses** (multiple enemies combine into a giant) emerge in War events.

## Engine implications (preview)
- **Attributes**: Health, Endurance, Defense, Willpower, Luck, Spiritual (+ derived: power tier, stamina, …).
- **Abilities**: cost (stamina/haki), cooldown, cast/active windows, tags, granted by any of the four layers.
- **Effects**: instant (damage), duration (buffs/debuffs/DoT), infinite (passives), CC (Conqueror fear,
  stuns). Stackable, source-tracked.
- **Tags**: `state.logia.intangible`, `haki.armament.active`, `cc.feared`, `fruit.type.zoan`, … drive
  immunities, counters, and conditions (Armament tag lets a hit bypass `state.logia.intangible`).
