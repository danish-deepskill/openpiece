# The Moat Map — systems that still need REAL design

**What this doc is.** The queue of DESIGN PASSES. A vision capture (a feature list + engine preview, like
`PROGRESSION.md`/`EVENTS.md`/`ECONOMY_ACTIVITIES.md` today) is NOT a design; a design pass turns it into
judged mechanics with trade-offs and knobs — what `SAILING.md` did to NAVAL's movement half (2026-07), what
`PATHFINDING.md` did to movement planning. Each entry below: why it's a MOAT, the hard questions the pass
must answer, my current LEANS (marked — not canon until a pass lands them), and when to run the pass.
`REFERENCES.md` scores the ideas' worth; `ROADMAP.md` orders the builds; THIS doc orders the *thinking*.

## The moat test (every pass is judged against this — the "no cheap systems" contract)

1. **Systemic, not scripted.** Rules that produce stories; a "quest" is a situation the sim can reach, not
   a script. If a feature needs bespoke logic per instance, it fails.
2. **Knowledge is power.** A veteran with equal stats beats a newbie — depth is learnable, and information
   itself is tradable content (charts, rumors, counter-matrices).
3. **Counterplay everywhere.** Every strength has purchasable/learnable answers; no strictly-better option.
   (The NAVAL upgrade LAW — every part a trade-off — generalized to every system.)
4. **The world doesn't wait.** Systems run without the player; you WITNESS more than you trigger (Kenshi).
5. **Costs are real.** Power, QoL, and safety are priced in time, risk, or trade-offs — never a pure plus,
   never a menu purchase that skips the world.
6. **Engines over content volume.** A system must MULTIPLY existing defs (fruits × haki × terrain × factions),
   not demand hand-authoring per instance.

