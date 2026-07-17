# Time / Calendar / Day-Night — research evidence (backlog #18)

> Evidence file for the `TIME.md` design pass (2026-07-16), per `DESIGN_PASS_RESEARCH.md`. **Salvaged run
> caveat:** the `/deep-research` pipeline was stopped mid-verification on the developer's budget call
> (the salvage protocol, §2 of the method doc — same as the sailing pass). 30 sources fetched across all
> five angles; 27 of the planned verification votes completed. Labels are downgraded honestly:
> **[VERIFIED]** = claim survived its full adversarial gauntlet (all completed votes: 27/27 survived,
> zero refuted) · **[SOURCED]** = primary/secondary source fetched and quoted, votes cut by the stop ·
> **[LORE]** = forum/secondhand only — use for intuition, never for a decision. Some wiki-claim URLs were
> lost in the salvage (the fetcher schema dropped them); domains are named instead.

## 1. Real-to-game time ratios (angle 1)

| Game | Real min / game day | Ratio | Label |
|---|---|---|---|
| Stardew Valley | 14 (20h playable day; 0.7 s/game-min) | ~86:1 | [SOURCED] stardewvalleywiki |
| RimWorld | 16m40s (60 tps × 2,500 ticks/h × 24h = 60,000 ticks) | 86.4:1 | [SOURCED] rimworldwiki |
| Minecraft | 20 (24,000 ticks @ 20 tps) | 72:1 | [SOURCED] minecraft.wiki |
| Sea of Thieves | 24 — **1 real min = 1 game hour** | 60:1 | [SOURCED] SoT wiki |
| Zelda BOTW | 24 (12 day / 12 night) | 60:1 | [LORE] forum survey |
| Kenshi | ~48 ideal (2 real s/game-min; **degrades under load**) | ~30:1 | [LORE] community-mod figure |
| Open-world survey (24 games) | span 8–120; **48 most common** (RDR2, GTA V, Witcher-adjacent cluster) | — | [LORE] forum survey |
| Factorio (Nauvis) | 7 (25,200 ticks) | ~206:1 | [SOURCED] factorio wiki |

- Stardew's internal day-math is deliberately NON-uniform (20h day = 1200 min; the skipped 2am–6am counts
  100 min/h → a 24h period = 1600 min, not 1440). Shipped proof that clock-face time and elapsed-time
  accounting can diverge — and a complexity trap we reject. [SOURCED]
- RimWorld rebalanced day-length twice while keeping the YEAR's real duration constant (0.10.785, 0.13.1135
  — "years are exactly as long as before in actual play time"): day granularity is tuned for **schedule
  readability**, independent of total pacing. [SOURCED]

## 2. Speed controls, pause, and multiplayer (angle 2)

- **EVE TiDi [VERIFIED — CCP dev blog 2012-02-10, eveonline.com/news/view/time-dilation-hows-that-going +
  wiki.eveuniversity.org/Time_dilation]:** dilation slows in-space SIMULATION to a floor of 10%, per server
  node — but **EVE Server Time never dilates**; skill training, industry, and structure timers run on
  undilated time. CCP measured 12.87 hours of simulation "dilated out of existence" (~45 min/day cluster-
  wide). Pre-TiDi failure mode: commands silently dropped under load; at the 10% floor + 100% CPU
  (HED-GP, 2014) command-processing failures RETURNED — dilation postpones, never solves, overload.
- **RimWorld speed = tick-rate multipliers ×0/×1/×3/×6 (+dev ×15)** — not the folk "2x/3x/4x". Multipliers
  are best-effort: under load the game runs fewer ticks and **game time slows vs wall-clock** (tick-count
  clock). Rare tick = every 250 ticks, long tick = every 2,000 — evaluation frequency varies, the time
  value doesn't. [SOURCED] rimworldwiki
