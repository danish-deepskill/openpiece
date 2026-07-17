# Openpiece Sailing — Built Mechanics Reference

> **Stage:** shipped — slice 1 + audits, as-built 2026-07-17; the shareable reference for the design-planning team.

> This documents what is BUILT and tunable today, with each design verdict and its why.
> The forward vision (crew, cannons, CE/CLR-lite) lives in `SAILING.md`; this file is the as-built truth.

## 1 · Philosophy

- **Sailing is seamanship, not driving.** Every "car-ism" was removed deliberately: no throttle (you SET
  canvas), no instant steering (the wheel winds, the hull answers late), no free turns (the water grants
  rudder authority), no parking button (the anchor is a state machine with a ritual).
- **Content is data.** Hull performance, deck shape, mast positions, doors, sail curves — all rows and
  grids a designer edits. No behavior is hard-coded to a ship name.
- **One wind truth.** The wind is a pure function of (seed, position, time) — replayable, forecastable,
  multiplayer-safe. Everything downstream (thrust, visuals, streaks, drift) reads the same function.
- **Read the world, not the HUD.** Player-facing wind is never a number: canvas shape, luffing, streaks
  on the water, and (later) a navigator's spoken bands carry the information. Numbers live in debug only.

## 2 · The Wind

| Fact | Value |
|---|---|
| Model | evaluated field `windAt(x, y, t)` — no stepped state; forecast = evaluate future t |
| Direction | slow wander (~1 min mood) + small flutter; visits the whole compass |
| Strength | multiplier of a reference breeze (6.5 tiles/s). **100% = reference, NOT a cap** |
| Everyday band | ~60–100%, with ±7% gusts on a 6–12 s cycle (source-calibrated) |
| Calm Belt | strength 0 — legal value; sails dead, oars country |
| Storm | strength >100% — legal value; thrust still caps at hull rating (storm danger will be damage) |
| Debug | manual override panel: direction 0–355°, strength 0–200% |

## 3 · The Fleet

| | Rowboat | Sloop | Caravel |
|---|---|---|---|
| Rig | oars (wind-immune) | fore-and-aft | square (two masts) |
| Top speed | 3.75 t/s | 5.0 t/s | 4.1 t/s |
| Best point of sail | any (flat curve) | beam reach (90°) | broad reach (~120°) |
| No-go zone | none | narrow (~±25°) | wide (~±50°) |
| Turning circle | ~1 own length (spins) | ~1.9 lengths | ~2.1 lengths (sweeps) |
| Full hoist | 0.6 s | 1.6 s | 3.2 s |
| Reverse | backs at 25% (oars) | none — bare steerage escape | none |
| Boarding doors | 1 | 2 (either broadside) | 1 |
| Role | tutorial / calm belts | daily driver, solos well | flagship; wants a crew |

Ships are walkable tile grids: deck, rails, helm, cannons, gangplank doors, and **masts are deck tiles**
('M') — mast count/placement is deck data, one sail hangs per mast, and the future ship-builder just
places 'M' parts. Walking speed for context: 2.0 t/s — the fleet is 1.9–2.5× foot.

## 4 · Points of Sail (the polar)

Speed by angle off the wind's eye, per rig — data tables, boot-validated (best angle must be exactly 1.0
so "top speed" never lies). Apparent wind enters ONLY as a strength term, clamped at true strength —
audits killed two double-count bugs here (a close-hauled beat once matched a beam reach; fixed + tested).

| Point (off the eye) | Sloop | Caravel |
|---|---|---|
| In irons (0–15/30°) | 0 — stalls, luffs | 0 — wide no-go |
| Close-hauled ~45° | 3.0 t/s | 0.7 (can barely point) |
| Close reach ~60° | 4.0 | 1.4 |
| Beam reach 90° | **5.0 — best** | 3.3 |
| Broad reach ~120° | 4.2 | **3.6 — best** |
| Dead run 180° | 2.4 | 2.4 |

