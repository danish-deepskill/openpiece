# Openpiece — Ideas from Reference Games, Tier-Listed by Worth

> **Stage:** meta — idea tier list — scores worth, not designs

> Every reference game we've drawn on offers *ideas*. This doc tier-lists the **ideas** (not the games) by **how
> worth-stealing they are for openpiece** — a One Piece-inspired action-RPG aiming at a *living, deeply-simulated
> sea* you rise through from F-tier villager to Yonko, on a **deep skill-based combat moat**. Each idea cites its
> **source game(s)** and a **status**. Design capture, ahead of the code. Companion: `DEEP_SIMULATION.md`.

**Tiers** = worth/fit for openpiece (S = defining · A = major systems · B = strong enhancers · C = niche/far-future),
ordered most→least worth *within* each tier.
**Status:** ✅ done · 🌱 seeded in code · 🔨 to build · 🧊 far-future / situational.

---

## Games index (where the ideas come from)

| Game | One-liner | Chief ideas it gave us |
|---|---|---|
| **Mount & Blade** | rise nobody→king; campaign map + fight as one unit | multi-scale command loop, recruit crew, hold territory |
| **Deepwoken** (Roblox, via **Sekiro**) | hardcore island RPG, Sekiro-like combat | posture/parry/feint/telegraph combat, status effects, survival stats, progression + permadeath |
| **Kenshi** | a living world that ignores you | autonomous factions, squad control, emergent situations |
| **Arcane Odyssey** (Roblox) | One Piece-inspired sail-the-seas RPG | real sailing, island world, progression identity, naval |
| **Shadow of Mordor** | procedural rival captains | the **Nemesis** system (memory/grudges/promotion) |
| **RimWorld** | colony sim w/ an AI Storyteller | event director, agent needs, tiered ticks, time controls |
| **Dwarf Fortress** | the deep-sim north star | generated history, simulation-LOD, per-agent micro-sim |
| **moomoo.io** | shallow but clean .io | data-driven AI, server-authoritative thin client, culling |
| **Caves of Qud** | reactive roguelike | everything-is-an-object, generated history, faction rep |
| **OSRS** | skill/economy depth | non-linear skills, player-driven economy |
| **Factorio** | logistics at scale | deterministic tick, data-oriented performance |
| **EVE Online** | player-driven galaxy | shared economy/politics at scale, time-dilation |
| **The Sims** | social sim | agent needs + autonomy |
| **Necesse / Terraria / Starbound** | seamless survival worlds | seamless chunk-streamed world |
| **Starscape** (Roblox) | zoned space MMO | sector/warp zoning (fallback) |
| **Cataclysm: DDA** | deep survival | breadth-of-interaction / crafting web |
| **Ultima Ratio Regum** | procedural civilizations | culture/religion/history generation |

---

## S — defining ideas (the soul of openpiece; steal first)

1. **Multi-scale command loop** — strategy map ↔ tactical battle ↔ *personally fight as one unit*.
   *(Mount & Blade)* — this **is** the "be-the-Yonko" core fun. 🔨
