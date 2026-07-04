# Combat Mechanics

This page contains basic information about combat and its associated mechanics, including details on status bars, attacks, status effects, and more.

Knowing this information is crucial to prolonging your life, and will give any voyager a fighting chance when they inevitably enter a skirmish with their future adversaries — or worse, allies.

---

## Contents

1. [GUI](#gui)
2. [Maps](#maps)
3. [Keybinds](#keybinds)
4. [Survival Basics](#survival-basics)
5. [Inventory](#inventory)
6. [Combat Basics](#combat-basics)
7. [Telegraphed Attacks](#telegraphed-attacks)
8. [Status Effects](#status-effects)
9. [Magic Basics](#magic-basics)
10. [Advanced Movement](#advanced-movement)
11. [Alliances](#alliances)
12. [Trivia](#trivia)

---

## GUI

There are many elements to the GUI, each one playing its own part. Learning these is essential to surviving.

### Health Bar

A visual representation of the player's health. Players start with **220 Health** (224 at Power 1). Max health is increased by:

- **Fortitude** — 0.5 Health per invest from 0–50 invest, 0.25 per invest beyond 50
- **Health bonus** from Talents and Equipment
- **Vitality** — 10 Health per Vitality
- **Power** — 4 Health per Power

Upon reaching 0% Health, the player is knocked **Unconscious** and is at the mercy of anyone nearby.

- Regeneration is sped up while sitting at a **Campfire**, and slowed while in combat.
- Natural health regeneration is **disabled** if the hunger bar is below 12.5%.
- The lower your Health, the slower you get — Health directly affects your agility.

**The four states of the Health bar:**

| State | Description | Death Consequence |
|-------|-------------|-------------------|
| Normal | The default state of the health bar. | Lose one life (excluding the Hollow modifier). |
| Rusted/jaundiced | The state after dying once. | Sent to **The Depths** on death. |
| Voidzone (no prior death) | Rusted, unlike its normal state. | Sent to **The Depths** on death. |
| The Depths | The state while in The Depths. | Sent to **Fragments of Self** on death. |

**Void health:** The stained part of the bar represents your void health. If your health bar does **not** reach the stained part and you jump into the void, you are sent to the **Second Layer**. If your bar **does** reach the stained part and you jump into the void, your character is sent to **Fragments of Self** instead.

### Posture Bar

A visual representation of your ability to guard against attacks. Building this bar indicates **negative standing** — keep it as low as possible during combat. When the next attack causes posture to exceed the bar, the next blocked hit will instead **guard break**, stunning you for **1.05s**.

Posture can be restored through:

- Passive regeneration when not sprinting or blocking
- Parrying attacks
- Landing a Taunt (T)
- Certain Talents

**Posture caps:**

- Posture damage **dealt** has a soft cap of **1.5×** (multipliers beyond this are halved), with a hard cap of **1.75×** (max 175% of intended damage).
- Posture damage **received** has a hard cap of **0.5×** (you can't take less than 50% of intended damage).

When blocking during shaky block frames, your posture bar glows red to indicate your block isn't full yet.

### Cooldown Icons

Icons that indicate whether you can perform certain actions. When reddened/grayed out, the action is on cooldown.

| Icon | Action |
|------|--------|
| 1st | Roll cooldown |
| 2nd | Parry cooldown |
| 3rd | Block availability |
| 4th | Cancels & feints cooldown |
| 5th | Resonance cooldown (only visible if you have one) |
| 6th (on weapon slot) | Weapon critical cooldown |

### Cooldown Indicators

Represent the cooldown for nearly everything in-game (excluding Mantras) — from Talents like Kick Off, Propagandist, and Audacity, to Criticals, Feints, Resonances, and special effects such as Sudaruska's Fury and Immortality. The cooldown name shows on the left, and time remaining on the right.

### Ether Bar

Ether is Deepwoken's form of mana — Mantras cannot be used without sufficient Ether.

- Increase Ether regeneration via certain outfits (usually master outfits) or various Talents.
- Different Mantras use varying amounts of Ether; Mantra Modifiers increase the cost.
- Ether passively regenerates in combat as long as you have **tempo**. With no tempo, you regenerate 0.5% of your Ether bar per second.
- Ether regenerates faster when out of combat.

### Tempo

Tempo increases Ether regen during battle and permits **venting** if you have enough stored. Base Tempo starts at **120**.

- Gained by hitting or being hit.
- Decreases over time (1% per 0.6s) and is "stored" when out of combat.
- With at least **40 Tempo**, press **G** to Vent. This pushes away nearby players but can be parried/blocked. A parried, blocked, or missed vent leaves you stunned.
- More **Erudition** makes venting easier (more Tempo and Tempo regen).

### Armor Durability

A visual representation of current armor durability. When depleted, your armor is **"broken"** — you take damage as if you have no armor at all.

- Repair via a **Blacksmith**, certain Talents, the **Metal Enchantment**, or a **Bloodiron Ring**.
- With the **Exoskeleton** Talent or as a **Vesperian**, there are two armor bars: white (Armor) and green (Natural Armor).

> Applying all of this takes time to master. As you play and face hardships, watching over these values will come naturally. Ward your frustration — there is still the road ahead, Pathfinder.

---

## Maps

After talking to a shipwright or spawning a boat, you unlock the ability to write down your navigations.

- Unexplored places are obscured; visited places are fully written.
- A **yellow** marker (blue in the Depths) shows your current location, along with waterlocks leading to the next Luminant.
- Guildmates appear with their first and last initial, and points of interest are shown for your current location.
- Crossing the map boundary shows an arrow to the side of the map.
- With **Dimensional Travel/Kamui**, using a map inside of it also reveals your physical location.

**Map types:** Points of Interest, Out of Bounds, Guild Mates, Obscured, Etrean Luminant, Eastern Luminant, Layer 1, and Combined.

---

## Keybinds

In the settings menu, a Keybinds section sits next to the settings page. Each action allows two different keys, with the first one preset. Press the **reset** button next to an action to revert it.

- Certain actions (Ironsing's pull, Murmurs) require access to them on your current character to rebind.
- You currently **cannot** change keybinds for ritual casting.

---

## Survival Basics

These stats must be maintained to survive. They gradually deplete over time, and depletion can be sped up by environments, creatures, or other players.

- Eat food to replenish **Stomach** and hydrate to replenish **Water**. Many foods (e.g. Mushroom Bisque) restore both.
- Once both are depleted, you lose **Blood** and your health is halved.
- Once every bar reaches zero, you enter a combat state and become helpless unless you eat within a few seconds. Otherwise you're knocked and die from blood loss/starvation.
- These stats appear at the bottom-left of your screen.

### Blood

How much Blood is in the player's body. Taking damage causes blood loss. **Max blood equals half of your max HP.** Upon reaching zero Blood:

- You are always combat tagged.
- Water and Stomach rapidly decrease.
- Getting hit while bleeding out drains a large amount of Water and Stomach.
- Blood loss is based on damage taken.

When healing at a campfire, your Water and Stomach work together to replenish Blood.

### Water

How much Water is in the player's body. Not too vital — depletes over time, and you lose 50% upon vomiting. Upon reaching zero Water:

- Your screen becomes blurry.
- You move slower.
- Water drains faster when replenishing blood at a campfire or swimming.

### Stomach

Essentially your hunger bar. You lose 50% upon vomiting. Upon reaching zero Stomach:

- You gradually lose health and blood.
- Your max health is reduced.
- Swimming while starving with under 50% HP immediately knocks you, drowning you if unassisted.
- Stomach drains faster when replenishing blood at a campfire or swimming.

---

## Inventory

Your inventory is color-coded by item type. Use the search bar at the bottom to find items quickly.

**Item frames (rarity):**

| Frame Color | Meaning |
|-------------|---------|
| Grey | Common (always seen on elemental weapons like Crypt Blades) |
| Yellow | Uncommon |
| Red | Rare |
| Cyan | Legendary |
| Purple | Potions and enchants |

> Item frames aren't always tied to drop rate — some "Legendary" items drop commonly.

**Update history:**

- **2/9/24** — Category revamp: 9 categories, with item counts shown on the right.
- **2/16/24** — Added 3D model icons (toggle in settings: Always / Hover / off), collapsible categories, and a 10th category (Relics).

### Inventory Categories

| Order | Category | Weight | Contents |
|-------|----------|--------|----------|
| 1 | Abilities | None | Activatable Talents (Chime of Dwelling, Guild Officer, Voideye, Call of the Deep); equipped Mantras when hotbar is full. |
| 2 | Tools | None | Campfires, Fishing Rods, Gliders, harvesting tools, guild tools, Hunter's Brace. |
| 3 | Training Gear | None | Ankle Weights, Dumbell, Vest/Boulder, Encyclopedia. |
| 4 | Equipment | 0.1–2 | Equippable armor and clothing. |
| 5 | Weapons | 2 | Equippable weapons and off-hand items. |
| 6 | Schematics | 1 | Blueprints turned in at blacksmiths to craft. |
| 7 | Quest Items | None | Items that interact with quests. |
| 8 | Consumables | Varies | Foods and potions. |
| 9 | Relics | None | Mythical items that rewrite fate (alloys, books, parchment, idols). |
| 10 | Materials | Varies | Foraging/chest materials for crafting/alchemy; Mantra modifiers. |

### Carrying Capacity

Also known as Carry Load — how much weight you can hold before your speed drops and you can no longer safely carry items. Hover over an item to see its weight (blue box) and sell value at an **Antiquarian**.

- **Soft cap** — the listed capacity in your inventory. You can exceed it up to the hard cap.
- **Hard cap** — at this point your carrying capacity turns red. The closer you get, the slower you move. Eventually you cannot pick up anything more until you drop items.

> Example: if the soft cap is 240, the hard cap is anything past that.

### Locking Items

Right-click a sellable/droppable item to **lock** it, preventing it from being sold or dropped. Locked items show chained borders.

---

## Combat Basics

Dealing damage matters, but reducing posture also reduces your adversary's volatility. Even a blocked attack places them in negative standing.

### Basic Attacks (M1)

Left-clicking (**M1**) swings your weapon, dealing damage unless the target blocks, parries, or dodges.

- Blocked attacks deal **Posture Damage** (scaled by weapon weight, not damage output).
- After consecutive hits (typically 3 then flourish; 4 for rifles; 2 for 2H guns; never for 2H twinblade), you perform a **Flourish** — a kick that launches the target away, ending your string and preventing infinite combos. Flourishes have small endlag (cancellable with a Mantra) and can only be feinted by casting a Mantra.
- Many Talents modify Flourishes (Concussion, Flaming Flourish, Chilling Flourish, etc.).
- Hitting or parrying applies **stun** — briefly lowering movement speed, disabling rolling, canceling attacks, and nullifying Mantra hitboxes.

**Running Attack:** An M1 while running strafes forward with increased range, then stops you in place with increased end-lag and slightly increased windup. Useful for catching adversaries off guard; hitting a turned back charges in with a gust of wind. Only feintable with a Mantra.

> Getting hit negates your ability to M1 for slightly longer than your roll cooldown — don't try to M1 mid-combo.

### Critical Attacks (R / M3)

Initiate by pressing **R** or clicking **M3** (R is advised). Uses include:

- High posture damage (especially Heavy weapons)
- Rhythm disruption (Crescendo, Rifle Spear)
- High damage (Rosen's Hellflame, Wretched Mawblades)
- Utility (Petra's Anchor dash, Darksteel Greatsword hyperarmor)
- Pressure (First Light zoning, Flareblood Kamas ranged)

> Most Criticals **cannot be feinted** — commit when you use one.

### Parrying (F)

Press **F** to enter a deflection stance momentarily. Enemies who hit you during this window are parried — stunned, dealt posture damage, while you reduce your own posture. Tapping or holding F doesn't matter.

- Successful parries grant **0.3s of auto-parry** and reset the parry cooldown.
- Parrying cancels all attacks and their damage, even from behind — but blocking does not.
- Cooldown is **1.2 seconds**. If you miss, hold F to **Block** instead.
- Parrying physical attacks (Mantras, M1s) fully interrupts the opponent's action — though not all Mantras (especially projectiles). You may also try to roll a Mantra.
- You perform a parry instead of a block if a parryable attack hits during parry frames. Parry frames are indicated by a distinct stance and a subtle "whoosh" sound.

### Blocking (Hold F)

Holding **F** after deflection frames wear off braces you against incoming attacks, raising posture instead of losing health. The blocker can act slightly before the attacker (less than with a parry). Exceeding your max posture results in a **block break**.

- If hit, your block is disabled and you're forced to parry. You may also **Vent** (G) with enough Tempo.
- Parrying immediately after a hit puts you in **shaky block** (hitstun preventing blocking). Duration scales with weapon swing speed — above 1× swingspeed reduces it (capping at –20% with 1.2× swingspeed). Indicated by shaking arms, covering your head, and a red posture bar highlight.
- Most blocks only stop attacks in **front** of you; some attacks have a **360° block** property.

### Venting (G)

With at least **40 Tempo** (small notch on the tempo bar), press **G** to Vent.

- Pushes nearby players away, grants brief relief from combos/overcrowding, and deals a tiny **5 damage** (enough to cancel attacks and knock low-health foes).
- Clears certain Status Effects, such as Knockdown.
- A failed, parried, or blocked vent stuns you in place.
- You **cannot** Vent while block-broken or assassinated.
- Vents are parryable, blockable, and rollable (all negate knockback). Parrying one stuns the venter as if they missed.

### Feinting (M2)

Right-click (**M2**) during your windup to fake out the opponent.

- Hold the button to feint your M1 ASAP and attack again sooner.
- Feint Running Attacks and Uppercuts using a Mantra just before striking.
- Feint Mantras with M2 during a cast.
- Feint a swing into a Mantra by casting during the windup.

> The strongest feints have **no pattern or rhythm** — predictable feints become a weakness.

You can also make a makeshift feint by intentionally missing an attack (a gamble that spares the cooldown). Feinting has slight end-lag.

### Rolling (Q)

Press **Q** to Roll in a direction with immunity frames against most attacks.

- **Roll-cancel** by pressing M2 during the roll for a guaranteed extra (also cancellable) roll. Many experienced players prefer this over plain rolling — it cancels endlag.
- Many Talents add roll properties (e.g. Galebreather's Gale Dash).
- Pressing Q midair performs an **Air Dash** (counts as a roll, can dodge attacks).

### Stance Change (Y)

Press **Y** to switch between one-handed and two-handed. Most Light weapons can't switch (except Fists, which swap fist styles).

| Stance | Notes |
|--------|-------|
| **One-Handed** | Default for Light/Medium weapons; Heavy weapons use it after 40 HVY. Allows off-hand equipment (shields, parry daggers, guns). |
| **Two-Handed** | Default for Heavy; available to Medium. Off-hand equipment is put away. **+10% posture damage** vs. blocks. |
| **Dual Wielded** | Exclusive to select weapons. Like One-Handing but no off-hand weapons; usually can't swap stances. |

### Assassination

While crouched, sneak up behind most humanoid enemies (not Songseekers) and M1 from behind.

- Deals large damage to NPCs; **15%** of a player's max health (scaling with agility up to **25%**).
- Backstabbing an NPC ragdolls them for 5 seconds and puts their Vent on cooldown.
- Auto-executes NPCs if the damage is high enough.
- Stealth stat (via equipment) improves your crouch detection range.

> If the target survives, swing as much as possible before they recover.

### Uppercut (Ctrl + M1/M2)

Hold **Ctrl** and press M1 or M2 to launch adversaries into the air (monsters stay grounded).

- Victims are lifted and briefly unable to move, with tighter parry timing — a big role in combos.
- Unique windup speed of **0.9** regardless of weapon, making it great for slow Heavy weapons.
- Damage scales with swingspeed (fast weapons deal more on uppercut).
- Landing an Uppercut vs. a dodge/block lets you M1 before they retaliate.
- A flourish on a stunned aerial target kicks them to the floor (triggers wall-bang Talents like Bulldozer, Breathing Impact).
- **Missing** immobilizes you (like a failed Vent), though you can usually parry an incoming attack.
- Feint with a Mantra just before striking.

### Taunt (T)

Press **T** to taunt (colloquially "spit"/"spitting"). Your character spits in front of them.

- Spitting in another Humanoid's face (or toward a Humanoid facing away, from a few studs) briefly blurs their vision, heals you ~**2%** HP, and restores moderate posture.
- Risky — considerable startup and endlag; usually better to just attack.
- Best used to taunt inferior foes or as a risky mixup.

### Chase Attack

Initiate a running attack while chasing to speed up, catch your opponent, and strike.

### Air Counter (M2 midair)

Press **M2** midair when your opponent performs a wall jump or certain air moves. Air Counters deal **no damage** — they're chase tools.

Triggers when the opponent: climbs, uses Wind Step (Galebreathe), uses a vertical Mobility Mantra (Flame Leap, Strong Leap), is hit by Eyes of Ethiron's two-handed crit, or uses a Lifevent.

> The **Cut to the Chase** Talent adds 10 True damage to air counters.

---

## Telegraphed Attacks

Some attacks come with an audiovisual cue: a colored glyph (sometimes with a matching outline) and a sharp sound effect. These usually require specific action to avoid.

Notes:

- The telegraph shown is usually the optimal — or only — way to avoid the attack.
- The glyph may vary by source, but its **color** will not.
- With **Simple Telegraphs** on, only colored outlines show (no glyphs).

| Telegraph | Defenses / Info |
|-----------|-----------------|
| **Guardbreak** | Instantly guardbreaks if blocked, regardless of posture. Color varies by attack. Not all unblockable attacks show it. → Parryable, Unblockable, Dodgeable |
| **Homing** | Used on homing projectiles. Animation/duration varies with travel time; color varies by attack. → Parryable, Blockable, Dodgeable |
| **High Posture** | Most deal high posture damage. Most Monster versions are parryable with Force Your Way. → Unparryable, Blockable, Dodgeable |
| **Dodge** | Must be dodged; guardbreaks if blocked. Some Monster versions parryable with Force Your Way. → Unparryable, Unblockable, Dodgeable |
| **Block** | Most deal high posture damage. Some Monster versions parryable with Force Your Way. → Unparryable, Blockable, Undodgeable |
| **Parry** | Must be parried; guardbreaks if blocked. → Parryable, Unblockable, Undodgeable |
| **Duck** | Can be crouched/slid under. Most deal high posture damage. → Crouch/Slide |
| **Jump** | Can be jumped over. → Jump-Avoidable |
| **Avoid** | Must physically move out of the way. Some have unique avoidance mechanics (check enemy pages). → Unparryable, Unblockable, Undodgeable |

**Circle/Crosshair indicator colors (by Attunement):**

| Color | Attunement |
|-------|-----------|
| White | Attunement-less / unaligned |
| Light orange | Flamecharm |
| Light blue | Frostdraw |
| Yellow | Thundercall |
| Green | Galebreathe |
| Purple | Shadowcast |
| Light grey | Ironsing |
| Red | Bloodrend |

> Possibly a bug: Titus' Worldshattering Smackdown is dodgeable despite having a parry telegraph.

---

## Status Effects

Status Effects appear throughout the game, in combat and exploration alike.

| Effect | Visual | Description |
|--------|--------|-------------|
| **Broken** | Torn-up clothes | Lose all defensive bonuses from outfit/equipment. Occurs when armor durability drops below 0%. |
| **Charmed** | Hearts on head | With Talents like Charismatic Cast / Tough Love, you deal extra and take less damage from the charmed target. Sources: Charisma Talents, Sing Mantra. |
| **Taunted** | Red glowing sparks from head | Victim cannot jump. Damage output and intake increased for both user and target. Sources: Taunt Mantra, "Cornered Fool" Talent. |
| **Chilled** | Blue mist | Speed reduced. Sources: Frostdraw Mantras, Crustaceous Rex bubbles. |
| **Burning** | Fire on body | Slight damage over time. Roll to end early, or clears after 10s. Deepfire Ring makes it tick faster but end sooner (net-neutral, higher DPS). Source: Flamecharm Mantras. |
| **Shocked** | Yellow sparks on body | Hitstun of the applying attack increased by 0.1s; cancels hyper armor. Sources: Thundercall Mantras, The Ferryman. |
| **Electrified** | Yellow sparks buzzing around body | All outgoing attacks convert to Electric/Thunder damage (often paired with thunder-reducing gear). Source: Thundercall Mantras with Resolve Crusher. |
| **Winded** | Green particles | Attack speed reduced. Source: Galebreathe Mantras. |
| **Suffocate** | Crosses spinning at neck | Slight damage over time; cannot cast Mantras. Source: Galebreathe Mantra with A World Without Song. |
| **Dazed / True Daze** | Stars above head | **Dazed:** speed greatly reduced, dodge frames reduced (showstopper, stifled jump, punishing blow, dazing finisher). **True Daze:** speed greatly reduced, cannot roll (wall flourish, wall ragdoll, second hit of Wretched Mawblades). |
| **Anti-heal** | Purple mist | Disables/reduces all healing and temp health (passive regen, spit healing, Reinforce, Symbiotic Sustain, Mindsoothe, Revitalizing Spray, Bloodless Gems, campfire regen, Blood Scourge). Does not affect knock health packs; does not affect allies/guildmates. Sources: Mudskipper Broodlords, "All the Dead Gods" / "Deep Wound" Talents, Ring of Pestilence. Scales with source. |

---

## Magic Basics

### Spell Casting

Using a spell depletes Ether based on its volatility. A sound cue plays while casting — timing your click to it casts faster. A visual cue also exists but differs per spell.

### Spell Feinting

Like melee feinting, you can fake a spell and quickly select another (e.g. fire grab → fire AoE).

- You can feint rituals, but you need all ritual items to start and stop it. There may be consequences for canceling ritual-tier magic — be careful.
- Performed by pressing **M2** during the Mantra's wind-up. **Does not refund Ether.**
- You can feint and feint at the same time (double feint) to draw out parries and rolls — tricky to deal with, especially with quick Mantras.

---

## Advanced Movement

| Technique | Description |
|-----------|-------------|
| **Roll Cancel** | Press M2 during a roll (like feinting) to cancel it. Great after perfect dodges to attack immediately or fake out opponents. Grants the same i-frames as a perfect roll until the feint. |
| **Ragdoll Cancel** | After being ragdolled, press M2 for a backflip that ends the ragdoll early for some attacks (e.g. a Thresher tail whip). |

---

## Alliances

The Alliance mechanic **minimizes** friendly-fire damage rather than granting full immunity. The game runs an "ally check" when calculating damage or procing abilities — allies take less damage from you, and some Talents enhance this or proc extra effects.

- Allies can read your **Shouts** anywhere in a server. In Dungeons/instanced servers, all messages auto-shout. In public servers, prefix a message with **!** to shout (e.g. `!give me 30,000 notes`). Works through Vow of Allegiance allies.
- Guild members are automatically allies.
- Form a **Vow of Allegiance** with outsiders by saying *"Wanna make a vow of allegiance [name]?"* near them; they accept with *"yes"* to open a confirmation window. No stat/Talent requirements.
- Vows persist on the **slot** (not the character or account); each slot holds up to **50** allegiances.
- Break vows via a **Yun'Shul wish** at the Temple of Hearts (not the Idol) — but this breaks **ALL** vows on the slot.
- The ally check can be disabled with the **No Holds Barred** setting, useful for sparring with full damage and proc.

---

## Trivia

- The parry-based combat is heavily inspired by **Sekiro: Shadows Die Twice**, including Perilous Attacks (unparryable attacks) and the Posture Bar.
- The Health and Survival GUI each have **5 bars** representing 20% each, helping you interpret damage and consumable values.
- Taunting/spitting on passive NPCs angers them — but with at least **55 Charisma**, they thank you instead.
- The highest flat posture (with shields, equipment, and talents) as of 2/21/2025 is **70**.
- Some players call Ragdoll Cancelling **Teching**, after the fighting-game mechanic where inputting block/parry before hitting a surface cancels your launch and lets you act again.

## Weapons
### Light Weapons — Fighting Styles

| Name | Requirements | Base Damage | Scaling | Armor Penetration | Chip Damage | Posture Damage | Range | Swing Speed | Endlag | Scaled Damage |
|---|---|---|---|---|---|---|---|---|---|---|
| Fang and Coil | Fang and Coil Talent | 12 | LHT: 7 | - | - | 3 | 6 | 1.13x | - | 18.3 |
| Jus Karita | Jus Karita Talent | 14 | LHT: 9 | 20% | - | 3 | 6.5 | 1.14x | - | 23.5 |
| Imperium Kata | Imperium Kata Talent | 12 | LHT: 7 | - | - | 3 | 6 | 1.13x | - | 18.3 |

## Bloodfouler
**FOULEDBLOOD**

| Type | Damage Type |
|---|---|
| Greatsword | Slash Resistance / Slash |

### Requirements
50 HVY, LVL 10, 75 BLD

**Cannot be equipped on:** Silentheart

### Statistics

| Damage | Scaling |
|---|---|
| 19 + 2.85 BLD | HVY: 5, BLD: 4 |

| Posture Damage | Range |
|---|---|
| 8.5 | 9.5 Sweep |

| Swing Speed | Attack Duration | Endlag |
|---|---|---|
| 0.86x | 0.9s | 0.1s |

| Armor PEN |
|---|
| 20% |

### Special Effect
Restores a percentage of the user's blood upon landing m1

### Miscellaneous

**Stances:** 2 Handed, 1 Handed (≥40 HVY)

| Rarity | Selling Price | Carry Weight |
|---|---|---|
| Unique | 100 Notes | 2 |

| Bankable? | Droppable? | Enchantable? |
|---|---|---|
| Yes | Yes | No |