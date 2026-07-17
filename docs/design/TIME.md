# Time, Calendar & Day/Night — the substrate design (backlog #18)

> **Stage:** designed — #18 pass, 2026-07-16; evidence: `docs/research/TIME_RESEARCH.md` (salvaged-run
> labels inside). Risk class: ARCHITECTURE-first (a make-once-pay-forever substrate — METHOD §4); the one
> feel knob (day length) is declared as such and playtest-owned.

**Scope.** The clock every dependent pass stands on: #1–2 watches/fatigue, #6 heat-cooling/news-travel/
Buster-Call clocks, #8 pacing, #10 history timeline, #13 MP time, #14 tick-tiers, #15 duty schedules.
Deliberately OUT: seasons/long weather cycles (reserved — the far layer), the schedule ENGINE itself
(designed here as a shape, built in #1's pass), night spawn/price tables (#8/#7 content).
Inherited, not re-litigated: `SEAMLESS_WORLD.md §11.4` — **fidelity changes how often a thing is
evaluated, never what time it is.**

---

## 1. THE VERDICT — where openpiece sits on the time spectrum

```
hard real-time 1:1 ──── always-flowing compressed ──── pausable+speed controls ──── turn/phase time
(Animal Crossing)         (Kenshi, MC/SoT servers)        (RimWorld, Stardew SP)       (roguelikes)
                                   ▲ HERE
```

**Always-flowing, compressed, ONE shared rate — never dilated, never fast-forwarded, paused only as a
single-player presentation affordance.** The evidence is one-directional: every surveyed pausable design
DROPPED its pauses at multiplayer (Stardew MP never auto-pauses; the RimWorld MP mod became one shared
lockstep clock with desync forensics; Minecraft is server-authoritative always-flowing), and EVE — the
only shipped answer to "what happens under load" that survives our endgame — dilates *evaluation*, never
*the clock* [VERIFIED]. Openpiece is a direct-control action game: RimWorld-style ×3/×6 exists to skip
colony dead time we don't have — our dead time (long sails) is #14's evaluate-don't-tick problem, and its
answer is the SKIP (§4), not a speed dial. **Rejected tiers:** real-time 1:1 (kills session structure;
wall-clock coupling violates determinism), speed multipliers (a second clock rate = the Stardew MP
conversion trap + meaningless in MP), Kenshi's load-coupled clock (time slows when the sim is heavy —
the documented anti-pattern [LORE, and our own §11.4 forbids it]), Stardew's non-uniform 1600-minute day
accounting (a shipped complexity trap).

SP pause = the accumulator simply not consuming (menus/dialogue already do this) — sim state untouched,
zero sim vocabulary for "paused." In MP it doesn't exist. This is a PRESENTATION affordance by
construction, which is exactly why it survives the port.

## 2. Core model — four named pieces