2. **Skill-based defense: parry / block / feint + posture & guard-break** — the moment-to-moment skill ceiling
   that makes combat *the moat* (Vision #1). Posture is a second bar; a **timed parry** cancels an attack, a
   **held block** braces but can **guard-break** (→ stun), and **feints** are mind-games with no rhythm.
   *(Deepwoken, via Sekiro)* — the heart of combat depth. 🌱 (stamina/stun seed) 🔨
3. **Control-as-component / possess any unit (the Moat)** — the player isn't special; control moves onto any actor.
   *(openpiece + Mount & Blade)* — the enabler for everything above; Vision pillar #2. 🌱
4. **A living world that ignores you** — autonomous factions war, towns rise/fall, the world doesn't revolve
   around the player. *(Kenshi)* — the deep-sim *soul*; the target tier. 🌱 (factions) 🔨
5. **Nemesis rivals** — rival crews/captains that *remember you*, hold grudges, get promoted, return scarred.
   *(Shadow of Mordor)* — highest value-per-effort emergent mechanic; sits right on the Moat. 🔨
6. **Real sailing across a seamless island sea** — the sea is *playable space*, not a menu. *(Arcane Odyssey /
   Necesse / Deepwoken)* — the theme's spine and itself a Moat mechanic. 🌱
7. **Recruit a crew & rise from nobody → Yonko** — the Luffy arc as the meta-progression. *(Mount & Blade / Kenshi)* —
   the fantasy the whole game serves. 🌱 (`Npc.recruit`) 🔨

---

## A — major systems (build these; high worth)

8. **Telegraphed / perilous attacks** — a colored glyph + sound cue dictates the *required* counter
   (parry / dodge / duck / jump / block / avoid). *(Deepwoken, via Sekiro)* — makes deep combat **readable and
   teachable** instead of memorization; pairs directly with #2. 🔨
9. **Squad command + autonomous off-screen battles** — order Squad Delta to a tile; it fights there without you.
   *(Mount & Blade / Kenshi)* — the strategic layer. 🌱 (`SquadSystem`) 🔨
10. **Tiered ticks** — world/strategy at 1–10 Hz, action/combat at 60. *(RimWorld / Factorio)* — the key that makes
    real-time deep sim *affordable*. 🔨
11. **Simulation-LOD** — full detail near players, abstract/paused elsewhere. *(Dwarf Fortress / RimWorld)* — the
    other affordability key; doubles as the multiplayer sharding model. 🔨
12. **AI Storyteller / event director** — an authorial system that spawns events paced by world state.
    *(RimWorld)* — the drama pacer. 🌱 (`GameDirector`)
13. **Bounty escalation → threat scaling** — your deeds raise your bounty → stronger hunters → eventually an admiral.
    *(One Piece / reputation systems)* — reputation with teeth. 🌱 (tiers/bounty) 🔨
14. **Anti-infinite-combo (flourish / combo-ender)** — after N hits, an auto-launcher ends the string, so no
    perma-stunlock. *(Deepwoken)* — a combat *design safeguard*. 🌱 (combo seed) 🔨
15. **Living economy + pirateable trade routes** — islands produce/consume, prices move, merchants sail — so piracy
    and blockades *mean* something. *(OSRS / EVE / Kenshi)* 🔨
16. **Faction war (islands change hands without you)** — the relations matrix made dynamic over time. *(Kenshi)*
    🌱 (matrix) 🔨
17. **Territory control that runs economy** — hold tiles; they generate resources you manage. *(Mount & Blade / EVE)* 🔨
18. **Content & AI as data** — Defs/registries; behavior as `aiTypes`, not code. *(RimWorld / moomoo)* — already the
    core philosophy; cows/pigs shipped this way. ✅ 🌱
19. **Non-linear "grind what you enjoy" skills** — many capped skills feeding overall growth. *(OSRS)* — Vision #5. 🌱

---

## B — strong enhancers (worth it, later)

20. **Elemental status effects** — chilled / burning / shocked / winded / dazed / anti-heal → the debuff layer for
    Devil Fruits, Haki, and attacks. *(Deepwoken)* — huge synergy with the four-layer combat. 🔨
21. **Momentum / tempo resource** — hitting or being-hit builds a meter that fuels regen & specials → rewards
    engagement, punishes turtling. *(Deepwoken)* 🔨
22. **Generated world history seeds content** — generate the seas' history → islands/relics/rivalries fall out of it
    instead of hand-authoring. *(Dwarf Fortress / Caves of Qud)* — a content multiplier. 🔨
23. **Server-authoritative thin client** — deep sim on the server, browser renders a slice. *(moomoo.io)* — the
    openpiece.io architecture. 🔨
24. **Stealth assassination / backstab** — crouch to sneak, big damage from behind; positional play. *(Deepwoken)* 🔨
25. **Reactive-object systems** — fire/water/logia/haki/electricity interacting by rule, not special-case. *(Caves
    of Qud)* 🔨
26. **Agent needs / mood / autonomy** — crew & townsfolk with their own drives, living their lives. *(The Sims /
    RimWorld)* — crew depth. 🔨
27. **Devil-fruit world scarcity** — a fruit someone else eats is *gone from the world* until they die (the canon
    rule, simulated). *(One Piece, sim'd)* 🔨
28. **Armor durability + carry weight** — armor breaks → no protection; overweight slows you. *(Deepwoken)* —
    (openpiece already has body `mass`). 🌱 🔨
29. **Naval depth** — ship building, parts, ship-to-ship combat, exploration vs battle modes. *(Arcane Odyssey)* —
    Vision #6 / `NAVAL.md`. 🌱
30. **Stamina discipline (regen-delay)** — stamina *depletes* to act and gates offense; regen pauses after any spend
    so you can't spam. *(Dark Souls / Elden Ring — **not** Deepwoken, which has no stamina bar; its defensive
    resource is Posture, #2, which works inversely — it **builds** toward a guard-break.)* — shipped. ✅
31. **Persistent progression (+ deferred permadeath)** — a long saved journey; permadeath revisited when crew exists.
    *(Deepwoken)* 🌱

---

## C — niche / far-future / fallback

32. **Survival stats (blood / hunger / thirst)** — bleed-out, eating, hydration as a survival layer. *(Deepwoken /
    Cataclysm: DDA)* — a natural fit for the deep-sim later; deferred for now. 🧊
33. **Per-agent micro-sim at DF fidelity** — individual moods/relationships/body-part injuries for *every* unit.
    *(Dwarf Fortress)* — the extreme; **abstract instead** unless it's a chosen deep axis. 🧊
34. **Friendly-fire *reduction*, not immunity** — an "ally check" that softens FF instead of a hard on/off.
    *(Deepwoken)* — a nuance vs openpiece's current binary `canHarm`; interesting for crew/ally play. 🧊
35. **Fluids / temperature / geology physics** — simulated environment systems. *(DF / Qud)* 🧊
36. **Deterministic tick** — reproducible sim (helps replay/anti-cheat/lockstep). *(Factorio)* — nice for MP later. 🧊
37. **Time-dilation at hotspots** — slow the clock when one battle exceeds a node's budget. *(EVE)* — only at
    massive-MP scale. 🧊
38. **Procedural culture / religion / history generation** — deep societal lore-gen. *(Ultima Ratio Regum)* 🧊
39. **Zoned / sector world (warp between)** — *(Starscape)* — **fallback only** if a seamless sea ever gets too
    heavy; note it *breaks* real sailing. 🧊
40. **Full survival / crafting web** — everything craftable/consumable. *(Cataclysm: DDA)* — genre-adjacent, optional. 🧊

---

## Already in the build (from these ideas)
✅ data-driven AI (`aiTypes` → cows/pigs, `ai.critter`) · ✅ stamina/regen-delay + **hitstun-on-hit** · ✅ turn-speed
"lumber" movement (moomoo) · 🌱 the Moat (control-as-component) · 🌱 faction matrix + huntable-neutral wildlife · 🌱
combo counter, `GameDirector`, `SquadSystem`, `Npc.recruit`, power tiers, sailing between islands.

## Meta-principles (the lessons under the ideas)
- **Combat is the moat (Vision #1).** The Deepwoken/Sekiro cluster (#2, #8, #14, #20, #21) is where skill
  expression lives — parry/feint mind-games + readable telegraphs are what separate "deep" from "spammy."
- **Engine ≠ depth** — Qud/RimWorld are Unity; DF/Factorio custom C++. Depth is *your* systems → Phaser is fine.
- **Turn-based vs real-time is the great perf divider** — openpiece is real-time → the **tiered-tick** idea (#10)
  is mandatory, not optional.
- **Don't simulate everything** — Nemesis (one deep axis) beat DF (all axes) on value-per-effort. Pick a few S/A
  ideas deep; abstract the C-tier.
- **Generated history is a content multiplier** (#22) — the scalable answer to "so much content."

*Architecture & performance ideas (data-oriented ECS, Web Workers, WASM, client prediction, culling, the .io stack)
are detailed in `DEEP_SIMULATION.md §7`.*
