# Sailing — the movement & impact model (Design)

> The MOVEMENT half of the naval vision — how a ship sails, turns, stops, and crashes. The combat/ownership
> half (classes, parts, cannons, modes, theft) is `NAVAL.md`; the walkable deck is
> `features/big-walkable-ship.md`. STATUS: design ahead of code, on purpose. What's implemented today is the
> arcade placeholder (ShipSystem: throttle + drag + flow-gated rudder); judged and sequenced 2026-07 after
> the walkable-ship pillar, at the developer's call that sailing is one of THE MOATS of this game.

## Verdict: which simulation tier

Sailing sits on an arcade↔simulation spectrum:

- **Arcade (current)** — WASD car with water drag. No wind, no decisions; every heading is equally good, so
  sailing is joystick input, not gameplay. Cheap feel, zero moat.
- **Full sim (Naval Action)** — sail-by-sail management, crew stations, tacking failure micro. Fights the
  top-down action-RPG genre; wrong tier.
- **TARGET: the Pirates! / Sea-of-Thieves middle** — wind + points of sail + sail states + momentum + a real
  anchor. Decisions every minute, zero rope micromanagement. Wind turns POSITION into a resource (the
  weather gauge: the upwind ship chooses when to engage), chases become angle-play instead of stat checks,
  and rig differences make ship classes MECHANICALLY distinct instead of stat reskins.

Two specific reasons the current feel reads cheap (developer report):
1. **Velocity instantly equals heading** — turn the wheel and the whole momentum vector snaps to the new
   direction. A go-kart on rails, not 200 tons of oak.
2. **No wind** — nothing to read, nothing to plan, no reason position matters.

## Core model (five pieces; every knob on `ShipHullDef` — content is data)

1. **WIND** — a world-frame vector (direction + strength) drifting on a seeded Rng stream (deterministic,
   replicable, multiplayer-safe). Environment state hangs off the FRAME (a lower-deck frame has no wind).
   Storms later spike it via the event director (`EVENTS.md`).
2. **POINTS OF SAIL** — `sailCurve` on the hull def: a speed multiplier by angle-off-wind, with a NO-GO zone
   dead upwind (sails luff, thrust ≈ 0). This single data field IS "different ships, different mechanics":
   - square rig (Galleon): wide no-go (~70°/side), monstrous on a broad reach;
   - fore-and-aft (Sloop): narrow no-go, points close to the wind, nimble;
   - **oars (Rowboat)**: a FLAT curve — wind-independent, slow, can turn standing (`minTurnFrac > 0` finally
     earns its keep). The starter boat stays tutorial-friendly as DATA, not as a special case.
3. **SAIL STATES** — furled / half (battle sails) / full, stepped by W/S (replaces throttle-as-gas-pedal).
   Speed = sail amount × curve(angle to wind) × maxSpeed; accel stays slow (sails catching wind).
4. **MOMENTUM WITH DRIFT** — the ship keeps a velocity VECTOR; steering turns the HEADING, and velocity
   eases toward it at a per-hull rate (`driftEase`). Ships carve arcs, get caught sideways mid-turn, and
   coast believably. The single biggest feel upgrade; also the prerequisite for real impact physics below.
5. **A REAL ANCHOR** — states, not a decorative flag (today `Ship.anchored` is read by NOTHING in the sim;
   only the renderer draws a chain dot): dropped / weighing / up. Drop = hard deceleration over ~1s — and
   dropped AT SPEED pivots the ship around it (the handbrake anchor-turn, a deliberately pirate move).
   Weighing takes a beat (instant-ish solo now; a crew capstan job when the naval-sim pillar lands).
   NAVAL.md's theft rule ("unanchored ships can be stolen") makes the state strategic, not just physical.

KEPT from the current implementation (already right): **steerage** — rudder authority scales with water flow
(`minTurnFrac + flow`), and hard turns bleed speed (`turnBrake`). These survive the rework unchanged.

## Emergent maneuvers — deliberately NO dedicated code

All of these are CONSEQUENCES of the five pieces, never features:
- **Tacking**: zigzag upwind by swinging the bow through the no-go zone — costs speed by the curve.
- **In irons**: enter the no-go too slow → stranded luffing until you fall off. The stall IS the failure
  state; no scripted "tack failed" logic.
- **Jibing (wearing)**: cross the wind stern-first — safe, no stall risk, gives up ground downwind.
- **Weather gauge**: the upwind ship dictates engagement — pure positioning strategy from the wind vector.
- **Anchor turn**: drop at speed to whip the stern around — from the anchor model.
The preparation loop (weigh anchor → set sails → gain steerage) also falls out of states 3+5, and each step
becomes a CREW JOB later without redesign (DEEP_SIMULATION).

## Impacts (judged 2026-07; build AFTER momentum — ram physics need a real velocity vector)