The dead-run ceiling is emergent (you can't outrun your own wind), not a scripted cap. The two rigs
peaking at different angles IS the class identity — same engine, different data rows.

## 5 · Sail States (the ladder)

`furled → quarter → half → full`, stepped by W/S at the wheel. **A ship fact** — canvas stays set when
the pilot walks away; she cruises hands-off.

- **quarter (25%)** — docking/battle crawl: enough way for steerage, slow enough to park by.
- **half (55%)** — battle sails: canvas kept for maneuver, not pace.
- **full (100%)** — passage-making.
- Hoisting is animated at per-hull pace (a lugsail flicks up, the caravel's plan takes seconds); the
  `hoistT` field becomes the crew JOB duration when crewed sailing lands.
- **Rejected: continuous trim as the control** (VibeSail-style hold-to-trim). States are what crew orders,
  AI captains, and netcode can name; trim depth returns later as CREW SKILL (a green crew delivers ~80%
  of the polar, a veteran 100%).

## 6 · The Anchor

States: `up → dropped → weighing (1.2 s) → up`. SPACE at the wheel.

- **Dropped bites hard** (~0.3 s to dead stop) — a handbrake, not a coast.
- **Dropped at speed = the anchor-turn**: the hull whips around the hook (~3.2× rudder) — the
  deliberately-pirate maneuver.
- **The hook holds against everything**: thrust, storm-strength wind, windage drift, and rudder — an
  anchored resting ship cannot be steered in place (a rudder needs waterflow).
- **Nothing is automatic**: taking the wheel does not weigh it; releasing does not drop it. The departure
  ritual (weigh → set canvas → gain steerage) IS the loop, and each step becomes a crew job later.
  Forgetting is self-teaching: "Full sail! The anchor holds her — SPACE to weigh."
- Unanchored ships genuinely drift downwind — careless parking is a strategic mistake (feeds the
  ship-theft rule).

## 7 · Steering

A four-layer chain, each with honest lag — the feel of mass, never snap:

`key → helm ORDER → rudder WINDS (~0.3 s hard-over) → yaw eases (per-hull) → hull carves (momentum drift)`

- The wheel/rudder visuals sweep with the real value; releasing keys = the "midships" order (~0.4 s back).
- **Lash the wheel (R)**: ties the rudder at its current angle — she holds a turn or a course with nobody
  at the helm (the solo captain's third hand for mast work). A FRESH grab of A/D unties it; the hold you
  lashed with does not.
- **Rudder authority = waterflow.** Stopped sail ships keep a small bare-steerage floor (~3–5°/s, the
  irons escape); a stopped rowboat can't turn at all until it backs water; an anchored ship turns not at
  all. Hard turns bleed speed by actual swing, not input.
- Momentum is a true velocity vector: ships carve, get caught sideways mid-turn, and show a live drift
  angle (bow vs. actual track).

## 8 · Wind on the Hull

The hull is a sail too (added after audit — previously only canvas felt wind):

- **Windage**: every un-anchored ship takes a steady downwind shove. Under way it reads as **leeway**
  (a few degrees of crab on a crosswind course); stalled it's **sternway** (blown backward in irons);
  abandoned it's honest drift. Per-hull terminal: rowboat ~0.27 t/s, sloop ~0.43, caravel ~0.78 (tall
  topsides catch more).
- **Fall-off**: a nearly stopped bow pays off away from the wind's eye on its own. **In irons is a
  delay, never a prison** — hands off, she makes sternway, the bow walks off (~10 s), and the canvas
  refills to steerage way (~30% of rating). Physics hands you steerage; finishing the escape is
  seamanship.
- **Judged, not built — full CE/CLR sail-torque**: real weather helm assumes a trimming crew; with trim
  rejected for the pilot, a standing torque would be friction without a counter-verb. The approved shape
  is **CE/CLR-lite**: one small clamped `helmBias` derived from live mast data — which makes dismasting
  change a ship's balance automatically when part damage lands.

## 9 · Reading the Ship (no numbers)

- **Canvas is the HUD**: spar length = the rig; cloth coverage = sail state (it unrolls along the spar);
  belly depth = how hard the wind drives; trim angle = point of sail (boom sheeted in = beating, squared
  out = running; the yard braces on the caravel); side = your tack.
- **Cloth states**: rippling = luffing ("I have wind but can't use it"); limp & still = dead calm;
  deep & steady = driving; bundle on the spar = furled. Four states, zero numbers.
- **The sea is the wind indicator**: streaks on the water flow with the live wind — density and length
  grow with strength, they slow and vanish in a calm, and they bend through direction changes.
- Rigging draws OVER the crew (you walk under the boom); the wheel turns with input; the rudder blade
  deflects toward the turn.
- Debug instruments (developer-only): wind arrow with % and t/s; per-ship point-of-sail band, speed
  actual/rated, drift°, yaw°/s, anchor and lash states; per-walker measured speed in tiles per sim-second.

## 10 · Emergent Maneuvers (no dedicated code)

Tacking · in-irons stalls and hands-free recovery · jibing · the weather gauge (upwind ship dictates) ·
the anchor-turn · lash-and-hoist solo station work · lee-shore traps (a caravel parked downwind of an
island genuinely struggles off it) · calm-belt oar crossings.

## 11 · Deferred with named triggers

| Item | Trigger |
|---|---|
| Order-at-the-wheel / labor-at-the-mast (solo multi-mast station work) | crewed sailing slice |
| Trim quality as crew skill (% of polar delivered) | crewed sailing slice |
| CE/CLR-lite helm bias + dismasting balance | part-HP / dismasting |
| Anchor swing, weathervaning, storm drag | living-sea ledger or storm events |
| Drifting-attitude torque (ghost ships run downwind) | dehydrated-ship sim |
| Keel anisotropy (hull resists sideways better than fore-aft) | if crosswind leeway feels exaggerated |
| Per-mast sail kinds (mixed rigs), third mast, Galleon class | ship-builder part palette |
| Ship-ship impacts, ram damage, grounding | next code slice ("impacts") |
| Cannons (Q/E broadsides) + part HP | after impacts |
