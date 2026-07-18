# Sailing Game — Full Feature Reference

A brainstorming/decision-support list. Not a roadmap — pull from here when scoping passes.

---

## 1. Wind & Air Systems
- True wind (direction + speed field, drifts over time)
- Apparent wind (derived from true wind + boat velocity)
- Apparent wind angle shift (not just magnitude — affects how "fast" a reach feels)
- Gusts & lulls (short-cycle strength variation)
- Wind shifts (persistent direction changes — headers/lifts)
- Wind shadow (islands/ships blocking wind downwind)
- Wind funneling (channels between islands, headlands)
- Thermal/sea-breeze cycles (day-driven wind buildup)
- Squalls (localized high-wind events)
- Weather fronts (storms rolling through, forcing reefing)
- Windage (passive wind push on hull/rig even without sail power)
- Calm zones / dead-wind belts
- Wind visualization: streaks, telltales, flags, canvas shape

## 2. Water & Current Systems
- Currents as a second evaluated field (position + time based)
- Set and drift (navigator-language current reading)
- Tides (clock/calendar-driven modulation)
- Tidal range events (scheduled surges, e.g. "Aqua Laguna"-style spike)
- Authored regional current features (strait, gyre, vortex field)
- Vortex/whirlpool hazard currents (curl-noise, pull toward core)
- Eruptive/event-driven hazard currents (geyser-like surge streams)
- Current charts as tradable/plottable knowledge artifacts
- Current streamline visualization (traced, curving, animated like wind streaks)
- Attribution split: separate visual tell for wind-drift vs current-drift
- Current-dominated in-irons recovery ("swept" vs "blown")
- Flotsam/loot/message-bottle drift on the current field
- Sea state / wave visuals tied to wind strength
- Localized wind bending near coastlines/cliffs

## 3. Sail & Rig Mechanics
- Discrete sail states (furled / quarter / half / full)
- Continuous/manual trim (alternative or later-tier system)
- Trim quality as a crew skill (% of theoretical polar delivered)
- Luffing (undersheeted, sail flaps, loses power)
- Stalling (oversheeted, sail acts as a wall)
- Multiple sail types (main, jib/genoa, spinnaker/gennaker, square rig)
- Reefing (reduce sail area in high wind — risk/reward)
- Backwinding (deliberate or accidental wrong-side fill)
- Hoist speed/animation per hull class
- Points of sail (no-go zone, close-hauled, reach, run — per-class polar)
- Tacking (turning through the wind)
- Jibing (turning through downwind, riskier)
- In-irons stall + fall-off recovery (active or passive)
- Heaving-to (balancing near-stationary using sail trim, no anchor)
- Weather helm / lee helm (CE/CLR torque or lite approximation)
- Dismasting effects on balance/handling
- Per-mast sail configuration (mixed rigs)
- Sail damage / wear over time or storm exposure

## 4. Hull & Handling
- Polar speed curve per hull class
- Multiple hull classes with distinct handling identity
- Turning circle scaled by speed + rotational inertia
- Rudder authority tied to waterflow (none at rest, floor at low speed)
- Bare-steerage floor (irons escape)
- Lashing the wheel (holds a course/turn hands-off)
- Capsizing (small boats — righting-moment failure)
- Broaching (loss of control downwind in heavy air)
- Planing (speed threshold breakthrough for light hulls)
- Displacement speed cap (heavy hulls hard-capped)
- Pitchpoling (bow-diving in following seas — advanced/optional)
- Leeway (sideways slip vs. heading)
- Keel/centerboard efficiency (per-class lateral resistance)
- Hull fouling / damage drag over time
- Anchor as a ritual state machine (drop / weighing / up)
- Anchor-turn maneuver (sharp pivot when dropped at speed)
- Anchor holding against wind/current/thrust/rudder
- Ship-ship or ship-hazard impacts, ram damage, grounding

## 5. Navigation & Wayfinding
- Chart system (revealed knowledge, fog-of-war style or item-based)
- Chart trading economy (charts can be wrong/outdated)
- Chart authoring (player/navigator can survey and produce sellable charts)
- Navigator skill tiers affecting perception range / forecast horizon / trace density
- Dead reckoning navigation (no-GPS, position estimation)
- Log Pose / compass-equivalent magical or mechanical navigation aid
- Set-and-drift readouts (diegetic, non-numeric)
- Laylines (visual aid or AI-only calculation)
- Waypoint/route planning UI
- Post-voyage logbook (non-numeric narrative summary of the trip)
- Navigator crew commentary/coaching (also doubles as tutorial)

## 6. Racing & Course Design
- Buoy/mark racing (windward-leeward, triangle courses)
- Start-line mechanics (timing, line bias)
- Mark-rounding rules (room, right of way)
- Rules of the road (starboard/port priority, windward/leeward rules)
- Protest/penalty system (e.g. spin-turn penalty for fouls)
- Layline overstand/understand judgment
- Match racing (1v1 tactical)
- Fleet racing (many boats, one course)
- Regatta/series scoring across multiple races
- Ghost/replay racing against your own best time