### 2.1 The tick IS the clock
One monotonic integer, `world.tick`, incremented once per `stepSim`. Game-time is a PURE FUNCTION of it —
no float accumulator anywhere (a 32-bit float second-counter is worse than a 60 Hz tick within days —
Dawson [SOURCED]; Minecraft and Factorio both derive their calendars from the tick counter [SOURCED]).
Persistence is free: the calendar serializes as one integer in the world snapshot and resumes exactly.
The wall-clock spiral clamp (0.25 s carry-in, shipped) makes the game run SLOW-MOTION vs the wall under
load — that is sim-vs-wall dilation and is fine; sim-INTERNAL time per tick never changes (Factorio's
policy [SOURCED], §11.4's rule).

**Knobs (core/calendar.ts, → data when a second calendar exists):**
- `TICKS_PER_GAME_MIN = 60` — at SIM_DT=1/60: **1 real second = 1 game minute; 1 real minute = 1 game
  hour; one game day = 24 real minutes.** Sea of Thieves' exact ratio [SOURCED] — chosen because it's a
  shipped SEA game's number AND instantly readable ("the shop opens at 9" = a real-clock intuition). The
  survey range is 8–120 real min/day with 48 most common [LORE]; 24 sits deliberately fast-of-center:
  schedules stay witnessable in one session. **THE feel knob — developer-owned; retuning it re-tunes
  nothing else** (everything downstream is authored in game-time units, never ticks — Factorio's
  tick-denominated content re-tuning cost is the trap we're dodging [SOURCED]).

### 2.2 Day phases as data (asymmetric by design)
`phaseAt(tick) → dawn | day | dusk | night`, from a phase table (game-hours, data):
dawn 05–07 · day 07–19 · dusk 19–21 · night 21–05 → night = 8 game hours = 8 real minutes, one third of
the cycle. Asymmetry is near-universal in shipped games (Minecraft ~42% night, Factorio 10%, Rust 25%
[SOURCED/LORE]) because night is a WINDOW you play around, not half your session. Transitions (dawn/dusk)
are real phases, not fades — they're the ambush hours (#6's heat sensors will care).

### 2.3 Night acts through the SIM, never the screen
The DayZ gamma war [VERIFIED: six years open, empty night servers] fixes the rule: darkness must live in
what is SIMULATED. Ours: night multiplies AI perception — `AIProfileDef.nightSight` (default **0.55** on
BASE, ×sight and ×nearSight; nocturnal profiles set 1.0; a future Observation-haki reader ignores it).
The presentation dim (a tint the renderer derives from `phaseAt`) is cosmetic and CAN be gamma-cheated —
harmlessly, because seeing the pixels doesn't change what any AI perceives or any table rolls. Player
vision is not artificially gated (top-down 2D; we're not Thief) — night's teeth are that THEY see less,
which is a stealth window, plus what schedules/spawns do with the clock.

### 2.4 The calendar (minimal now, reserved shape)
`dayOf(tick)` = day counter from tick 0 (the voyage's day 1 — flavor: "Day 37 of the voyage"). No months,
no years until content needs them; seasons are a RESERVED phase-table swap (a second table selected by
`seasonOf(day)` — the mechanism exists the day it's wanted, deep-sim era). RimWorld's lesson holds: the
calendar's granularity serves schedule readability, and it was re-tuned twice post-ship [SOURCED] —
keeping v1 minimal is what keeps that re-tune cheap.

## 3. The schedule SHAPE (designed here, built in #1)
Reserved so the crew pass doesn't invent its own clock semantics — adopt the two verified shapes:
- **Bethesda's stack** [VERIFIED]: a schedule = priority-ordered entries, TOP-DOWN FIRST-MATCH on
  (phase/hour window + conditions); re-evaluated periodically + staggered (never per-tick); interrupts
  (combat) suspend evaluation and **resume is implicit** — the next periodic re-eval just picks the right
  entry again (Bethesda's cadence: ~10 s periodic + event-forced — the starting number for #1's engine).
  No resume bookkeeping, quests/duties push entries on top of the same stack (#15).
- **Majora's window-return** [VERIFIED]: a matched entry yields (behavior, windowStart, windowEnd) — so a
  DISTANT NPC's position is derivable from how far into the window the clock sits. That is #14's
  evaluate-don't-tick applied to people: schedules make NPCs closed-form. This is the load-bearing reason
  the schedule shape is fixed HERE: it must be evaluable, not only tickable.
Stardew's arrive-by deadlines and world-state-conditioned shop hours [SOURCED] are B-tier garnish for the
crew/economy passes; its silent-failure modes (the 600-o'clock bug, fallback-chain fragility) are the
trap list for whoever builds the engine.

## 4. The SKIP (sleep/wait) — deferred, but its shape is a verdict
Always-flowing means nobody waits out the night by staring. When fatigue/watches (#1) create the need:
**a skip is self-dehydration** — the clock advances N ticks and the world catches up by EVALUATION (the
same closed-form math #14 runs on distant chunks), then the local scene re-hydrates. Never "fast ticks"
(Minecraft's skip doesn't simulate and ships inconsistencies [SOURCED] — evaluation is our answer), never
a speed dial. MP: all-crew consent, Minecraft/Stardew precedent. **Build-after trigger: #1's fatigue, or
the first content that makes a player want to wait.**

## 5. Emergent behaviors — deliberately NO dedicated code
- Night raids: reduced `nightSight` = an approach window — stealth gameplay with zero stealth system.
- Dawn/dusk as tactical hours (half-light, schedules in transit — docks busy, patrols changing).
- "The shop's shut, we sail at dawn" — hard clock windows generate plans, not menus.
- Heat cools "overnight where you're not seen" (#6 reads days), news takes N days to sail (#6), patrol
  gaps at watch changes (#15) — all just READ the one clock.
- A dehydrated port town still "runs": its NPCs' positions are schedule evaluations, so arriving at 03:00
  finds it genuinely asleep — witnessed, never scripted.

## 6. Skill/progression mapping
None at v1 by design (a substrate, not a moat). The knowledge-economy hook exists: SCHEDULE KNOWLEDGE is
learnable content (#9 — knowing the garrison's watch change is a chart-grade secret), and Observation
haki reading through darkness is #4's counter to the night window (counterplay, moat test #3).

## 7. Architecture mapping
- `World.tick` (int, incremented in stepSim; joins `nextId` in the snapshot — one field, exact resume).
- `core/calendar.ts` — pure functions (`gameMinOf/hourOf/dayOf/phaseAt`) + the phase table + knobs. Sim
  dir, engine-free, trivially unit-tested. Goes external (data/) when a second calendar/season table exists.
- `AIProfileDef.nightSight` (data, default on BASE) — perception.ts multiplies it in when `phaseAt(tick)`
  = night (dusk/dawn: lerp between 1 and nightSight across the transition window — exp-form not needed,
  it's a table read).
- Presentation: a phase tint in the render layer (reads `phaseAt`, owns nothing).
- Determinism/MP: time is pure sim state derived from tick; the replay/snapshot invariants cover it the
  moment `tick` enters the snapshot; MP shares it like any state. No new wall-clock reads anywhere.

## 8. The AI-can-play-it check
Yes at every band: schedules ARE the AI's data (they exist for NPCs before the player ever reads a
clock); `nightSight` degrades every profile identically (the Moat — the player's crew keeps watch under
the same darkness); INT ladders on top (low INT ignores the clock, high INT prefers night approaches and
times raids to watch changes — a director/brain READ, no new mechanism).

## 9. Build order (triggers, not dates)
1. **Slice 1 (buildable now, one sitting):** `World.tick` + snapshot field · `core/calendar.ts` + tests ·
   `nightSight` wired into perception · the presentation tint · debug clock readout. Smallest end-to-end:
   *night falls, bandits stop spotting you as far, the screen dims, the clock shows 22:40, save/load
   resumes at 22:40.*
2. Schedule engine — with #1 (crew), consuming §3's shape.
3. The skip — trigger in §4.
4. Nocturnal spawn/price/crime tables — with #8/#7 content passes.
5. Seasons/second phase tables — deep-sim era (reserved, zero code today).

## Hard questions → answers (the DONE contract)
1. **Ratio?** 24 real min/day (1 s = 1 min), a declared feel knob, everything authored in game-time so
   retuning is free. **Pause/dilate/fast-forward?** Never in the sim; SP pause is presentation; the MP
   conflict dissolves because nothing about time is client-side.
2. **What changes at night?** AI perception (data), schedules (windows), later spawn/price tables —
   all sim-side; the dim is cosmetic by design (gamma-cheat-proof BY indifference).
3. **Sleep/skip?** Always-flowing baseline; the skip is evaluation-not-ticking when #1 needs it.
4. **Persistence/resume?** The calendar is one integer in the snapshot.
5. **Determinism?** Pure function of tick; no NEW wall-clock reads (the master-seed mint stays the ONE
   legal read); replay test inherits coverage.

## Leans (backlog #18) — confirmed / overridden
- ONE sim clock w/ declared mapping — **confirmed** (24 min/day chosen; knob).
- Day/night AI-readable as data (schedules, night vision, nocturnal fauna) — **confirmed**, with the
  DayZ-derived rule added: night's teeth are sim-side only.
- Time-tier aware / coarse advance in distant chunks — **confirmed and sharpened**: distant time doesn't
  advance "coarsely," it advances IDENTICALLY and is EVALUATED coarsely (§11.4 phrasing — the lean's
  wording was the one #14 killed).
- Seasons reserved — **confirmed** (a phase-table swap, zero code now).

## Rejected alternatives (canon, §10)
Speed multipliers (RimWorld ×3/×6) · real-time 1:1 binding · per-player/instanced clocks · float time
accumulators · load-coupled clock (Kenshi) · non-uniform day accounting (Stardew's 1600-min day) ·
screen-filter darkness (DayZ) · fast-tick sleep skips (Minecraft's unsimulated skip) — each with reasons
in `docs/research/TIME_RESEARCH.md`'s tier table and §1/§4 above.
