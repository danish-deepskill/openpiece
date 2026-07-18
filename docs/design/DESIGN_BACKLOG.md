# The Moat Map — systems that still need REAL design

> **Stage:** meta — THE queue of design passes + the already-designed ledger (the kanban view)

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
7. **No bosses (2026-07-18, developer-stated).** The corollary of "no player-shaped special cases," applied
   to enemies: no scripted boss encounters — no arenas, phase scripts, or health-gated plot armor. The
   terrifying people of the sea are CHARACTERS on the one engine (tier bands + Haki + INT are what make an
   Admiral an "Admiral fight"), which keeps possession, determinism, and multiplayer honest — you can flee
   them, ambush them, or one day BE them. (Emergent war-forms — COMBAT.md's mesh giants — are events, not
   scripts, and play by engine rules.) Any capture text that assumes bosses/dungeons as content anchors
   (e.g. PROGRESSION.md's EXP tiers) is invalidated on this point and must be re-sourced by its pass.
8. **Original cast in an inspired world (2026-07-18, developer-ratified).** No canon One Piece characters,
   no retold canon plot, no scripted "story mode" — three grounds: moat #1 (a campaign is a script and
   would need all the special-case machinery this engine refuses); the LEGAL line (systems vocabulary —
   fruits/haki/Marines/Yonko — is shared genre language; reproducing cast + plot crosses from homage into
   replication, and the free-fan-project posture depends on staying on this side); and scale (the sim
   stages its OWN Marineford-class era sagas via the director — unspoiled, yours). The homage lives in
   NICHE ECHOES: world-seed fills canon-shaped niches (the freezing admiral, the father-emperor, the lone
   greatest swordsman) with ORIGINAL names and faces — players fluent in the source feel the rhymes.
   "Story mode" translates to CHOSEN STARTS (#5's lean).

Already-designed ledger (passes DONE, don't re-open casually): sailing model + skill bands (`SAILING.md`),
ship classes as axes + upgrade law (`NAVAL.md`), seamless chunked sea (`WORLD.md` + `ARCHITECTURE_SCALE §5`),
movement frames + transition rulebook (`features/movement-frames.md`), pathfinding stack (`PATHFINDING.md`),
AI INT ladder (`ai/AI_INTELLIGENCE.md`), combat stamina/posture/parry direction (`COMBAT.md`),
time/calendar/day-night substrate (#18 → `TIME.md`, evidence `docs/research/TIME_RESEARCH.md`).

## The pass queue (2026-07-18 — the recommended order of the thinking)

1. **#21 items & inventory — first, and soon.** Small pass, everything downstream: #1 (provisions), #7
   (goods), #19 (ammo), and the 2026-07-18 decisions (rarity field, fruit vessels, blade grades) all need
   `ItemDef` vocabulary. The argument that won #18 its early slot, re-won.
2. **#1 crew — the named SAILING-grade pass, unchanged** — with one added duty: its loyalty / morale /
   recruitment surface must be designed as the EMBRYO of #17 (the shipped-embryo pattern — today's
   wander/alert FSM is the embryonic arbiter), so the later social pass generalizes it instead of
   colliding with it.
3. **#9 knowledge — jumped the queue.** The 2026-07-18 lean stacks draw checks on it from every side
   (fruit/copy identification, the counter-matrix learned in-world, luck's paper-trail-via-news, "the
   plate shows what your character knows", charts-as-items), and #1's navigator information axes feed
   straight into it. Runs right after crew, possibly overlapping.
4. **#6 bounty/heat — cheap promotion.** Already near pass-grade in this file; runs best on #9's heels
   (witness/news propagation is shared machinery).
5. **#4 + #5 together** (recorded: they define each other) — after the crew era, before Grand Line
   content. Both arrive mostly pre-run by the 2026-07-18 lean stacks; the pass assembles and judges.
6. **#8 the director** — after #9/#6 (it consumes news + knowledge machinery), now owing three new jobs:
   luck-weighted sampling, era sagas (moat #8), staged context (the chase-distraction pattern).
7. **#7 economy** — after #21 and #14's vocabulary (both exist now), ideally after #8 (traders react to
   events).
8. **Content-era passes when their eras arrive:** #10 world-gen (+ moat #8's niche echoes), #16, #19,
   #11, #12; #3 waits on crew by design; #13 stays deferred; #20 is content-triggered. Audio still needs
   a line someday; it is nobody's #1.

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
next SAILING-grade pass.** Added duty (2026-07-18, the queue): design the loyalty/morale/recruitment
surface as the EMBRYO of #17 — the social pass must be able to generalize it, not fight it. #21 (items)
runs first — provisions need its vocabulary.

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
**Lean (2026-07-18, developer decision) — ARTIFICIAL fruits solve density vs scarcity.** TRUE fruits stay
canon-scarce (one per kind in the world, rebirth on the eater's death, awakening-capable) — but MOST fruit
users in the world carry ARTIFICIAL copies (the science axis's crown work): deliberately inferior — reduced
magnitudes, a PARTIAL ability kit, and NO awakening, ever. One def family with a grade flag, never a second
engine (an artificial Gomu is the same rows, weaker numbers, fewer of them). COPY QUALITY VARIES BY MAKER
(2026-07-18 addendum — the craft-quality law: wherever a thing is MADE, the maker's skill is a quality
axis): a masterwork copy from a great lab approaches-but-never-reaches the true fruit; a back-alley copy
is weak or dangerously defective (canon's Vegapunk-dragon vs SMILE split) — which deepens the underworld
trade (WHAT grade of copy, and who vouches?). FRUIT INEQUALITY (2026-07-18) decomposes into three
mechanisms, never one "stronger" scalar: (a) MAGNITUDE SIBLINGS (Kilo→Ton — same ability rows via parent
inheritance, bigger numbers; honest because fruits are FOUND, not chosen off a menu — and the weaker
sibling's user hearing the stronger one re-manifested is a sim-generated quest); (b) ELEMENTAL DOMINANCE
(Mera<Magu — DIRECTIONAL matchup in #16's ladder, not global rank: magma beats fire, the sea still beats
magma); (c) FAMILY SCARCITY (Zoan→Ancient→Mythical — sub-family tags, power correlated with kind-scarcity).
No "god class": the apex is INDIVIDUAL NAMED singleton fruits (era-defining, tied to X-band holders) —
apex as content-with-names, the Supreme-Grade-blade pattern. One-fruit-for-life makes inequality poignant
not purchasable: your road up is MASTERY/awakening of what fate handed you. What it buys: a sea full of
fruit powers without cheapening the true fruit (meeting a full-kit user MEANS something — you're facing the
real one); copies as tradeable goods for #7/#6's underworld; and "is this fruit real?" as a purchasable
answer in #9's knowledge economy. The true fruit becomes a hunt-worthy apex item precisely BECAUSE the copy
exists.
**Lean (2026-07-18, sharpened in discussion) — RARITY exists as a standard def field; the ONE forbidden
wire is label→power.** `rarity: common | uncommon | rare | epic | legendary | mythical | divine` on defs
(the developer's ladder — all adjectives, deliberately). The cross-domain dial for spawn frequency
(world-gen), price (#7), and newsworthiness. `mythical` = world-tracked SINGLETONS (true fruits, Supreme
blades): one-of-a-kind, the world knows it — but the world holds a few DOZEN such artifacts. `divine` =
the WORLD-AXIS handful (1–5 per world): era-defining objects entangled with X-band holders — the apex
fruit, the world's one greatest blade; the director treats their movement as ERA events, not news items.
This lands the earlier "god fruit" instinct honestly: "god fruit" is the STREET NAME for a divine-rarity
fruit (fiction-side vocabulary, like "Mythical Zoan"), never a fruit class or field value. (NB: "Mythical
Zoan" the fruit FAMILY is a fiction-side name on a different axis — such fruits usually carry `mythical`
rarity, but family label ≠ rarity field.) The guard that
survives from the original refusal: the field NEVER grants stats (no +X%-because-rare; power lives on the
thing itself, so rarity↔strength correlation is EARNED in-fiction — a master forged it, the family is
potent), and no second color spine (tier bands own the colors), with rarity EXPRESSED per domain in its native vocabulary — weapons = the FIVE-STEP
GRADE ladder (2026-07-18, developer-chosen): **Ungraded → Graded → Skillful → Great → Supreme** (canon's
Wazamono shape with an honest floor). Grade is an IN-WORLD INSTITUTION, not a drop property: the upper
lists are FINITE AND NAMED (canon's counts — ~12 Supreme / 21 Great / 50 Skillful — adopt the pattern, tune
the numbers), so Supreme/Great blades are world-tracked uniques exactly like true fruits; grading is an ACT
(appraisers recognize a blade — which gives the smith career its endgame: forge your way ONTO the Skillful
list); and fame is the price (a Supreme blade on your hip is a theft target and a walking bounty poster).
GUARD: this ladder is the WEAPON domain's native scale only — stamping it onto fruits/styles/science
rebuilds the refused color ladder in a kimono; each domain keeps its own vocabulary; fruits = kind-scarcity (artificial
copies the common rung, true fruits one-per-kind; Logia rarer than Paramecia, Mythical Zoan the apex);
science = ACCESS-rarity (schematic + materials + the one engineer — #9's knowledge economy); styles =
TEACHER-rarity (who teaches it, whether they'll teach YOU). The label never grants power; the world's
scarcity does.
**Lean (2026-07) — the roster IS a substrate roadmap.** Pick the first ~12 fruits for MECHANICAL
ORTHOGONALITY, one new engine substrate each, so fruits 13–50 become def rows: Gomu (shipped — reach +
self-impulse) · Mera/Doku (persistent TILE state, #16) · Hie (runtime walkability rewrite) · Bari (player-
authored geometry → repath stress) · Doa (portals as content, PATHFINDING L2) · Moku (occlusion/perception)
· Ope (teleport vs intent commitment) · Zushi (remote impulse) · Noro (per-entity timescale) · Kage
(summons under a command scope) · Ito (control-writer theft — the Moat weaponized). Abilities are CHANNEL
composites (entity / body-continuous / world-tile) — the AI side needs only role tags + a targeting kind
(AI_FOUNDATION §12.3b), never per-fruit brains.
**Lean (2026-07-18) — DEPTH RIVALS BREADTH, by falsifiable promise.** Layer-count ≠ power. Mechanisms:
capped capability SPLITS across layers (mono-masters reach band-ceiling verbs hybrids never see); HAKI is
the equalizer (open to all, adversity-gated, UNCAPPED by layer count — Roger = sword + all three hakis at
the ceiling, Conqueror-coated steel as the apex depth technique); a fruit adds power AND attack surface
(sea, sea-stone, dominance tags — the pure master presents fewer exploitable tags). THE CANON TEST as
requirement: "the world's strongest swordsman holds no fruit" (Mihawk/Roger topology) must be PRODUCIBLE
by the engine — if a fruitless master can't reach the apex, the balance failed. THE INVERSE GUARD (same
date — why "everyone just masters haki" doesn't dominate): HAKI IS A MULTIPLIER, NOT A BASE — it needs a
discipline to express through (coated nothing is nothing; Roger = supreme SWORDSMANSHIP × supreme haki,
never haki alone); the road to haki runs THROUGH the layers (adversity-gated training must be SURVIVED —
your fruit/blade/style is the survival vehicle; the haki-only purist dies in the fight that would have
taught them); open-to-all ≠ reached-by-all (the haki population is a PYRAMID — Conqueror a threshold,
advanced tiers era-legend; a fruit pays out the day you eat it — real time-to-power economics); and at
the apex haki CANCELS (both sides coated + foresighted = entry fee, not edge) so layers differentiate
again — and layers own the VERBS (mobility, weather, terrain, doors) haki never grants. Haki: necessary
at the top, sufficient nowhere. THE FLOOR/CEILING LAW (same date — "does a second layer add raw power?"
YES, honestly): a fruit RAISES THE FLOOR and buys TEMPO (day-one payout, tier acceleration — WHY fruits
command their prices; denying this would falsify the fruit economy), but never the CEILING (top bands
unlock nonlinearly; haki multiplies the BASE, and a deep base out-multiplies shallow-base-plus-flat-grant)
— and the raw advantage is PURCHASED with attack surface (sea/sea-stone/dominance tags). Equal TIER
already normalizes the comparison: the dual-layer S arrived sooner and shallower, the mono S later and
deeper — same total, different shape. APEX STACKING (same date — "eat Seiryu AND hold Yoru?") is LEGAL,
PRICED, SELF-GATING: multi-layer apex builds are canon-correct (Kaido = fruit + weapon + haki — the
design SHOULD produce a Yonko when someone pays Yonko costs); artifacts multiply mastery, never replace
it (Yoru at a nobody's blade-depth is expensive iron; Kaido's unbreakable scales were fruit × HIS
mastery); and acquisition is the first gate — divine/mythical artifacts sit in apex hands, so assembling
the stacked build is a SAGA against era-powers (world-tracked artifacts also make the assembler the most
hunted person alive). Tools never substitute for mastery — they multiply it.
**Lean (2026-07-18) — FRUIT VESSELS: fruits can be fed to OBJECTS (science-gated technique).** The object
IS the eater (occupies the fruit's one-body slot); the wielder gets the abilities THROUGH the item —
still swims, may still eat their own fruit. The honest trade-off: an eaten fruit can never be taken; a
fruit-WEAPON leaves with the weapon (disarm/theft/loot = the only fruit-power transfer without a death) —
making fruit-vessels the most contested objects afloat (legendary/mythical rarity by nature). Zoan
vessels gain a WILL (semi-autonomous — near-unit behavior). The CRAFTING technique is guarded science
knowledge (#9), rarer than any single vessel.
**Lean (2026-07-18) — HYBRID BUILDS are free; synergy techniques are the reward.** Multi-layer fighters
(Kaku: Zoan + two-sword style; Chopper: fruit + style + science) cost the engine NOTHING — layers are
grant sources into one pool, so no combination needs code, and no exclusivity rules exist. What LIMITS
stacking is costs, never locks: capped use-based growth (breadth vs depth = identity, #5), one-fruit-for-
life, adversity-gated haki, cyborg-frame-as-body, finite loadout slots. Haki integrates ONCE with the
engine, never per-style: armament is a tagged coating on ANY strike (kick/blade/cyborg fist/fruit limb) —
the tag bypasses `logia.intangible` wherever it lands; advanced haki = higher-tier rows of the same
(emission, future-sight), still layer-generic. CROSS-LAYER SYNERGY TECHNIQUES = ability rows gated on TAG
COMBINATIONS (Kaku's giraffe-Rankyaku requires zoan-tag + blade-style-tag) — pure data, and knowledge-
economy content: rare techniques for rare combinations, learned in-world.
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
**World-ledger growth (the "world levels too" question, given its shape — 2026-07-18):** NPCs grow by the
SAME three currencies, sim-TIERED like everything else (#14): near = the real systems ticking (you can
literally watch the drills), far = a coarse growth tick computed from the same data (ambition, INT, duties,
training access). The two paths must RECONCILE — the follow test's long form: tail one marine for three
in-game years and the life you watched must land where the ledger would have put him (seeded determinism
makes that provable, not hoped). And not everyone climbs: ambition-as-data seeds a few RISERS per region
(the Supernova pattern) — most townsfolk stay townsfolk, which is realism, perf, AND drama; #6's nemesis
wants exactly a rival who rose while you did.
**Lean (2026-07-18) — CHOSEN STARTS answer both "story mode" and creation-time class (moat #8's
translation).** New game = pick an ORIGIN, Kenshi-shape: dockside orphan / marine recruit / disgraced
noble / freed captive / shipwreck survivor / … — each a shaped opening SITUATION (location, standing,
gear, relationships, a pull — never a quest script; the pull is a situation the sim maintains, not a
storyline). This also replaces the capture's weapon-class-at-creation (contradiction note #2): starts
grant CIRCUMSTANCES; class-identity comes later, from use. Ten starts, zero scripts — and the missing
"first screen" design (the earlier gap sweep) now has its shape.
**Lean (2026-07-18) — the capture's three-bucket scheme: taxonomy survives, "Points" die.** Three growth
FAMILIES are the right skeleton; the points mechanism (generic currency earned anywhere, spent anywhere)
IS the universal XP bar the moat refuses. One substitution everywhere: TRACKS THAT GROW BY THEIR OWN
EXERCISE, no spend step. Verdicts: HAKI points already dead (adversity-driven tracks, settled in #4);
ATTRIBUTES grow by living (exertion→endurance, hits→toughness, resisting fear→will), with LUCK innate
(settled) and SPIRITUAL needing a job to survive — PROPOSED: Willpower = mental RESISTANCE (fear/CC/
posture recovery) vs Spiritual = the HAKI WELLSPRING (capacity/recovery of the haki resource the three
tracks draw on) — without a distinct job, Spiritual is a similar-but-separated cut; SKILLS use-based and
capped (correct already) but the table must include SAILING (bands are canon — the model row) and likely
the COMBAT lines (Blades/Guns/Brawling — one law, one table, one cap policy for fishing AND
swordsmanship).
**Lean (2026-07-18) — LUCK is real, and it acts on the WORLD, never in the DUEL.** The Buggy decomposition:
half his "luck" is EMERGENT from systems we have — legend/power divergence compounding through news,
followers, and org misattribution (#6's "delicious when wrong"; Buggy is the PROOF CASE — if the sim can't
generate a Buggy, the divergence isn't brave enough). The other half is the LUCK STAT: a WEIGHT on the
event director + encounter/windfall sampling (what washes ashore near you, who docks today, whether your
disaster is the survivable kind) — implemented as bias on the SEEDED streams: deterministic, replay-safe,
no dice behind anyone's back. HARD REFUSAL: luck never rolls in combat (no crits, no lucky dodges —
combat honesty is a moat; a mid-fight "lucky break" is the DIRECTOR staging context, never the resolution
layer). Luck grants OPPORTUNITY, never outcome — it hands you the story; surviving it is still you.
Growth: innate (born/trait/race — "the sea favors some"), not use-trained; whether it stays one of the six
attributes is this pass's call, now with a defined job. JOURNEY GUARDS (same date): LOW luck = the world's
INDIFFERENCE, never targeted malice (no favor, cruel TIMING texture — but no doom spawns; the director
never hunts anyone) — the F− career is the DELIBERATE game (knowledge/work/mastery/legend are all
luck-independent: harder tempo, same ceiling); HIGH luck = the STORY-FLOOD (opportunity above your band,
faster than wisdom — over-gifting is the danger: windfalls paint unearned bullseyes, and the legend system
misreads coincidence as competence); and luck is SOCIAL — superstitious sailors follow visibly lucky
captains, so luck feeds legend/recruitment on its own. Same duel, same fight, always: luck waits outside
the circle. THE SAMPLE/DECIDE LAW (same date, from boundary cases): luck biases what the world SAMPLES
(hazard-phase alignment at your arrival, encounter/windfall tables, event scheduling, vacancy/audition
TIMING), never what its systems DECIDE (a commodore's pursue-vs-recall scoring, promotions — which run on
reports, and doing nothing files none — relations, combat resolution: all luck-proof; luck reaching into
another brain's scoring = hidden puppeteer, refused). Tracked singletons: luck picks among PLAUSIBLE
worlds, never edits history (a divine fruit rests where its causal chain left it; luck weights which
plausible resting place is near YOUR route). Corollary — every lucky break has a PAPER TRAIL (the recall
order, the sunk ship, the vacancy): an inspectable cause, discoverable via news, so fortune reads as the
world breaking your way, never the game cheating.
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
**Moat:** the information economy already designed for AI (`ai/AI_INTELLIGENCE.md`) gets its player-facing half.
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
**Moat:** openpiece.io — the same sim, server-authoritative. The STACK is settled (`DEEP_SIMULATION §7`);
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
opposition. And the org door swings both ways for CREWS (2026-07-18 sharpening): a pirate crew is an
`OrgDef` row like any other, so the player can SIGN ON under an NPC captain — the captain's orders land on
you as duties (#1's job model), compliance is WATCHED through the same sensors that watch any subordinate,
and refusal is read by the loyalty/morale + social machinery (#1/#17) that already powers mutiny: the
captain's trust of you is one ledger, the crew's collective morale (defiance is contagious) is another.
Enlist-and-climb, pirate-flavored — the rise can START on someone else's deck.
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
**DONE — `TIME.md` (2026-07-16 pass; evidence `docs/research/TIME_RESEARCH.md`).** Verdict: always-flowing
compressed time, one shared never-dilating rate; 24 real min/day (1 s = 1 game min — THE feel knob); tick
IS the clock; night acts through the sim (AI `nightSight`), never the screen; schedule SHAPE fixed
(priority-stack first-match + window-return for evaluate-don't-tick) for #1 to build; skip = self-
dehydration, deferred to #1's fatigue. Leans below kept for history; the doc's verdicts supersede.
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

## 20. SAILING 2.0 — currents + the structured sea (the umbrella pass; sailing 1.0 shipped 2026-07)
**Moat:** in One Piece canon the water moves MORE than the air: Grand Line navigation IS currents (Reverse
Mountain's mountain-climbing river, the Knock-Up Stream, Aqua Laguna, why a Log Pose outranks any map). A
sea where only wind pushes is half a sea — and currents are an information moat (chart knowledge, navigator
readings, "the strait pulls east at flood tide") that ordinary sailing games never build. Today water flow
exists ONLY as visuals (crest shimmer, wind streaks); no sim force. Wind reached the hull in 2026-07
(windage/leeway/fall-off) — the water itself still pushes nothing: not ships, not swimmers, not flotsam.
**Scope (the 2.0 umbrella — one ARCHITECTURAL pass, several content tracks):** the core move is making both
fields POSITION-STRUCTURED — `currentAt(x, y, t)` lands beside `windAt` gaining its regional octaves in the
same stroke, which unlocks the whole S-tier of the 2026-07 peer tier-list as one family: **wind shadow**
(islands + ships blocking wind — the weather gauge becomes real naval positioning), **wind funneling**
(channels between islands — chartable geography), **spatial gusts** (pressure patches to hunt), and
**currents/tides** (below). Satellites that RIDE 2.0 but keep their own homes: squalls/fronts (events
director), fog (a perception-system modifier), dead reckoning + Log Pose navigation (the navigator
knowledge pass, with crew), sailing audio (the audio pass), navigator commentary-as-coaching (knowledge
economy). Swimmer-sweep stays its own later pass (lethality/tone).
**Hard questions:** field shape (`currentAt(x, y, t)` — the evaluated-field twin of `windAt`; what makes it
POSITION-structured from day one where wind went global-first?); who reads it (hulls certainly; swimmers —
does a current sweep a Devil Fruit user to their death, the canonical terror of the sea?; drifting ships,
loot, message bottles); how it composes with windage in the velocity math (two shoves, one drift readout —
can the debug label attribute them?); navigation knowledge (does the navigator read SET AND DRIFT like wind
bands? are current CHARTS tradable items — the knowledge-is-power moat); tides (a clock-driven modulation —
ties #18 TIME's calendar; Aqua Laguna as a scheduled spike event); interaction with the chunked sea (#14 —
currents that span chunks must come from the field, not chunk state, or streaming tears them); Calm Belt
semantics (dead wind but ALIVE water? or dead both — what makes it crossable-but-scary); whether hazard
currents (whirlpools, the Knock-Up Stream) are field features or event-director spawns (lean: multiplied
onto the field's potential, the curl-noise rule the wind already recorded).
**Leans (peer-reviewed 2026-07 — a planner's review sharpened four of these):** the architecture answer is
already proven — a second pure field beside `windAt`, one more velocity term where windage lands,
evaluated-not-ticked so ledger/replay/forecast hold by construction; regional octaves are what the position
args were reserved for. Start global-zero + a few authored regional features (a strait, a gyre) rather than
noise — currents are GEOGRAPHY, not weather (elevate this maxim into SAILING.md when the pass lands).
- **ATTRIBUTION IS DESIGNED FIRST, not last** (the review's crux, accepted): drift already conflates carve +
  leeway; a third unexplained shove reads as "my boat just does something." Two separate visual tells from
  day one (wind streaks vs current-lines, different hue/depth) so players learn the CAUSES before the names
  — the canvas-belly lesson again; debug decomposes the drift number by source.
- **Swimmer-sweep is its OWN pass** (accepted): breath/drowning already exist, so "current touches swimmers"
  means "current can kill crew" — lethality/tone-testing, not physics. Base pass = field + hulls + flotsam.
- **Calm Belt = DEAD BOTH** (accepted; canon agrees — it's the CALM belt): its content is oars + Sea-King
  fear, not flow. "Alive water" was lore texture with no player decision behind it — cut.
- **Current-dominated irons recovery** (the review's addition, adopted): a stalled ship in a strong current
  is SWEPT, not just blown — one more term in the fall-off/windage seam, free mechanically, and it teaches
  "making leeway vs being set," the navigator's set-and-drift language.
**Pass when:** a CONTENT need wants a current (a ferry strait, a whirlpool encounter, the first Grand
Line-shaped region) — the field is deliberately chunk-independent, so #14 is NOT a real dependency (the
review caught the false bundling: both merely smelled like "big world"). An authored strait between today's
two islands could ship on the current architecture.

## 21. Items & inventory — the substrate half the passes assume (2026-07-18)
**Moat:** not itself a moat but a SUBSTRATE (the #18 TIME situation repeated): the rarity field (#4) needs
an `ItemDef` to live on; #7 trades goods; #2 consumes provisions; #19 counts powder and shot; #3's enemies
loot a downed body; #9's charts are ITEMS; #11 assembles parts; #4's fruit VESSELS are items with grant
lists, and graded/named blades are item IDENTITY. Cheap version refused: a generic loot-table + rarity-color
inventory screen.
**The shape (lean):** an `ItemDef` family (Registry, Definition-vs-Instance canon) with a TWO-TIER model —
FUNGIBLE COMMONS (def + count; a barrel of salt fish) vs TRACKED UNIQUES (instance ENTITIES with provenance
history — named blades, true fruits, fruit vessels: `mythical`+ rarity implies instance-tracking, which is
what "world-tracked" MEANS mechanically). Items can carry GRANTS (the Clima-Tact/vessel pattern — an item
is a grant source like any layer). Containers: body/pack/ship hold/warehouse as a uniform containment
relation; equipment slots reconcile with `bodies.ts`.
**Hard questions:** where exactly the commons/tracked boundary sits (does an `epic` blade get an instance?);
ownership & theft semantics (stolen goods as HEAT sensors — ties #6; fencing ties the underworld);
degradation/upkeep (ships already wear — do blades?); how far equipment slots go (armor? trinkets? the
Combat Potentials "posters" already exist as modifier bundles).
**Pass when:** EARLY — before #1 (provisions), #7 (goods), and #19 (ammo) need its vocabulary; lightweight
to design, load-bearing to get right (same argument that won #18 its early pass).