Already-designed ledger (passes DONE, don't re-open casually): sailing model + skill bands (`SAILING.md`),
ship classes as axes + upgrade law (`NAVAL.md`), seamless chunked sea (`WORLD.md` + `ARCHITECTURE_SCALE §5`),
movement frames + transition rulebook (`features/movement-frames.md`), pathfinding stack (`PATHFINDING.md`),
AI INT ladder (`AI_INTELLIGENCE.md`), combat stamina/posture/parry direction (`COMBAT.md`).

---

## 1. Crew & shipboard life — roles, jobs, routines, the living ship
**Moat:** the crew IS the mid-game. Rell Seas-likes treat crew as stat sticks; ours are full actors (the
Moat: possess your cook) whose skills literally gate the ship (NAVAL's crew-requirement axis: sail states
cap by hands aboard). The ship should feel ALIVE — watches rotate, meals cook, someone fishes off the rail.
**Hard questions:** role set (navigator/cook/doctor/shipwright/gunner/lookout — which at v1?); jobs = which
work-priority model (RimWorld table vs simple station assignment); watch/routine scheduling (day-night?);
recruitment (who joins and WHY); loyalty/morale state; wages/upkeep; captain ORDERS vs possession (two
control modes — where's the line?); what crew do ON LAND (camp, follow, errands).
**Leans:** every role gets the navigator treatment (SAILING's 3 axes: information / efficiency / autonomy —
a cook's "autonomy" is provisioning without being told); recruitment is REASONS not gacha (saved, fed,
beaten honorably, shared dream) and each recruit carries a personal goal (a content hook the director can
pull); jobs v1 = stations + a tiny priority list, NOT full RimWorld work tabs; idle-life animations are
cheap and carry the whole alive-ship feel.
**Pass when:** sailing core lands (it defines the stations) + crew-follow pathfinding slice. **This is the
next SAILING-grade pass.**

## 2. Needs-lite — provisions, fatigue, morale (inside the crew pass)
**Moat:** needs exist to CREATE JOBS AND STORIES, not chore bars. The cheap version (hunger/thirst meters
ticking red) is refused; the deep-sim survival layer (REFERENCES #32) stays iced.
**Leans:** PROVISIONS gate voyage RANGE — food/water as cargo makes long voyages a logistics decision,
creates fishing/resupply stops, makes the cook a real role. FATIGUE lives in the watch rotation — a skeleton
crew can't hold full sail through the night (reuses the sail-state crew cap, no new bar). MORALE moves on
events (feast, storm, death, pay) and only its EXTREMES act: desertion at port, mutiny at sea — Kenshi
stories, not fail states.
**Hard questions:** exact three-resource shape; how visible (HUD vs inspection); AI crews under the same
rules (the Moat demands it — enemy ships also carry provisions → starving them out is a legal siege tactic).
**Pass when:** with #1 (same doc).

## 3. Death, injury & the price of defeat
**Moat:** defeat that generates story instead of a reload. The current arcade respawn is a placeholder with
a RECORDED revisit trigger: "when crew exists" — #1 IS that trigger, so this pass rides with it.
**Hard questions:** what the player loses (position, cargo, crew, body?); injury persistence (RimWorld tend
vs instant heal); enemy behavior over a downed body (loot / capture / leave-for-dead / execute — by profile);
capture loops (imprisonment → rescue mission = emergent content); when is it GAME OVER?
**Leans:** the Kenshi handoff via the Moat — when your body drops, control flows to a crewmate; death is a
PIVOT, not a reset. Defeat outcomes come from the victor's AIProfile (a marine arrests, a beast mauls, a
pirate robs and laughs). True permadeath only when the whole crew is gone; what "new game" inherits (legend?
the fruit re-entering the world?) is the interesting question.
**Pass when:** with #1–2 (one coherent "crew era" design).

## 4. Power systems — fruits, haki, styles, science, weapons (the CONTENT design)
**Moat:** the four-layer ENGINE exists (GAS-lite); what's undesigned is the world-facing economy and
counterplay that make powers feel earned and answerable. Cheap version refused: fruits as shop items, haki
as a skill-point unlock.
**Hard questions:** fruit acquisition economy (spawn rates, WHERE fruits appear, the canon one-per-person);
awakening; Logia/Paramecia/Zoan as mechanical FAMILIES (what does a Logia body mean in the damage engine?);
haki progression sources; conqueror's gate; what SCIENCE covers (gadgets, cyborg frames, dials) and how it
rivals mysticism; ranged weapons; named blades.
**Leans:** fruit SCARCITY + REBIRTH simulated (REFERENCES #27): an eaten fruit is gone until its eater dies,
then re-manifests somewhere — fruit HUNTS become emergent world events, and killing a user is a moral/economic
decision. Unidentified fruits = a gamble (knowledge economy). Downsides are REAL: fruit users sink — the
pathfinding waterCost hook already exists; the sea itself becomes their counterplay. HAKI IS EARNED BY
ADVERSITY, not points: observation trains through near-death evasion, armament through fighting what you
cannot touch, conqueror is a LEGEND threshold (you don't train it; you become it). Science is the no-mystery
axis: crafted, shipwright-adjacent, maintainable — the Franky path for players who want power without RNG
fruit luck. The COUNTER-MATRIX (armament>logia, observation>feints, conqueror>fodder) ships as DATA and as
in-world KNOWLEDGE — you learn it from the world, not a wiki (moat test #2).
**Pass when:** after the crew era, before Grand Line content (fruits are the tier-2 power spike).

## 5. Progression that isn't cheap (the pass over PROGRESSION.md)
**Moat:** "leveling up that's not cheap" = power comes from SPECIFIC acts, never a universal XP bar.
**Hard questions:** reconcile the vision's three point categories + 500-cap talents with use-based growth;
catch-up vs mastery curves; can anything be LOST; how AI units progress (the Moat: the world levels too).
**Leans:** THREE CURRENCIES, deliberately non-interchangeable — CAPABILITY (skills grow by use, OSRS-style,
capped so you can't max everything: identity through specialization), KNOWLEDGE (techniques/recipes/charts —
LEARNED from teachers/books/observation, never leveled; the INT-ladder's player mirror), LEGEND (bounty/fame —
social power: fear, recruits, marine response, doors that open). Tiers (F→Yonko) DERIVE from the three, no
tier is bought. SAILING's skill-band rule generalizes: capabilities unlock at band edges, numbers grow within.
**Pass when:** with #4 (they define each other).

## 6. Bounty, HEAT, witnesses & news — reputation with teeth (+ Nemesis rivals)
**Moat:** the world reacts to your LEGEND, but only to what it SAW. Cheap version refused: a global fame
number that updates instantly everywhere.
**Judged reference** (`docs/references/visibility_reference.md` — a Marine notoriety system, 2026-07):
ADOPT its best idea — **LEGEND vs HEAT are two different axes**: bounty is permanent reputation (grows,
never fades), heat is CURRENT hunt intensity (cools when you lay low, spikes when you're sighted). They
COUPLE one way: high bounty AMPLIFIES heat (you're recognized faster, sightings are believed, the response
FLOOR rises — an Emperor is never truly Unknown) but never IS heat. The corner cases prove the split: a
Yonko lying low = huge bounty, quiet heat; a nobody who just torched a Marine base = no bounty yet,
screaming heat until the report becomes a poster. Adopt
also: the escalation ladder as response TIERS (patrol → officers → a Vice Admiral's guard → warships →
Buster Call as the apex threat-with-a-clock), the Underworld squeeze (black-market prices/access scale with
heat), and Headlines-as-a-one-way-door (once the News Coo publishes you, the world changes). REJECT as
cheap: one GLOBAL 0–100 scalar (heat must be REGIONAL, carried by the same news propagation as bounty);
−1/day decay timers (heat cools where you are NOT SEEN — a model, not a stopwatch); fixed response
spawn-clocks and "+50% force size" inflation (responses must be REAL assets sailing from REAL bases — the
org chart in #15 supplies who actually comes, and distance-to-base supplies when); daily relation-decrement
disinfo (model as director EVENTS with counterplay — expose the lie).
**Hard questions:** witness model (who counts, do survivors matter); propagation (how fast news travels
between islands); heat sensors (sightings, stop-and-search patrols, informants) and cooling geography;
bounty vs actual power divergence (delicious when wrong); poster accuracy/disguises;
marine response ladder; how Nemesis rivals spawn/promote/return.
**Leans:** deeds count only if WITNESSED AND REPORTED — sink every witness and the sea stays silent (a dark,
legal strategy with its own moral cost); news travels physically (News Coo/ships → your bounty is stale in
the next sea — regional legends); posters record your LAST SEEN look (outfit changes = soft disguise play).
NEMESIS (REFERENCES #5): survivors of your fights keep scars + grudges (the `grudge` component is the seed),
get promoted BECAUSE of you, and return with remembered tactics — your rivals are self-generated, not authored.
**Pass when:** after crew era — needs the event director (#8) to deliver its consequences.

## 7. Living economy & trade routes (the pass over ECONOMY_ACTIVITIES.md)
**Moat:** piracy only MEANS something if goods are real. Cheap version refused: gold-faucet quests + static
shop lists.
**Hard questions:** island production/consumption model (ledgers vs agents); price formation; where money
SINKS; how much the player can distort (blockades, cornering markets); crafting depth per activity.
**Leans:** islands are simple LEDGERS (produce/consume/stockpile — Kenshi-grade, not EVE), but goods
PHYSICALLY TRAVEL on ships: robbing a grain convoy makes bread expensive somewhere, and the faction reacts.
Player trade = the peaceful mirror of piracy (same routes, same risk map). Wages/provisions/ship parts are
the standing money sinks that keep piracy necessary.
**Pass when:** the world-sim era (after persistence — ledgers must save).

## 8. The event director (the pass over EVENTS.md)
**Moat:** RimWorld's storyteller pointed at a Kenshi world: authored DRAMA PACING over a sim that was going
to do something anyway.
**Hard questions:** drama budget model; on-screen vs off-screen event resolution; how events MUTATE the world
(an off-screen raid must change the island's ledger/faction standing, not just despawn); proximity triggers
vs world-state triggers; how it uses your legend (#6) for casting.
**Leans:** the director STEERS EXISTING ACTORS before it spawns new ones (prefer "that pirate crew two seas
over gets ambitious" to conjuring a fleet) — sim purity first, conjuring as the fallback with a budget.
Events are `EventDef`s with preconditions read FROM the sim, so the director can never contradict the world.
**Pass when:** with #7 (they share the world-sim substrate).

## 9. Knowledge as a PLAYER resource — charts, log pose, rumors, identification
**Moat:** the information economy already designed for AI (`AI_INTELLIGENCE.md`) gets its player-facing half.
Exploration games die when the map is just fog; here KNOWLEDGE IS LOOT.
**Hard questions:** chart/fog model per player; log pose as route-gating (is the Grand Line a navigation
puzzle?); rumor market (taverns selling info of varying truthfulness); fruit/technique identification;
what's tradable.
**Leans:** charts are ITEMS (buyable, stealable, fakeable); the log pose gates Grand Line routes so the
navigator role stays load-bearing between fights; rumors have RELIABILITY (a lie about a fruit's location is
still content); identification ties to #4's unidentified fruits.
**Pass when:** Grand Line content era; the chart item shape should be sketched in #7's pass (it's cargo).

## 10. Island & world content generation
**Moat:** many islands need to feel AUTHORED without hand-authoring each. Cheap version refused: N copies of
one village layout with palette swaps.
**Hard questions:** island archetype def shape (village/fort/grove/ruin/sky/winter…); how much procedural vs
authored set-pieces; generated MINI-HISTORY (REFERENCES #22 — who settled, what fell, what's buried) seeding
POIs, relics, faction claims; dungeon structure.
**Leans:** archetypes as defs composed from the structure layer (slice 3 makes buildings DATA already);
one thin generated-history pass per island naming its past = relics + rivalries + reasons, the DF trick at
1% of DF's cost.
**Pass when:** before the sea gets its next 10 islands (content scaling moment, near external-data loading).

## 11. Custom ship building (the recorded intent: ships are PLAYER-BUILT)
**Moat:** your ship IS your naval identity — and the mechanics already exist to make building matter:
masts/rig feed the sailCurve, weight feeds handling, stations feed crew requirements. YOUR BUILD IS YOUR
SAIL CURVE. Cheap version refused: buying hull #4 from a list.
**Hard questions:** part-tile palette (which parts, footprint sizes); validation rules (what makes a hull
LEGAL — enclosed, mast limits, helm required); how building interacts with deck combat (destructible parts =
slice-3 structures on the deck grid — the foundation is already laid); cost/skill gates (shipwright).
**Leans:** parts are multi-tile STRUCTURE defs on the hull grid (the windmill machinery, at sea); legality =
boot-style validators (fail loud in the dock UI, not at sea); every part obeys the NAVAL trade-off law.
**Pass when:** after sailing core + part HP land (build order in `SAILING.md`).

## 12. Territory & the strategic endgame (Yonko layer)
**Moat:** "be the Yonko" = the multi-scale command loop (REFERENCES #1) with territory that RUNS on the
economy (#7) and orders that speak the PATHFINDING region/frame language (already reserved there).
**Hard questions:** claim/upkeep/income loop; what happens in your ABSENCE (the world-sim answers, never
timers); division/fleet order grammar; delegation UI; when does the game "end"?
**Pass when:** deep-sim era — LAST of the big passes; everything above feeds it.

## 13. Multiplayer gameplay design (before netcode work, after PlayerIntent)
**Moat:** ballpiece.io — the same sim, server-authoritative. The STACK is settled (`DEEP_SIMULATION §7`);
the GAMEPLAY design isn't.
**Hard questions:** possession rules among players (who may possess what — the Moat meets other humans);
crew sharing; sharding by sea region (reuses sim-LOD); economy/persistence in a shared world; PvP consent
and the bounty system as its social contract.
**Pass when:** when netcode work starts (CLAUDE.md: PlayerIntent/ControlSystem is the keystone first).

## 14. Seamless world — the REAL pass (the decision exists; the design doesn't)
**Moat:** the sailing moat is only as good as the sea it happens on — no loading screens, sails on the
horizon that are REAL, a chase that crosses three zones without a seam. What exists today is a DECISION
(one chunked sea, tick tiers, zones as data — `WORLD.md`/`ARCHITECTURE_SCALE §5`) plus chunk-proof
invariants in the code. That is a direction, not a design. **This pass is claimed: Claude designs it**
(developer's call, 2026-07) — its own doc (`SEAMLESS_WORLD.md`) when run.
**Hard questions the pass must answer:**
- Chunk mechanics: size, load radius, per-chunk pure generation, UNLOAD contract (what state persists —
  ties to the persistence pillar, sequenced first), touched-chunk deltas (also #16's frozen seas and
  quake-scarred islands live or die here).
- The TICK-TIER CONTRACT per system: what "nearby" and "distant" sim actually MEANS for AI, ships, economy,
  needs, battles — written as a fidelity table, with promotion/demotion hysteresis so entities don't
  thrash at tier boundaries.
- HYDRATE/DEHYDRATE: a distant ship is a ledger entry moving along a route; on approach it becomes a full
  hull + crew. What information survives the round trip (cargo, damage, crew count, intent)? Off-screen
  battles resolve by autoresolve math (Mount & Blade) — the same math the strategic layer (#12) will use.
- THE HORIZON PROBLEM (the sea's special case): you can SEE much farther than full-sim range. Render LOD ≠
  sim LOD: a sail on the horizon is the ABSTRACT layer made visible (a billboard from the ledger), becoming
  real as it closes. Done right, the world-sim is literally visible from your deck — that's the moat shot.
- Geometry: world size, region layout (C1–C4), travel-time targets as a DESIGN variable (how long should a
  sea feel?), landmark visibility (navigate by sight — feeds the navigator role and #9's charts).
- Wind/weather fields over chunks (SAILING's seeded streams at world scale, forecast skill intact).
**Pass when:** developer says go — the design can (and should) precede the build trigger by a long margin,
because #7, #12, and #16 all need its vocabulary (ledgers, deltas, tiers) to design against.

## 15. Marine hierarchy — organizations as DATA (ranks, authority, duty, promotion)
**Moat:** the Marines as a real ORGANIZATION SIM — an org chart whose ranks hold real assets and standing
duties — and because of the Moat, a career the PLAYER can walk: enlist as a Recruit, retire as Fleet
Admiral. Cheap version refused: marines as spawn tables with rank-flavored names (the reference file's
"+50% larger forces" — see #6's verdict).
**The shape (lean):** ONE org system, Marines as content — `OrgDef` + `RankDef` rows. A rank =
AUTHORITY SCOPE (what you may command: yourself → a squad → a ship → a base/branch → a fleet → a Buster
Call authorization) + DUTIES (patrol these lanes, garrison this base, inspect ships, raid, escort convoys)
+ ASSETS granted (ship class, garrison budget). "Vice Admiral holds G-5" = a rank slot BOUND to a territory
node (branch bases G-1…G-16 as world assets with garrisons and patrol routes — the event director steers
their standing orders; #6's heat decides which rank's assets mobilize against whom).
**Promotion (lean):** the same witness/news machinery as bounty, read from the org's side — your deeds must
be SEEN AND REPORTED up the chain (merit), a SLOT must be open (org charts have vacancies: predecessors die,
get promoted, disgrace out — Nemesis synergy: the officer who survived you gets promoted BECAUSE of you),
and politics weighs in (favor with superiors; the corruption axis — bribes are heat's back door). Rank-up
is therefore emergent content: hunt a pirate the papers will credit you for, impress the Admiral inspecting
your base, or arrange your rival's disgrace.
**Duties as jobs:** patrol/inspection/raid/escort are the JOB SYSTEM (#1's work model) running on org
assets — a patrol is a standing order, an inspection is heat's sensor, an escort is #7's economy made
raidable. Player-as-marine = the same duties as missions; player-as-pirate = those duties are the living
opposition.
**Generalizes:** pirate crews (captain/first mate/quartermaster), Cipher Pol, kingdoms — all OrgDef rows on
one engine. The Marines are just the biggest org.
**Hard questions:** the rank ladder's granularity (canon has ~12 ranks — how many MATTER mechanically);
what the player may command at each scope (ties to #12's order language); insubordination/desertion;
Absolute-vs-Moral-Justice as an org-culture axis affecting duty choices; how orgs recruit and replenish.
**Pass when:** after #6 (it consumes witnesses/news/heat) and alongside #12's early order-language sketch.

## 16. Elements, materials & the dominance ladder — reactive combat AND world
**Moat:** One Piece combat is a MATRIX, not a stat check — ice freezes the literal sea, a quake fruit
shatters the fortress wall, lightning does nothing to rubber, and a Logia laughs at steel until armament
touches him. Cheap version refused: "fire does +20% vs ice" damage-type charts with no world consequence.
**The shape (lean):** one rule SUBSTRATE, three tag families, all data:
- Every ability/projectile carries ELEMENT tags (fire/ice/lightning/poison/quake/sand/…) and DELIVERY tags
  (sharp/blunt/pierce). Every terrain/structure carries MATERIAL tags (water/wood/grass/stone/snow). Every
  BODY carries COMPOSITION tags (flesh, rubber, logia-flame, ice, cyborg-steel).
- REACTIONS are def rows, two tables: **element × material → world effect** (ice + deep water → a
  frozen-sea terrain swap — walkable, ships locked in; fire + grass/wood → spreading burn as a dynamic cell
  state that feeds PATHFINDING's danger maps; quake + structures → structure HP damage and terrain scars —
  the slice-3 entity layer and #14's chunk deltas are the enabling foundations) and **element × composition
  → combat effect** (lightning × rubber → null; blunt × rubber → null; fire × plant-fruit user → burning
  amplified; sharp × logia → pass-through unless armament). Reactions EMIT existing Effects (burning,
  chilled, shocked — GAS-lite rows); the matrix is routing, never a second combat engine.
**The dominance ladder (lean — the "harsh reality" contract):** tier gaps are REAL WALLS, by design (the
world does not scale to you — Kenshi). Clashes compare effective ARMAMENT/aura tiers: a decisive gap means
the stronger breaks guards, shrugs elements, and lands through defenses; fodder facing a Conqueror simply
drops. The genius-survival floor: skill and knowledge buy SURVIVAL, not victory — observation gives escape
windows, terrain gives traps (lure the Logia to the sea, cuff the fruit user), positioning keeps you alive
to run. You can SURVIVE Kaido; you do not out-trade him. The weaker wins by TRAP and circumstance, never by
damage math — and usually doesn't win at all. That harshness is a feature: tiers are why LEGEND means
anything.
**Hard questions:** matrix data shape (sparse reaction rows vs full tables — lean sparse + defaults); world
mutation persistence and reversal (does the frozen sea thaw? on what clock — and its chunk-delta cost);
hard immunities vs resistances (lean: composition immunities are HARD — the counterplay is the counter-tag
(armament/sea-stone), not a percentage); AoE landscape destruction budget (quake reshaping an island is a
region-graph + render rebake event — the dirty-flag plumbing exists, the COST rules don't); how #4's
counter-matrix (armament > logia) and this table stay ONE system, not two.
**Pass when:** with #4 (powers) — they are one design; the world-effect half also needs #14's delta
vocabulary, which is another reason #14's pass runs early.

## 17. Dialogue, social play & the interaction web — the OTHER half of "peer"
**Moat:** the Moat says every character is a peer — but a peer you can only fight or ignore is half a peer.
The living world needs a SOCIAL surface with the same depth as combat: talking your way past a guard, buying
a rumor, intimidating a weaker crew into standing down, interrogating a captive for a chart. Kenshi and Caves
of Qud prove this is systemic, not scripted. What exists today is a linear typewriter + one yes/no
(`DialogueSystem`) — a presentation shell with no social MECHANICS behind it. Cheap version refused:
branching dialogue trees hand-authored per NPC (that's content that doesn't scale and never surprises).
**The shape (lean):** social actions are ABILITIES in the same engine — persuade / intimidate / bribe /
interrogate / deceive / recruit-pitch resolve as CHECKS, not scripted branches: your relevant stat + LEGEND
(#6 — a Yonko's "back off" is not a rookie's) + relationship + the target's disposition/greed/fear (AIProfile
data) vs a threshold, with the OUTCOME feeding the sim (a bribed guard's faction stance shifts; a failed
intimidation raises heat; interrogation writes a fact into your knowledge economy, #9). NPCs speak from STATE,
not scripts — a line is assembled from who they are, what they know, and how they feel about you (Qud's
grammar approach), so the same system serves any of thousands of actors (the Moat at the UI layer, like the
unit-plate view already is). Bribery is heat's back door (#6/#15's corruption axis); intimidation is legend
made interactive; deception is the player's half of #6's disguise/false-trail play.
**Hard questions:** the check model (opposed roll vs deterministic threshold — lean deterministic + skill
bands, matching SAILING/combat); relationship state shape (per-pair scalar vs richer); how much is
generated-from-state vs authored set-pieces (recruitment/quest-givers may want authored beats); refusal &
consequence (a failed intimidation must COST, not just deny); how AI uses social abilities on each other and
on you (the Moat: an enemy captain intimidates YOUR crew's morale, #2).
**Pass when:** with the crew era (#1) — recruitment IS a social interaction, so they define each other; the
knowledge-economy hooks (#9) can wait for their own pass.

## 18. Time, calendar & day/night — the substrate half a dozen points assume
**Moat:** not itself a moat, but the SUBSTRATE most moats quietly stand on — and getting it wrong (or
leaving it implicit) forces every dependent system to invent its own ad-hoc clock. Enumerate it once, early.
Already depended-on: watch rotations & fatigue (#1–2), heat cooling "where you're not seen" over DAYS (#6),
news travel time (#6), event pacing (#8), Marine patrol/duty schedules (#15), the Buster Call's 30-day clock
(#6), the notoriety reference's per-day decay, world-history generation's timeline (#10).
**The shape (lean):** ONE sim clock (deterministic tick → game-minutes; the fixed-timestep accumulator
already exists) with a declared MAPPING (how many real minutes = one game-day — a feel knob, like SAILING's
travel-time-as-design-variable). A DAY/NIGHT cycle that AI READS as data (an `AIProfileDef` schedule: sleep,
patrol shifts, market hours) — night is a real mechanic (reduced vision cones → a real stealth/approach
window, dimmer render, some fauna nocturnal), not a lighting filter. TIME-TIER AWARE: distant chunks (#14) advance
time COARSELY (a dehydrated ship's ETA is clock math, not per-tick sailing) — the calendar must survive the
sim-LOD split, same as everything else. Seasons/long weather cycles = the far layer (deep-sim era), reserved
now so the clock has room for them.
**Hard questions:** the real-to-game time ratio (and whether it PAUSES, dilates, or fast-forwards — RimWorld
time controls vs a hard real-time MP world, #13 — these conflict and the answer differs single- vs
multiplayer); what actually CHANGES at night beyond vision (spawns? prices? crime?); does the player sleep/
skip time or is it always flowing (Kenshi flows; RimWorld lets you speed it); calendar persistence and how a
loaded save resumes the world clock; keeping it deterministic (the ONE wall-clock read stays the master-seed
mint — game-time is pure sim state, replay-safe).
**Pass when:** EARLY — alongside #14 (seamless world), because tick-tiers and the calendar are the same
substrate; several points above can't be fully designed until the clock's shape is fixed. Lightweight to
design, load-bearing to get right.

## 19. Ranged & projectile system — the shared substrate for guns, thrown, cannons, fruit shots
**Moat:** a ranged attack you can't dodge and don't have to aim is the cheapest thing in games. Done right,
ranged is a SKILL and a POSITIONING game — a musket line is terrifying at distance and helpless up close,
and a good shot LEADS a runner while a bad one whiffs into the sea. What exists today is a PLACEHOLDER:
`shape.swing === 'pistol'` resolves an instant HITSCAN CONE (`AbilitySystem.resolveHit` — a distance+angle
fan tested in one tick, no travelling object; fine for Gomu Pistol because a rubber arm genuinely IS
instant-reach, wrong for a lead ball). Cheap versions REFUSED: hitscan for real firearms (erases dodge +
aim skill); HOMING as the default (the bullet aiming itself removes all counterplay — reserved as a rare
exotic effect, e.g. a Devil-Fruit seeking shot, never a gun); "gun = melee with more range + more damage"
(no trade-off — violates the moat test + the NAVAL upgrade law).
**The shape (lean):**
- **Projectiles TRAVEL — one primitive, many defs.** A shot spawns a lightweight projectile ENTITY
  (transform + velocity + a `projectile` component: owner, damage payload, element/delivery tags for #16,
  lifespan) that moves each tick and resolves on CONTACT (circle-vs-body via SpatialQuery; circle-vs-grid
  for wall/structure stops — the two-layer collider already exists). ONE `ProjectileSystem`; gun bullets,
  thrown knives, cannonballs (#NAVAL), and Fruit ranged attacks are all `ProjectileDef`/`shape` ROWS on it
  (content-is-data, the melee-MOTIONS pattern). The muzzle FX becomes a real object, so `bullet_1.png` is
  the drawn projectile, not decoration.
- **Ballistics as a strategy row** (like swing motions): FLAT-FAST (musket — near-instant but still
  travels/dodgeable at range), SPREAD (blunderbuss — N pellets in a cone, per-pellet + falloff, murder up
  close, useless far), ARC (mortar/thrown — gravity-style drop, indirect over cover), HOMING (the reserved
  exotic). One `ballistics` field routes to the row; no engine branch per weapon.
- **AIM IS THE SKILL — leading, not homing.** The projectile flies a FIXED path; hitting a mover means
  aiming where they WILL BE (deflection). The sim is deterministic and knows exact velocities, so the
  PERFECT lead is computable — which makes it the AI difficulty dial: a skilled gunner gets the true
  intercept, a low-skill one a DEGRADED solution (the exact mechanism SAILING.md already designed for cannon
  AI — reuse it, don't reinvent). Player aim is hand-eye; the reticle already exists (`AimReticle`).
- **ACCURACY = ONE LIVE SPREAD CONE the situation opens and the player closes.** NOT several flags — model a
  single angle, `spread`, that eases toward a target each tick (the `1 - exp(-dt/tau)` form the codebase uses
  — frame-rate-independent, deterministic). `targetSpread = gunFloor + movePenalty + recoilKick`; the shot's
  actual angle is a seeded scatter within `spread` (replay-safe). Inputs, all WeaponDef data: the gun's
  `accuracy` FLOOR (musket tight, blunderbuss wide by design — a shot's own scatter can even reuse the
  ballistics SPREAD row); AIM-IN — held still, spread eases DOWN to the floor over `settleTime` (rewards
  patience, punishes panic-fire; the sniper's held breath); MOVEMENT — walk widens, sprint widens hard (the
  stop-to-shoot decision → positional play); RECOIL — jumps UP per shot, re-settles (pace your shots — the
  ranged mirror of stamina discipline). The CRAFT is the ASYMMETRY: spread BLOOMS instantly (move/fire →
  snaps wide now) but TIGHTENS slowly (earn accuracy back with stillness) — that's what makes it a skill, not
  a stat. HONESTY CONTRACT: every widener MUST show on the reticle (the cone visibly blooms/contracts) — an
  invisible accuracy input feels like the game cheating; a visible one is always fair, and it doubles as
  counterplay (a Haki/Observation reader sees an enemy's cone settling and breaks the lane before the shot).
- **RANGED SKILL UNLOCKS VERBS, NOT NUMBERS** (the SAILING skill-band rule at infantry scale). Skill dials
  the spread INPUTS, so a higher band can DO what a lower band physically can't — different playstyle, not a
  better dice roll: Recruit = plant-and-shoot only (moving sprays); Marksman = walk-and-shoot stays usable +
  faster settle; Sharpshooter = run-and-gun viable + fast recoil recovery; Deadeye = near-instant settle +
  gets the sim-PERFECT lead on movers + shrugs falloff; Legend = Observation pre-aim (shoot where they WILL
  dodge) + the cone barely blooms. Leading a mover well is a HIGH band on purpose (predicting the future is
  hard — a rookie who tries it whiffs). Skill = "how much of the true solution you're handed" — the cannon-AI
  mechanism, reused. TWO WINS: (1) it's the AI difficulty dial FOR FREE — a grunt Marine plants and sprays,
  a Vice Admiral's sharpshooter walks with you and leads your run, SAME weapon + code, only the AIProfile
  band differs (an enemy's threat IS its crew's competence); (2) skill and gun are INDEPENDENT axes (moat
  test #3 / NAVAL upgrade law) — a legend with a junk pistol can't out-range a musket (gun sets the floor), a
  rookie with a masterwork rifle still sprays it (skill sets what they can DO) — so a skilled fighter with a
  humble weapon beats a scrub with a great one.
- **GUN vs SWORD = a DISTANCE-WAR duel, and the tier ladder is the cool.** The fight is two fighters warring
  over the RANGE BAND: the gunner keeps the gap (where reload-time + lead-aim dominate), the swordsman
  COLLAPSES it (where the reload window is a death sentence). Coolness scales by tier as a ladder of VERBS,
  each an answer to the last (the anime arms-race feel — Mihawk/Rayleigh CUT the bullet): sword side —
  Rookie DODGES the shot → Skilled CLOSES the gap (dash/Geppo before reload) → Expert DEFLECTS/CUTS the
  bullet (a timed PARRY vs a projectile — COMBAT.md's parry retargeted, the substrate exists) → Legend
  Armament-cuts anything + Observation sees the shot coming; gun side answers each — leads perfectly, uses
  cover/angles, then Armament-coats ROUNDS so they can't just be cut, Observation-guided shots that lead the
  dodge (the counter-to-the-counter). No hard stat walls — every rung is a LEARNABLE answer (moat test #2/#3);
  all of it COMPOSES existing engines (parry, perception, #16 tags), never a new one.
- **REALISM VERDICT: grounded MECHANICS, tiered LETHALITY, fantastical CEILING.** Be realistic in the
  fundamentals (bullets travel + dodgeable, single-shot + punishing reload, blunderbuss deadly-close/useless-
  far, wet-powder misfire, finite ammo) — because the realism IS the fun: the reload/range limits are what
  CREATE the distance-war duel; remove them and gun-vs-sword collapses to raw DPS (the cheap thing). Be
  fantastical only at the CEILING (cut bullets, Haki rounds, instant-reload Fruits, island-spanning snipers)
  — high-tier techniques LAYERED on the realistic base, never replacing it (mundane rules, legendary
  exceptions — the contrast is what makes the exceptions feel legendary; it's how One Piece's own guns work).
  The ONE place realism is REJECTED: damage. Realistic guns one-shot people, which would gut tiers (a rookie
  musket kills a Yonko?) — so lethality stays TIER-SCALED (#16's harsh-reality wall: a bullet that guts
  fodder barely scratches an Armament-tier body). Realistic mechanics, tiered lethality.
- **RELOAD is the counterplay that balances range.** A musket's identity is one shot then a long, vulnerable
  reload window — that (not a damage nerf) is what stops ranged being strictly-better than melee, and what
  makes CLOSING THE DISTANCE the melee fighter's answer. Reload time / magazine / a load animation-lock live
  on the WeaponDef. This is the ranged mirror of stamina discipline (already shipped for melee).
- **AMMO + conditions = the economy/element hooks.** Powder + shot as inventory (ties #7 economy, the
  underworld note); wet-powder misfire ties #16 (water) + #18 (weather). Optional at v1 (a musket can ship
  ammo-less first), but the `projectile` payload should carry the tags so it's a data add later, not a
  rewrite.
**FIRST BUILD is teed up (art already made): `weapon.musket` — a flat-fast single-shot with a real reload.**
It wires in exactly like the sprite swords (`weapon/musket_1.png`, side-profile, muzzle +x; sprite rig +
`gripAt` already handle it) but its `primary` grants a RANGED ability that spawns a `bullet_1.png`
projectile instead of a swing. That one weapon proves the whole substrate end-to-end (projectile entity,
travel, contact resolve, reload, lead-able aim) at the smallest possible scope.
**Hard questions:** projectile-vs-body contact model (swept for fast bullets so they don't tunnel between
ticks at 60Hz — a real risk for a fast musket ball); how airborne/layer (#MOVEMENT_AIR) interacts (can you
shoot a Geppo flier? does a bullet have a layer?); friendly-fire (the current `canHarm` binary — a bullet
through your own crew? ties #C34 FF-reduction); cover/line-of-sight as a real mechanic (peeking, blind
lanes — feeds a future stealth/approach pass and the danger maps in PATHFINDING); how the projectile primitive stays ONE
system across the character scale (bullets) and the ship scale (cannonballs hitting hull structures) without
forking; whether reload interacts with the four combat layers (a Haki-coated shot? a Fruit that reloads
instantly?); the spread cone's exact input weights + `settleTime` per band (a feel-tune the developer owns —
land reasonable numbers + point at the knobs); how bullet-DEFLECT resolves (a parry TIMING window vs a
travelling entity — reflect / destroy / negate?, and does it need Observation to even attempt at low tier);
whether the reticle-tell for aim-in is readable ENOUGH to be fair counterplay without cluttering a busy
fight.
**Pass when:** SOON — it's small, the art exists, and it's the natural next combat-content pass after the
foundation pillar; also the shared substrate NAVAL cannons (SAILING impacts phase) and #16 (elemental
shots) both need, so designing it before those saves a refork.