- **GROUNDING / CRASHING into terrain**: today running aground silently zeroes speed. Target: speed-scaled —
  below a threshold, a free bump (QoL: nudging the dock never chips HP); above it, hull damage scaled by a
  terrain HARDNESS knob (sand soft, rock/dock hard — a TerrainDef field, content). The soft case hides a
  feature: **deliberate beaching** — run up on sand for a fast raid entry, stuck until you back off
  (careening flavor). Impact FX + crew stagger via the external-force channel.
- **RAMMING**: ships currently GHOST through each other (body collision is foot-only; hulls only block
  walkers) — ship-vs-ship collision must exist first. Phase 1: **circle-vs-circle** (ship.r) impact
  detection; damage = RELATIVE MOMENTUM, split by mass ratio (galleon crushes sloop; the rammer takes a
  fraction; NAVAL.md's ram part shifts the split — content, not code). Impulse shoves both hulls; both crews
  stagger. WARNING (recorded): grid-accurate hull-vs-hull contact is a rabbit hole — only pursue it if
  boarding-by-contact ever demands it.
- **PROJECTILE HITS on hull/parts**: a cannonball flies in the WORLD frame; on a hull hit, `worldToDeck`
  names the CELL it struck — and with the structure layer, the mast/helm/cannon standing there is an ENTITY
  with HP (NAVAL.md hit-spots, made spatial): mast → slowed, helm → can't steer, waterline → flooding
  (bail/patch = crew jobs). Crew on deck are hit by ordinary actor collision already — parenting keeps them
  in world coords. Needs: the structure layer (terrain pillar slice 3) + a projectile system.

## Sinking — a PIPELINE, not an HP bar hitting zero

Below-waterline damage (cannonball, ram, hard grounding) opens a BREACH → water level rises as a ship
attribute → handling degrades as it fills → past a threshold the ship FOUNDERS over several seconds. The
counterplay IS the crew: bail water + patch the breach (shipwright jobs) — a losing fight survivable by
damage control. One damage model, THREE victory intents: DISABLE (mast/helm — capture the prize), SINK
(send it down), or BOARD. On foundering: every actor aboard gets a FORCED frame exit at its standing
position (the transitions-preserve-position rule provides the drama free — the crew is suddenly swimming
where the deck was); the ship leaves salvageable flotsam. Visuals ride the existing submerge fakes
(shrink + fade) — no z-axis. Player-ship loss harshness = a knob (NAVAL.md's ship-in-a-bottle re-acquires).

## The helmsman's skill (navigation)

ONE rule first: skill effects key off WHOEVER mans the helm — player or NPC read the same `navigation`
attribute (the Moat; NAVAL.md's "Sailing talent" and the navigator crew role are the same number). The
navigator ROLE = the character whose job is to hold that number high. ONE ROLE, by design (judged 2026-07):
"helmsman" is just whoever's hands are on the wheel — the axes bind to WHERE they apply, not to labels:
INFORMATION comes from the best navigation skill ABOARD (the navigator warns from the map table);
EFFICIENCY + AUTONOMY apply only to the actual helmsman. One Nami covers a small crew; if a battleship
bridge ever wants both posts, that's two job rows in data, not architecture. Three axes, deliberately
ordered information > efficiency > raw stats (the knowledge-economy philosophy, ai/AI_INTELLIGENCE.md):

1. **INFORMATION** — hazards (whirlpools, reefs, storms) revealed earlier/farther with skill; and the
   **WIND FORECAST**: wind drifts on a SEEDED stream, so a skilled navigator literally reads the future the
   sim already knows ("the wind veers east by evening") — uniquely cheap for us, very One Piece.
2. **EFFICIENCY** — the RIG defines the physics; the SAILOR defines how close to ideal they get. Skill
   closes the gap to the hull's true `sailCurve` (a green hand gets a sloppy curve: narrower good angles,
   wider effective no-go; a master gets everything the ship can give). Mechanical and felt — NOT "+5% speed".
3. **AUTONOMY** — what the navigator does when YOU aren't steering (the most valuable axis on an open sea):
   low = holds a heading, blunders into the storm; mid = follows your plotted route, avoids known hazards;
   high = tacks optimally and REROUTES around forecasted weather alone. Skill = time handed back to the
   player — you fight on deck while the navigator sails. Needs crew AI + boat pathfinding (the portal-graph
   pillar); the attribute + curve hooks cost nothing to design in from day one.

### The skill ladder (5 bands over levels 1–10)

The RULE: each band unlocks a CAPABILITY you couldn't perform at all before; levels within a band grow the
numbers. Capabilities are memorable ("at Advanced she reroutes"); percentages are mush. Legend NEVER exceeds
100% trim — the rig defines the physics; legend-tier is superhuman knowledge, not broken sails.

| Band | Efficiency (trim) | Information | Autonomy |
|---|---|---|---|
| Beginner 1–2 | ~65% of the hull curve, widened no-go — tacking usually strands in irons | — | holds a heading; blunders into hazards |
| Intermediate 3–4 | ~80% | nearby hazard pings | follows a plotted route; STOPS at hazards |
| Advanced 5–6 | ~90%; anchor-turn reliable | hazard range ×2 + current wind drift trend | REROUTES around detected hazards |
| Expert 7–8 | 100% — the hull's true curve | the FORECAST (seeded read, hours ahead) | optimal tacking legs; jibe-vs-tack judgment; departs on the forecast |
| Legend 9–10 | instant in-irons recovery | whole-map weather sense; freak events (rogue waves, sea kings) early | BATTLE-SAILING: holds the weather gauge + presents your broadside while you fight |

Felt progression: the sea fights you → manageable → the ship answers → voyages sail themselves → the sea is
transparent. All thresholds/curve factors are DATA (attribute bands on a def), never engine branches.

## Architecture mapping

- `WindSystem` (sim, seeded stream) owns the wind; ShipSystem consumes it — pure reads, no new engine.
- All behavior knobs on `ShipHullDef` (`sailCurve`, `driftEase`, mass, hardness thresholds) — a new rig is a
  def row. Curves as small lookup tables (angle buckets), not formulas, so content can shape them freely.
- Everything sim-pure + fixed-timestep + seeded → headless server/replay safe (the multiplayer keystone).
- Deck actors need NO code for any of this: parenting carries them through every turn, ram, and grounding
  (the frames payoff); only the stagger effect touches them, via the shared external-force channel.

## Can enemy AI sail this? (feasibility, judged 2026-07)

YES — and it's EASIER than the melee AI already shipped. The depth is human-side (reading, planning); to an
AI the sim is deterministic and fully queryable, so the "deep" parts are arithmetic:
- **Optimal steering = a formula**: scan headings, score by `sailCurve(angle-to-wind) × progress-to-target`
  (velocity made good), pick the best — a dozen multiply-adds per decision tick (~1/s), not per frame.
- **Emergent maneuvers need POLICIES, not scripts**: tack = "best heading is in the no-go → alternate
  best-upwind legs, switch on drift threshold" (~20 lines); jibe-vs-tack = compare computed speed loss;
  weather gauge = maximize one upwind dot product. Classic utility rules — the Brain roadmap's direction.
- **The skill ladder IS the AI difficulty dial** (navigation keys off whoever mans the helm): EXPERT AI is
  the easy case (undegraded math). The real design work is making LOW skill convincingly bad — heading
  noise, delayed reactions, tacking forbidden (wears around instead), no forecast — DEGRADING competence,
  which plugs straight into the INT-ladder/knowledge economy (low crews don't KNOW things).
- **Timescale favors the AI**: sailing decides over seconds-to-minutes with smooth dynamics vs melee's
  adversarial tenths-of-seconds. Precedent: Pirates! (1987) AI sailed a wind model.
- **Combat maneuvering too** (broadsides on target, accurately timed): guns fire abeam, so "get the
  broadside on" is ONE more term in the same heading scan — `sailCurve(wind) × broadside-alignment ×
  range-band(loadout: mortar holds distance, burst closes)`; circling/strafing/gauge-keeping EMERGE from it,
  never scripted. Fire timing = deflection shooting (aim at target pos + velocity × shell flight time — the
  deterministic sim hands the AI exact velocity, so a PERFECT solution is the cheap default and skill
  DEGRADES it: noisy estimates, slow solutions, wide gates). Fair by construction: shells are slow visible
  arcs — even perfect solutions are dodgeable. The design nugget: POSITIONING (navigator) and GUNNERY
  (gunner) are separate crew skills — an enemy ship's fight quality IS its crew composition, not a
  monolithic "AI level" (knowledge economy; strongest genre precedent — Pirates!, Black Flag, Naval Action).
- Honest caveats: INTERCEPTING a wind-literate player needs an iterative intercept estimate (slightly more
  math, still cheap); coordinated FLEETS are genuinely harder — deferred with squads-at-sea.

## Build order (triggers, not dates)

1. **After the terrain pillar**: wind + sailCurve + sail states + momentum/drift + real anchor — the moat
   slice; fun solo, needs no pathfinding, no crew, no structures.
2. **Impacts**: grounding/beaching + ship-ship circle collision + ram momentum damage (needs #1's vectors).
3. **Cannons + part HP**: projectile system + deck structures with HP (needs slice-3 structures; unlocks
   disable-vs-sink and capture gameplay).
4. **Crewed sailing**: preparation steps become jobs (capstan, sails, lookout) — the naval-sim pillar
   (DEEP_SIMULATION); nothing above needs redesign for it.