## 7. Hazards & Encounters
- Sea creatures/monsters (territory-based, activity-triggered)
- Encounter risk tied to player behavior (noise, speed, stillness)
- "Sit still and wait" as a valid risk-avoidance strategy
- Evade/chase scenarios using existing sailing tools (no separate combat system)
- Storm damage and danger scaling with wind strength
- Reef/shoal/rock grounding hazards
- Whirlpool/vortex pull-in hazard
- Fog (visibility reduction, perception modifier)
- Lee-shore traps (downwind of land, hard to escape)
- Cause-coded damage (collision vs. current-swept vs. storm, for logs/economy)

## 8. Combat (if in scope)
- Cannons (broadside firing)
- Part-based hull HP (mast, hull, rudder as separately damageable)
- Boarding (via doors/gangplank)
- Ship theft (boarding an abandoned/unanchored drifting ship)
- Crew combat roles distinct from sailing roles

## 9. Crew & Roles
- Multi-role crewed sailing (helm, trimmer, navigator, lookout)
- Order-at-the-wheel / assign-a-job-at-the-mast (solo multi-station work)
- Crew skill progression (navigator tiers, trimmer quality, etc.)
- Named/diegetic crew (losable via death, desertion, poaching)
- Crew hiring/training economy
- Co-op multiplayer crew roles on one ship
- Tow-rope mechanic (rescue, becalmed assist, cooperative play)
- Sculling/oar-assist for stalled sail ships in calm conditions

## 10. Ships, Progression & Customization
- Multiple ship classes with distinct identity (not just stat scaling)
- Data-driven hull/deck/mast layout (ship-builder ready)
- Boarding doors, walkable deck tiles, interior layout
- Cosmetic customization (hull color, sail livery, flags)
- Upgrade system (sails, coatings, rigging — speed/handling tradeoffs)
- Ship damage/maintenance over time
- Unlockable ship classes as progression gates
- Signal flags (diegetic player-to-player communication)

## 11. Game Modes
- Solo time trial
- Open-world cruising/exploration
- Delivery/cargo missions under time or weather pressure
- Survival/storm-running
- Campaign/career mode (boat class progression, sponsors/factions, regions)
- Co-op crewed racing or voyaging
- Sandbox/free-roam charting and discovery

## 12. AI Opponents & NPCs
- VMG-based tactical heading selection
- Tacking/jibing decision logic (layline-based)
- Wind-shadow awareness (blocking/avoiding)
- Gust-seeking behavior
- Rules-of-the-road-aware AI (fouls, bluffing)
- Difficulty tiers via layered AI awareness (not physics changes)
- AI personality types (aggressive vs conservative)
- Rubber-banding/catch-up balancing (if arcade-leaning)

## 13. UI/UX & Feedback (non-numeric where possible)
- Canvas as HUD (trim angle, belly depth, cloth state = power/point of sail)
- Wind streaks on water (direction, density/length = strength)
- Current streamlines (traced, curving, animated, separate hue/depth from wind)
- Wake-angle visual (reads leeway/drift without a number)
- Ensign/flag as secondary true-wind indicator
- Heel-lite visual cue (camera tilt or deck-tilt shader) even without full 3D heel
- Rigging/wheel/rudder visuals that sweep with real input values
- Debug-only numeric instrument panel (developer use)
- Difficulty presets bundling realism toggles (arcade/standard/sim)
- Colorblind-safe wind/current indicators
- Practice mode with rewind/undo for tacking mistakes

## 14. Audio & Atmosphere
- Wind whistle intensity scaled to true wind speed
- Sail flapping sound on luff
- Rigging creak under load
- Hull/water sound scaling with speed (planing whoosh vs displacement gurgle)
- Ambient seabirds, waves, distant ships
- Navigator voice callouts (coaching/commentary)

## 15. World & Time Systems
- Day/night cycle (visibility, wind pattern shifts)
- Calendar-driven tide/event scheduling
- Chunked/streaming sea world
- Regional geography-authored current features
- Weather event director (squalls, fronts) layered on top of base fields

## 16. Accessibility & Onboarding
- Auto-trim toggle
- Progressive tutorial (teaches points of sail incrementally)
- Assist modes for steering/trim without removing core feel
- Practice/sandbox mode separate from stakes-bearing play

---

## How to use this list
- Mark each item: **Core** (loop-critical), **Depth** (adds skill ceiling), **Content** (world/variety), or **Later** (needs a dependency first).
- Cross off anything that conflicts with an existing maxim (e.g. "no car-isms," "read the world not the HUD," "currents are geography not weather").
- Flag anything that introduces a new *verb* the player performs — those are usually worth prioritizing over passive systems.