- **Pause did not survive multiplayer, twice:** Stardew SP pauses in menus/cutscenes; **in MP the clock
  never auto-pauses** and day-advance needs ALL players sleeping. Minecraft MP time is server-authoritative,
  always-flowing; night-skip needs every player in bed — and the skip does NOT simulate skipped time
  (crops don't grow — a documented inconsistency). [SOURCED]
- **RimWorld Multiplayer mod [SOURCED — zetrith/Multiplayer wiki]:** the port of the pausable SP game became
  ONE shared lockstep world with a single clock; **saves are literally replays** (command-stream), and
  desync files are a first-class artifact — determinism breaks were common enough to need built-in
  forensics.
- **Factorio:** `game.speed` changes how fast ticks execute, never how much game-time a tick is worth; all
  content is authored in per-tick units (belt = 1/32 tile/tick), so changing the tick RATE would re-tune
  the whole game — the cost of tick-denominated time. [SOURCED] forum+wiki
- **Lockstep correctness [SOURCED — gafferongames fixed-timestep + deterministic-lockstep articles]:**
  bit-exact determinism requires a fully fixed timestep (even clamped-variable dt is not bit-exact); only
  inputs cross the network, so ALL state incl. elapsed time must reconstruct from seed + input stream. The
  spiral-of-death clamp (consume ≤0.25s) makes SIM-vs-WALL-CLOCK slow-motion an accepted, distinct thing
  from dilating sim-internal time.

## 3. Day/night as a mechanic (angle 3)

- **Asymmetry is near-universal:** Minecraft 10 min day / 8m20s night / 50s transitions; Factorio full
  night = only 10% of the cycle (42s of 7 min); Rust 45/15 [LORE]. Even splits are rare (BOTW). [SOURCED]
- **Minecraft gates spawns on LIGHT, not time** (sky light ≤7 → spawn roll) — day/night acts through a
  world property, which is why torches/roofs counter it. Hostile spawn attempts evaluate EVERY tick;
  passive only every 400 ticks — per-class evaluation cadence on one clock. Mob caps (70 global Java,
  scaled by chunks) + 128-block player locality keep night-spawning observer-local. [SOURCED]
- **Terraria's night numbers:** surface spawn rate 1/600/tick (day) → **1/360 (night)** with max-spawns
  5 → 6; the same ~1.67× night multiplier pattern rescaled in hardmode. [SOURCED] terraria wiki
- **Skyrim detection [SOURCED — UESP]:** one scalar Detection Value; sound side fully quantified (base
  weight 12, armor ×0.5, running ×2, **lost line-of-sight ×0.3**, max distance 2500 units, squared
  falloff); light level is a factor but UESP gives it NO number. Detection is an ACCUMULATOR with memory
  (alerted NPCs stay easier to re-spot). Failure story: the bucket-over-the-head LOS exploit.
- **The gamma war [VERIFIED — Bohemia tracker T87202, opened 2013-12-17, closed 2020-01-28]:** DayZ's
  night was defeated by brightness sliders (night → "black and white daytime", no flashlight needed),
  creating a COERCIVE arms race (default-settings players at a disadvantage) and *empty night servers*.
  The ticket stayed open six years. Correctness condition: **darkness must be enforced in what is
  simulated/rendered, never as a screen filter** (Arma 3's adaptive approach cited as the fix; DayZ later
  added anti-gamma film grain).

## 4. NPC schedule data shapes (angle 4)

- **Majora's Mask [VERIFIED — zeldaret/mm decompilation, include/z64schedule.h + src/code/z_schedule.c]:**
  schedules are per-actor BYTECODE (19 command IDs): time checks stored as `u8 startHr,startMin,endHr,
  endMin`, day-of-cycle and week-event checks as data branches, interpreted by ONE generic engine. The
  script can return a time WINDOW (`ScheduleOutput{result, time0, time1}`) so the engine derives WHERE the
  NPC is from how far into the window the clock sits — **NPC position as a pure function of (schedule,
  clock)**. Escape-hatch wart: exactly 3 hardcoded misc checks leaked into the closed command set.
- **Bethesda packages [VERIFIED — ck.uesp.net via MediaWiki API]:** an actor's schedule = a priority-
  ordered package stack, evaluated TOP-DOWN FIRST-MATCH (no scoring); selection re-runs periodically
  (~10s + script-forced), not event-driven — so **resume after interruption is IMPLICIT** (re-evaluation
  just picks the right package again). Quests push packages onto the top of the same stack (no second
  system). Interruption is the default; `Must Complete` suppresses it; `Once Per Day` = a rolling
  24-game-hour window. Pitfall: combat-override packages that fully preempt combat AI.
- **Stardew [SOURCED — stardewvalleywiki modding docs]:** one flat text DSL per NPC — timed waypoints
  (`time location x y facing anim dialogue` slash-separated), key selection by a FIXED priority chain
  (festival > rain > season+day > … > mandatory `spring` fallback — removing it breaks the game). The `a`
  prefix = arrive-BY deadline (departure back-computed). Documented fragilities: 600-o'clock points
  silently fail (use 610), GOTO to a missing key crashes asymmetrically.
- **Shop hours as content [SOURCED]:** Stardew shops = clock windows + weekly days-off + counter-presence
  (open building ≠ shoppable — the "Marnie is never at her counter" complaint, patched via an item
  bypass) + calendar-event overrides (festivals lock everything) + world-state conditions (JojaMart closes
  permanently on Community Center completion).

## 5. Clock determinism + persistence (angle 5)

- **The clock should be an integer tick count, never a float accumulator [SOURCED — randomascii (Bruce
  Dawson), "Don't store that in a float"]:** a 32-bit float second-counter degrades to 7.8 ms precision
  after ONE DAY (worse than a 60 Hz tick within days); consecutive-timestamp subtraction quantizes
  catastrophically. Fix: integer ticks (or a double seeded at 2^32). A recurring SHIPPED bug class, not
  theory.
- **Minecraft and Factorio both derive the calendar purely from the tick counter** (24,000 / 25,200 ticks
  per day); Factorio's brightness is a linear function of the tick clock and automation (lamps) reacts to
  it mechanically. [SOURCED]
- Persistence follows for free: a tick-derived calendar serializes as ONE integer and resumes exactly;
  no rollover math exists to get wrong. (No shipped counter-example surfaced before the stop.)

## Tier table (findings → openpiece verdicts, adoption-tiers pattern)

| Verdict | Finding | Why |
|---|---|---|
| **S** | Clock = integer tick counter; calendar = pure function of it (Minecraft/Factorio/Dawson) | already our substrate (SIM_DT accumulator); serializes as one int |
| **S** | Never-dilating world time; fidelity ≠ time (EVE) | already canon via #14 §11.4 — this run re-verified the primary source |
| **S** | Asymmetric day/night windows as data (Minecraft/Factorio/Rust) | matches knobs-on-defs; night short enough to be a window, not a chore |
| **A** | Night acts through SIM properties (perception/spawn gates), never a screen filter (DayZ gamma war) | our top-down sim: night = AI sight data change; gamma gains nothing — adopt at the day/night slice |
| **A** | Priority-stack first-match schedules with implicit resume via periodic re-eval (Bethesda) | adopt at #1 (crew): simplest interruption model that ships; no resume bookkeeping |
| **A** | Schedule windows returning (behavior, window) so position derives from clock (Majora's Mask) | THE dehydration trick for NPCs — feeds #14's evaluate-don't-tick directly |
| **B** | Stardew arrive-by deadlines + shop-hour conditioning | right ideas, adopt piecemeal as content needs them |
| **C** | Per-class evaluation cadences for spawn systems (Minecraft 1-tick vs 400-tick) | when spawn tables exist |
| **D** | RimWorld-style speed multipliers | direct-control action game + MP endgame; dead time is solved by skip-as-evaluation, not fast-forward (see TIME.md rejection) |
| **D** | Float time accumulators | Dawson's numbers; integer ticks only |
| **D** | Kenshi's load-coupled clock (time slows when the sim is heavy) | violates determinism + the never-dilating rule; Kenshi stays a FEEL reference only |
| **D** | Stardew's non-uniform day accounting (1600-min days) | a complexity trap; our clock stays uniform |
| **D** | Screen-filter darkness | the six-year gamma war |

## Ideas rejected in-run (kept per §10: rejected alternatives are canon)

- **Real-time 1:1 binding (Animal Crossing)** — kills session structure for an action-sim; nothing in our
  pillars wants wall-clock coupling (and determinism forbids it outside the master-seed mint).
- **Per-player time / instanced clocks** — every MP precedent surveyed (Minecraft, Stardew MP, RimWorld MP
  mod, EVE) converges on ONE shared authoritative clock; per-player time reintroduces the conversion
  problem Stardew solved by deleting pauses.
